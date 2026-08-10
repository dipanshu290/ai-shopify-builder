import type { ExportPage } from './types';
import type { SectionSetting, ShopifySectionSpec } from '@/lib/ai/schema';

/**
 * HTML → Shopify Liquid conversion helpers (AGENTS.md §10). Deterministic and
 * browser-side: each generated page is split into its builder sections, and each
 * section becomes a real `sections/*.liquid` file with a `{% schema %}` block so
 * it is editable in the Shopify Theme Editor. The static markup is wrapped in
 * `{% raw %}` so any literal `{{`/`{%` in AI-authored copy can never be parsed as
 * Liquid — the section renders exactly what was designed.
 *
 * We intentionally keep per-section settings minimal for v1 (theme-level design
 * settings live in config/settings_schema.json); the goal is a valid, uploadable
 * theme, not exhaustive per-text setting extraction.
 */

/** Shopify handle: lowercase, alphanumeric + single hyphens, never empty. */
export function slugify(text: string, fallback = 'section'): string {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || fallback;
}

/** Title-case a slug for human-facing section/schema names. */
export function titleize(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface BuilderSection {
  /** Slug from data-builder-section-id (or a synthesized one). */
  id: string;
  /** data-builder-section-type, if present. */
  kind: string;
  html: string;
}

function makeUniqueId(seen: Map<string, number>, base: string, fallback: string): string {
  let id = slugify(base, fallback);
  const count = seen.get(id) ?? 0;
  seen.set(id, count + 1);
  if (count > 0) id = `${id}-${count + 1}`;
  return id;
}

function sectionFromElement(
  el: Element,
  index: number,
  seen: Map<string, number>,
  fallbackPrefix: string
): BuilderSection {
  const builderId = el.getAttribute('data-builder-section-id');
  const firstClass = el.getAttribute('class')?.trim().split(/\s+/)[0] ?? '';
  const tagName = el.tagName.toLowerCase();
  const base =
    builderId || firstClass || (tagName !== 'section' ? tagName : '') || `${fallbackPrefix}-${index + 1}`;
  const id = makeUniqueId(seen, base, `${fallbackPrefix}-${index + 1}`);
  const kind = slugify(el.getAttribute('data-builder-section-type') || id, id);
  return { id, kind, html: el.outerHTML };
}

/**
 * Split a page body into Shopify sections — one per top-level element, in order,
 * so NOTHING is lost (a header/footer the model emits without a builder id still
 * becomes its own section). A builder section id is used when present; otherwise
 * an id is derived from the tag/class. Falls back to a single "main" section when
 * DOMParser is unavailable or the markup has no element children.
 */
export function splitIntoSections(html: string): BuilderSection[] {
  if (typeof DOMParser === 'undefined') {
    return [{ id: 'main', kind: 'main', html }];
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  } catch {
    return [{ id: 'main', kind: 'main', html }];
  }

  const children = Array.from(doc.body.children);
  if (children.length === 0) {
    const body = doc.body.innerHTML.trim();
    return [{ id: 'main', kind: 'main', html: body || html }];
  }

  const seen = new Map<string, number>();
  let rootElements = children;

  // If the page is wrapped in a single shell div/main, split that shell into
  // sibling regions so header/content/footer all export separately.
  if (children.length === 1) {
    const wrapperChildren = Array.from(children[0].children);
    if (wrapperChildren.length > 1) {
      rootElements = wrapperChildren;
    }
  }

  // If we still only have one region, but the page contains builder sections
  // nested under one shared parent, export all of that parent's children rather
  // than only the elements that already have builder ids.
  if (rootElements.length <= 1) {
    const nestedBuilderSections = Array.from(
      doc.body.querySelectorAll('[data-builder-section-id]')
    ).filter((el) => !el.parentElement?.closest('[data-builder-section-id]'));

    if (nestedBuilderSections.length > 0) {
      const sharedParent = nestedBuilderSections[0]?.parentElement;
      const sameParent =
        !!sharedParent &&
        nestedBuilderSections.every((el) => el.parentElement === sharedParent) &&
        sharedParent.children.length > 1;

      if (sameParent) {
        rootElements = Array.from(sharedParent.children);
      } else {
        rootElements = nestedBuilderSections;
      }
    }
  }

  return rootElements.map((el, index) =>
    sectionFromElement(
      el,
      index,
      seen,
      el.hasAttribute('data-builder-section-id') ? 'section' : 'block'
    )
  );
}

/** Collect distinct absolute image URLs referenced by a chunk of HTML. */
export function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /<img\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = (m[2] ?? m[3] ?? '').trim();
    if (/^https?:\/\//i.test(src)) urls.add(src);
  }
  return Array.from(urls);
}

