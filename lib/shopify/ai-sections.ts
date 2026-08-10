import { shopifySectionSpecSchema, type ShopifySectionRequestItem } from '@/lib/ai/schema';
import {
  applyImageSlots,
  assembleSectionFromSpec,
  makeConvertedSection,
  rawSectionLiquid,
  slugify,
  specIsSafeToExport,
  splitPageRegions,
  titleize,
  tokenizeImages,
  type ConvertedContent,
  type ConvertedSection,
  type ImageSlot,
  type PageRegion,
} from './liquid';
import type { ExportPage } from './types';

/**
 * Client-side AI section conversion (AGENTS.md §10). Splits each designed page
 * into regions, asks the server (`/api/shopify/sections`, where the AI keys live)
 * to turn each region into a real, editable Shopify section, and assembles the
 * results — with a graceful raw-section fallback per region when a conversion
 * fails. Header/footer are converted ONCE and shared across every template so the
 * whole theme stays consistent. Progress is reported per region so the export
 * dialog can show real progress instead of cosmetic ticks.
 */

/** Page types whose designed content we turn into AI sections. */
const DESIGNED_TYPES = new Set(['home', 'custom', 'checkout']);

const HEADER_REF = '__shared__:header';
const FOOTER_REF = '__shared__:footer';

export interface AiConversionProgress {
  processed: number;
  total: number;
}

export interface AiConversionResult extends ConvertedContent {
  stats: { total: number; ai: number; fallback: number };
}

export interface ConvertPagesInput {
  pages: ExportPage[];
  brandName: string;
  styleGuide?: string | null;
  onProgress?: (progress: AiConversionProgress) => void;
  signal?: AbortSignal;
}

function homeFirst(a: ExportPage, b: ExportPage): number {
  return (a.type === 'home' ? 0 : 1) - (b.type === 'home' ? 0 : 1);
}

/** Read an NDJSON body line by line, yielding each parsed JSON object. */
async function* readNdjson(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        try {
          yield JSON.parse(line) as Record<string, unknown>;
        } catch {
          // Ignore malformed lines.
        }
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
}

/**
 * Convert the project's designed pages into AI-authored Shopify sections. Returns
 * a shared header/footer plus each designed page's ordered body sections. Never
 * throws for a single failed region — that region falls back to a raw section.
 */
export async function convertPagesWithAI(input: ConvertPagesInput): Promise<AiConversionResult> {
  const { pages, brandName, styleGuide, onProgress, signal } = input;

  // 1. Split every page once and cache the regions.
  const regionsByKey = new Map<string, PageRegion[]>();
  for (const page of pages) {
    regionsByKey.set(page.key, splitPageRegions(page.html));
  }

  // 2. Pick ONE shared header/footer source (prefer the home page).
  const ordered = [...pages].sort(homeFirst);
  let headerSource: { page: ExportPage; region: PageRegion } | null = null;
  let footerSource: { page: ExportPage; region: PageRegion } | null = null;
  for (const page of ordered) {
    const regions = regionsByKey.get(page.key) ?? [];
    if (!headerSource) {
      const h = regions.find((r) => r.role === 'header');
      if (h) headerSource = { page, region: h };
    }
    if (!footerSource) {
      const f = regions.find((r) => r.role === 'footer');
      if (f) footerSource = { page, region: f };
    }
  }

  // 3. Collect the content regions of each designed page (in document order).
  const contentPages = pages.filter((p) => DESIGNED_TYPES.has(p.type));
  const bodyPlan = contentPages.map((page) => ({
    page,
    regions: (regionsByKey.get(page.key) ?? []).filter((r) => r.role === 'content'),
  }));

  // 4. Build the request: shared header + footer + all content regions. Each
  // region's images are tokenized out (kept in `slotsByRef`) so URLs never pass
  // through the model — they're injected back after conversion.
  const items: ShopifySectionRequestItem[] = [];
  const slotsByRef = new Map<string, ImageSlot[]>();

  const pushItem = (
    ref: string,
    page: ExportPage,
    role: 'header' | 'footer' | 'content',
    region: PageRegion
  ) => {
    const { html, slots } = tokenizeImages(region.html);
    slotsByRef.set(ref, slots);
    items.push({
      ref,
      pageKey: page.key,
      pageType: page.type,
      pageLabel: page.label,
      role,
      kind: region.kind,
      html,
    });
  };

  if (headerSource) pushItem(HEADER_REF, headerSource.page, 'header', headerSource.region);
  if (footerSource) pushItem(FOOTER_REF, footerSource.page, 'footer', footerSource.region);
  for (const { page, regions } of bodyPlan) {
    for (const region of regions) {
      pushItem(`content:${page.key}:${region.id}`, page, 'content', region);
    }
  }

  const total = items.length;

  // Nothing to convert (e.g. only dynamic product/collection pages) — let the
  // caller fall back to the deterministic header/footer entirely.
  if (total === 0) {
    return { header: null, footer: null, bodies: {}, stats: { total: 0, ai: 0, fallback: 0 } };
  }

  // 5. Call the server route and collect specs per ref (progress as they land).
  const specByRef = new Map<string, unknown>();
  let processed = 0;

  const res = await fetch('/api/shopify/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandName, styleGuide: styleGuide ?? undefined, sections: items }),
    signal,
  });
  if (!res.ok || !res.body) {
    // Whole-request failure (e.g. AI provider unavailable): don't fail the
    // export — fall back to raw sections for every region.
    return assemble(specByRef, slotsByRef, headerSource, footerSource, bodyPlan, total);
  }

  for await (const evt of readNdjson(res.body)) {
    const type = evt.type;
    if (type === 'section' && typeof evt.ref === 'string') {
      specByRef.set(evt.ref, evt.spec);
      processed += 1;
      onProgress?.({ processed, total });
    } else if (type === 'section_error' && typeof evt.ref === 'string') {
      processed += 1;
      onProgress?.({ processed, total });
    }
  }

  return assemble(specByRef, slotsByRef, headerSource, footerSource, bodyPlan, total);
}