/**
 * Make static HTML safe to embed inside a Liquid section: strip any nested
 * raw-tag markers (so our own wrapper can't be closed early), then wrap in
 * `{% raw %}` so no `{{ }}` / `{% %}` in the content is ever evaluated.
 */
function rawWrap(html: string): string {
  const safe = html.replace(/\{%-?\s*(end)?raw\s*-?%\}/gi, '');
  return `{% raw %}\n${safe.trim()}\n{% endraw %}`;
}

/** The `{% schema %}` block for a converted section (valid JSON, with a preset). */
export function sectionSchema(name: string): string {
  const schema = {
    name: name.slice(0, 25) || 'Section',
    tag: 'section',
    class: 'shopify-section',
    settings: [],
    presets: [{ name: name.slice(0, 25) || 'Section' }],
  };
  return `{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}`;
}

export interface ConvertedSection {
  /** Unique section type across the whole theme (the file basename). */
  type: string;
  /** Instance id used inside the template JSON `sections`/`order`. */
  instanceId: string;
  fileName: string;
  liquid: string;
}

export interface TemplateSectionReference {
  instanceId: string;
  type: string;
}

/**
 * AI-converted designed content passed into the theme builder: one shared,
 * editable header/footer reused across every template, plus each designed page's
 * body sections in document order. `null` header/footer falls back to the
 * deterministic block-based theme header/footer.
 */
export interface ConvertedContent {
  header: ConvertedSection | null;
  footer: ConvertedSection | null;
  bodies: Record<string, ConvertedSection[]>;
}

/**
 * Convert one page into its ordered list of Shopify sections. `type` is prefixed
 * with the page key so sections from different pages never collide as filenames.
 */
export function convertPageToSections(page: ExportPage): ConvertedSection[] {
  const pageSlug = slugify(page.key, 'page');
  const sections = splitIntoSections(page.html);

  return sections.map((section) => {
    const type = `${pageSlug}-${section.id}`;
    const name = titleize(`${pageSlug} ${section.id}`);
    const liquid = `${rawWrap(section.html)}\n\n${sectionSchema(name)}\n`;
    return {
      type,
      instanceId: section.id.replace(/[^a-z0-9_]/g, '_'),
      fileName: `sections/${type}.liquid`,
      liquid,
    };
  });
}

/* ------------------------------------------------------------------ *
 * AI section conversion (AGENTS.md §10)
 * The designed pages are split into finer regions than convertPageToSections,
 * each region is sent to the AI to become a real editable section, and the
 * model's structured spec is assembled here into a valid `{% schema %}` section.
 * Everything below is deterministic and browser-safe (type-only AI import).
 * ------------------------------------------------------------------ */

export type RegionRole = 'header' | 'footer' | 'content';

export interface PageRegion {
  role: RegionRole;
  /** Stable slug id for the region within its page. */
  id: string;
  kind: string;
  html: string;
}

/** Sectioning tags treated as their own region (never split further). */
const REGION_TAGS = new Set(['section', 'article', 'header', 'footer', 'nav', 'aside']);
/** Pure layout wrappers we descend through to find the real regions inside. */
const WRAPPER_TAGS = new Set(['div', 'main', 'body']);

/** Classify a region as the store header, footer, or page content (by SEMANTICS
 * only — tag or builder-section-type — never by arbitrary class names, which
 * would misfile a content section that merely mentions "header"/"footer"). */
function roleOf(el: Element): RegionRole {
  const tag = el.tagName.toLowerCase();
  if (tag === 'header' || tag === 'nav') return 'header';
  if (tag === 'footer') return 'footer';
  const type = (
    el.getAttribute('data-builder-section-type') ||
    el.getAttribute('data-builder-section-id') ||
    ''
  ).toLowerCase();
  if (type === 'header' || type === 'nav' || type === 'navbar' || type.includes('site-header')) {
    return 'header';
  }
  if (type === 'footer' || type.includes('site-footer')) return 'footer';
  return 'content';
}

/** Does this subtree contain any real section-like region to descend toward? */
function hasRegionDescendant(el: Element): boolean {
  return el.querySelector('[data-builder-section-id], section, article, header, footer, nav') != null;
}

/**
 * Walk the page and collect real section-like regions through ANY wrapper
 * nesting: an element that carries a builder-section-id or is a sectioning tag is
 * taken whole (never split into its columns); a generic wrapper (`<div>`/`<main>`)
 * that merely holds sections is descended into. This is robust to the common
 * pattern where sections are nested inside container `<div>`s — the old one-level
 * flatten collapsed those into a single blob.
 */
function collectRegions(parent: Element, out: Element[]): void {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();
    if (child.hasAttribute('data-builder-section-id') || REGION_TAGS.has(tag)) {
      out.push(child);
    } else if (WRAPPER_TAGS.has(tag) && hasRegionDescendant(child)) {
      collectRegions(child, out);
    } else {
      // A leaf content block (a div with no nested sections) — keep it whole.
      out.push(child);
    }
  }
}

/**
 * Split a page into classified regions so hero / features / testimonials / CTA
 * each become their own section, and header/footer are tagged so the export can
 * share ONE header/footer across templates.
 */
export function splitPageRegions(html: string): PageRegion[] {
  if (typeof DOMParser === 'undefined') {
    return [{ role: 'content', id: 'main', kind: 'main', html }];
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  } catch {
    return [{ role: 'content', id: 'main', kind: 'main', html }];
  }

  if (doc.body.children.length === 0) {
    const body = doc.body.innerHTML.trim();
    return [{ role: 'content', id: 'main', kind: 'main', html: body || html }];
  }

  const collected: Element[] = [];
  collectRegions(doc.body, collected);

  const seen = new Map<string, number>();
  const regions = collected
    .filter((el) => (el.textContent ?? '').trim().length > 0 || el.querySelector('img') != null)
    .map((el, index) => {
      const s = sectionFromElement(el, index, seen, 'section');
      return { role: roleOf(el), id: s.id, kind: s.kind, html: s.html };
    });

  // Never return nothing — fall back to the whole body as one content region.
  if (regions.length === 0) {
    return [{ role: 'content', id: 'main', kind: 'main', html: doc.body.innerHTML.trim() || html }];
  }
  return regions;
}

/**
 * One image pulled out of a region before AI conversion. We never send image
 * URLs through the model (LLMs corrupt long URLs); instead each `<img>` is
 * replaced by a token the model must keep in place, and the real image is
 * injected back afterwards — shown by default, overridable via an image picker.
 */
export interface ImageSlot {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  className: string;
}

/** Marker text swapped in for each image before the HTML goes to the model. */
function imageToken(index: number): string {
  return `%%IMG${index}%%`;
}

/**
 * Replace every remote `<img>` in a region with a placeholder token and return
 * the token'd HTML plus the extracted image slots (in order). Non-remote images
 * (data:/relative) are left untouched. Browser-only; a no-op without DOMParser.
 */