/**
 * Turn a region + (maybe) an AI spec into a ConvertedSection. Injects the
 * region's extracted images back into the AI markup. Falls back to a raw section
 * — which keeps the original `<img>` tags — when the AI output is missing, has
 * unbalanced Liquid, or dropped the image tokens (so assets are never lost).
 */
function convertRegion(
  type: string,
  name: string,
  region: PageRegion,
  rawSpec: unknown,
  slots: ImageSlot[]
): { section: ConvertedSection; fromAI: boolean } {
  const parsed = shopifySectionSpecSchema.safeParse(rawSpec);
  if (parsed.success) {
    const { spec, injected } = applyImageSlots(parsed.data, slots);
    const keptImages = slots.length === 0 || injected > 0;
    if (keptImages && specIsSafeToExport(spec)) {
      return { section: makeConvertedSection(type, assembleSectionFromSpec(spec)), fromAI: true };
    }
  }
  return { section: makeConvertedSection(type, rawSectionLiquid(region.html, name)), fromAI: false };
}

function assemble(
  specByRef: Map<string, unknown>,
  slotsByRef: Map<string, ImageSlot[]>,
  headerSource: { page: ExportPage; region: PageRegion } | null,
  footerSource: { page: ExportPage; region: PageRegion } | null,
  bodyPlan: Array<{ page: ExportPage; regions: PageRegion[] }>,
  total: number
): AiConversionResult {
  let ai = 0;
  let fallback = 0;
  const tally = (fromAI: boolean) => (fromAI ? (ai += 1) : (fallback += 1));

  let header: ConvertedSection | null = null;
  if (headerSource) {
    const r = convertRegion(
      'header',
      'Header',
      headerSource.region,
      specByRef.get(HEADER_REF),
      slotsByRef.get(HEADER_REF) ?? []
    );
    header = r.section;
    tally(r.fromAI);
  }

  let footer: ConvertedSection | null = null;
  if (footerSource) {
    const r = convertRegion(
      'footer',
      'Footer',
      footerSource.region,
      specByRef.get(FOOTER_REF),
      slotsByRef.get(FOOTER_REF) ?? []
    );
    footer = r.section;
    tally(r.fromAI);
  }

  const bodies: Record<string, ConvertedSection[]> = {};
  for (const { page, regions } of bodyPlan) {
    const sections: ConvertedSection[] = [];
    for (const region of regions) {
      const pageSlug = slugify(page.key, 'page');
      const type = `${pageSlug}-${region.id}`;
      const name = titleize(region.kind || region.id);
      const ref = `content:${page.key}:${region.id}`;
      const r = convertRegion(type, name, region, specByRef.get(ref), slotsByRef.get(ref) ?? []);
      sections.push(r.section);
      tally(r.fromAI);
    }
    bodies[page.key] = sections;
  }

  return { header, footer, bodies, stats: { total, ai, fallback } };
}