export function tokenizeImages(html: string): { html: string; slots: ImageSlot[] } {
  if (typeof DOMParser === 'undefined') return { html, slots: [] };
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  } catch {
    return { html, slots: [] };
  }

  const slots: ImageSlot[] = [];
  for (const img of Array.from(doc.body.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') || '').trim();
    if (!/^https?:\/\//i.test(src)) continue; // keep placeholders/data URIs inline
    slots.push({
      src,
      alt: img.getAttribute('alt') || '',
      width: img.getAttribute('width') || undefined,
      height: img.getAttribute('height') || undefined,
      className: img.getAttribute('class') || '',
    });
    img.replaceWith(doc.createTextNode(imageToken(slots.length - 1)));
  }

  return { html: doc.body.innerHTML, slots };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Liquid for one image slot: the generated image by default, picker override. */
function imageSlotLiquid(id: string, slot: ImageSlot): string {
  const cls = slot.className || 'h-auto w-full object-cover';
  const clsLiquid = cls.replace(/'/g, '');
  const altLiquid = slot.alt.replace(/'/g, '');
  const dims = `${slot.width ? ` width="${escapeAttr(slot.width)}"` : ''}${slot.height ? ` height="${escapeAttr(slot.height)}"` : ''}`;
  return (
    `{% if section.settings.${id} != blank %}` +
    `{{ section.settings.${id} | image_url: width: 1600 | image_tag: loading: 'lazy', class: '${clsLiquid}', alt: '${altLiquid}' }}` +
    `{% else %}` +
    `<img src="${escapeAttr(slot.src)}" alt="${escapeAttr(slot.alt)}" class="${cls}" loading="lazy"${dims}>` +
    `{% endif %}`
  );
}

/**
 * Inject the extracted images back into an AI-converted section: replace each
 * `%%IMGn%%` token with real image Liquid and append an image_picker setting per
 * slot so the merchant can swap it. Returns the new spec and how many images were
 * actually placed (0 with slots present signals the model dropped the tokens →
 * caller falls back to a raw section so assets are never lost).
 */
export function applyImageSlots(
  spec: ShopifySectionSpec,
  slots: ImageSlot[]
): { spec: ShopifySectionSpec; injected: number } {
  if (slots.length === 0) return { spec, injected: 0 };

  let liquid = spec.liquid;
  let injected = 0;
  const usedIds = new Set(spec.settings.map((s) => s.id));
  const extraSettings: SectionSetting[] = [];

  slots.forEach((slot, index) => {
    const token = new RegExp(`%%\\s*IMG${index}\\s*%%`, 'g');
    if (!token.test(liquid)) return;
    let id = `image_${index + 1}`;
    while (usedIds.has(id)) id = `img_${id}`;
    usedIds.add(id);
    liquid = liquid.replace(new RegExp(`%%\\s*IMG${index}\\s*%%`, 'g'), () => imageSlotLiquid(id, slot));
    extraSettings.push({ type: 'image_picker', id, label: `Image ${index + 1}` });
    injected += 1;
  });

  // Drop any tokens the model kept but we couldn't map (shouldn't happen).
  liquid = liquid.replace(/%%\s*IMG\d+\s*%%/g, '');

  return { spec: { ...spec, liquid, settings: [...spec.settings, ...extraSettings] }, injected };
}

/** Strip anything unsafe from AI-authored section markup, keeping the Liquid. */
function sanitizeSectionLiquid(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    // Drop any {% schema %} the model included — we build our own from the spec.
    .replace(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/gi, '')
    .trim();
}

/** Quick Liquid sanity check — unbalanced tags mean we fall back to raw. */
export function liquidLooksBalanced(markup: string): boolean {
  const count = (re: RegExp) => (markup.match(re) || []).length;
  const pairs: Array<[RegExp, RegExp]> = [
    [/\{%-?\s*if\b/gi, /\{%-?\s*endif\b/gi],
    [/\{%-?\s*for\b/gi, /\{%-?\s*endfor\b/gi],
    [/\{%-?\s*paginate\b/gi, /\{%-?\s*endpaginate\b/gi],
    [/\{%-?\s*unless\b/gi, /\{%-?\s*endunless\b/gi],
    [/\{%-?\s*case\b/gi, /\{%-?\s*endcase\b/gi],
    [/\{%-?\s*form\b/gi, /\{%-?\s*endform\b/gi],
    [/\{%-?\s*raw\b/gi, /\{%-?\s*endraw\b/gi],
  ];
  for (const [open, close] of pairs) {
    if (count(open) !== count(close)) return false;
  }
  return count(/\{\{/g) === count(/\}\}/g) && count(/\{%/g) === count(/%\}/g);
}

/** Map an AI setting to a Shopify-valid schema setting (coerces unsafe shapes). */
function normalizeSetting(s: SectionSetting): Record<string, unknown> {
  const base: Record<string, unknown> = { id: s.id, label: s.label };
  if (s.info) base.info = s.info;

  switch (s.type) {
    case 'range': {
      const min = typeof s.min === 'number' ? s.min : 0;
      const max = typeof s.max === 'number' ? s.max : 100;
      const step = typeof s.step === 'number' && s.step > 0 ? s.step : 1;
      if (max <= min) {
        return { ...base, type: 'number', ...(typeof s.default === 'number' ? { default: s.default } : {}) };
      }
      const def = Math.min(max, Math.max(min, typeof s.default === 'number' ? s.default : min));
      return { ...base, type: 'range', min, max, step, ...(s.unit ? { unit: s.unit } : {}), default: def };
    }
    case 'select': {
      if (!s.options || s.options.length === 0) {
        return { ...base, type: 'text', ...(typeof s.default === 'string' ? { default: s.default } : {}) };
      }
      const values = new Set(s.options.map((o) => o.value));
      const def = typeof s.default === 'string' && values.has(s.default) ? s.default : s.options[0].value;
      return { ...base, type: 'select', options: s.options, default: def };
    }
    case 'checkbox':
      return { ...base, type: 'checkbox', default: typeof s.default === 'boolean' ? s.default : false };
    case 'number':
      return { ...base, type: 'number', ...(typeof s.default === 'number' ? { default: s.default } : {}) };
    case 'color': {
      const valid = typeof s.default === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.default);
      return { ...base, type: 'color', ...(valid ? { default: s.default } : {}) };
    }
    case 'richtext': {
      let def = typeof s.default === 'string' ? s.default.trim() : '';
      if (def && !def.startsWith('<')) def = `<p>${def}</p>`;
      return { ...base, type: 'richtext', ...(def ? { default: def } : {}) };
    }
    case 'image_picker':
    case 'url':
      // Shopify rejects arbitrary defaults on these — omit them.
      return { ...base, type: s.type };
    case 'html':
    case 'text':
    case 'textarea':
    default: {
      const out: Record<string, unknown> = { ...base, type: s.type };
      if (typeof s.default === 'string') out.default = s.default;
      if (s.placeholder) out.placeholder = s.placeholder;
      return out;
    }
  }
}

/** Build a valid section `{% schema %}` object from the AI spec. */
function buildSectionSchema(spec: ShopifySectionSpec): Record<string, unknown> {
  const name = spec.name.slice(0, 24) || 'Section';
  const blocks = spec.blocks.map((b) => ({
    type: b.type,
    name: b.name.slice(0, 40),
    settings: b.settings.map(normalizeSetting),
  }));

  const schema: Record<string, unknown> = {
    name,
    tag: 'section',
    class: 'shopify-section',
    settings: spec.settings.map(normalizeSetting),
  };
  if (blocks.length > 0) {
    schema.blocks = blocks;
    schema.max_blocks = spec.maxBlocks ?? 20;
  }
  schema.presets = [
    {
      name,
      ...(blocks.length > 0 ? { blocks: blocks.map((b) => ({ type: b.type })) } : {}),
    },
  ];
  return schema;
}

/** Assemble a full section file (sanitized markup + generated schema) from a spec. */
export function assembleSectionFromSpec(spec: ShopifySectionSpec): string {
  const markup = sanitizeSectionLiquid(spec.liquid);
  const schema = buildSectionSchema(spec);
  return `${markup}\n\n{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}\n`;
}

/** True when the AI spec produces balanced Liquid we can safely export. */
export function specIsSafeToExport(spec: ShopifySectionSpec): boolean {
  return liquidLooksBalanced(sanitizeSectionLiquid(spec.liquid));
}

/** The deterministic raw-wrapped fallback used when AI conversion is unavailable. */
export function rawSectionLiquid(html: string, name: string): string {
  return `${rawWrap(html)}\n\n${sectionSchema(name)}\n`;
}

/** Wrap a section's liquid body into a ConvertedSection with a unique file type. */
export function makeConvertedSection(type: string, liquid: string): ConvertedSection {
  const safeType = slugify(type, 'section');
  return {
    type: safeType,
    instanceId: safeType.replace(/-/g, '_'),
    fileName: `sections/${safeType}.liquid`,
    liquid,
  };
}

/** Map a page to its Shopify template base name (without the .json extension). */
export function templateBaseName(page: ExportPage): string {
  const key = slugify(page.key, 'page');
  switch (page.type) {
    case 'home':
      return 'index';
    case 'product':
      return 'product';
    case 'collection':
      return 'collection';
    case 'cart':
      return 'cart';
    // checkout can't be a standard template; export it as a normal page template.
    case 'checkout':
    case 'custom':
    default:
      return `page.${key}`;
  }
}

/** Build the JSON template body that wires a page's sections together. */
export function buildTemplateJson(sections: ConvertedSection[]): string {
  return buildTemplateJsonFromReferences(
    sections.map((section) => ({ instanceId: section.instanceId, type: section.type }))
  );
}

export function buildTemplateJsonFromReferences(sections: TemplateSectionReference[]): string {
  const order: string[] = [];
  const map: Record<string, { type: string; settings: Record<string, never> }> = {};
  const seen = new Map<string, number>();

  for (const section of sections) {
    let id = section.instanceId || 'section';
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}_${count + 1}`;
    map[id] = { type: section.type, settings: {} };
    order.push(id);
  }

  return JSON.stringify({ sections: map, order }, null, 2);
}
