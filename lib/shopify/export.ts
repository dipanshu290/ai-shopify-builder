import { saveExport, type ThemeExportRow } from '@/lib/exports';
import { SHOPIFY_THEME_VERSION, VENDORED_TAILWIND_PATH } from './config';
import { buildThemeFiles } from './theme-files';
import { validateTheme } from './validate';
import { createZip } from './zip';
import { uploadThemeZip } from './storage';
import { slugify } from './liquid';
import { convertPagesWithAI } from './ai-sections';
import type { ExportPage, ExportProgress, ExportStepId } from './types';

/**
 * Client-side orchestrator for "Export to Shopify" (AGENTS.md §10/§11). Converts
 * the project's saved pages into a full Shopify theme, validates the structure,
 * zips it (dependency-free), uploads to InsForge Storage, and records the export
 * row. Progress is reported against the eight visible steps so the dialog can
 * show a live status + percentage. Any failure throws with a clear message so
 * the dialog can offer a retry.
 */

export interface RunExportInput {
  projectId: string;
  projectName: string;
  pages: ExportPage[];
  themeCss: string;
  /** The project's shared style guide, so AI section conversion stays on-brand. */
  styleGuide?: string | null;
  onProgress?: (progress: ExportProgress) => void;
}

export interface RunExportResult {
  row: ThemeExportRow;
  /** The freshly built ZIP, so the dialog can offer an instant download. */
  blob: Blob;
  fileName: string;
  /** How the designed sections were produced (AI vs. raw fallback). */
  sectionStats: { total: number; ai: number; fallback: number };
}

/**
 * Ordered step metadata: label + the percent reached when the step completes.
 * The `sections` step is the real work (per-region AI conversion); its percent
 * is interpolated live between the previous step and its `done` mark.
 */
const STEPS: Record<ExportStepId, { message: string; done: number }> = {
  analyze: { message: 'Analyzing generated pages…', done: 6 },
  convert: { message: 'Preparing theme assets…', done: 12 },
  sections: { message: 'Generating reusable sections…', done: 62 },
  templates: { message: 'Creating templates and snippets…', done: 70 },
  assets: { message: 'Processing images and assets…', done: 76 },
  validate: { message: 'Validating the Shopify theme structure…', done: 84 },
  zip: { message: 'Creating the ZIP archive…', done: 92 },
  upload: { message: 'Uploading the ZIP file to storage…', done: 100 },
};

/** Yield to the event loop so React can paint the progress update between steps. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

async function loadTailwindCss(): Promise<string> {
  const res = await fetch(VENDORED_TAILWIND_PATH);
  if (!res.ok) {
    throw new Error('Could not load the bundled Tailwind stylesheet for the theme.');
  }
  return res.text();
}

export async function runShopifyExport(input: RunExportInput): Promise<RunExportResult> {
  const report = (step: ExportStepId, message?: string) =>
    input.onProgress?.({ step, message: message ?? STEPS[step].message, percent: STEPS[step].done });

  // 1. Analyze — only fully generated pages with HTML can be exported.
  report('analyze');
  const pages: ExportPage[] = input.pages.filter((p) => p.html && p.html.trim());
  if (pages.length === 0) {
    throw new Error('There are no generated pages to export yet. Generate a page first.');
  }
  await tick();

  // 2. Convert — load the vendored utilities the theme's assets/ will carry.
  report('convert');
  const tailwindCss = await loadTailwindCss();
  await tick();

  // 3. Sections — AI-convert each designed page region into a real, editable
  // Shopify section (shared header/footer + per-page bodies). Progress is REAL:
  // reported per region as each conversion lands. A failed region falls back to
  // a raw section (never fatal), so the export always completes.
  report('sections');
  const sectionsStart = STEPS.convert.done;
  const sectionsEnd = STEPS.sections.done;
  const converted = await convertPagesWithAI({
    pages,
    brandName: input.projectName || 'AI Storefront',
    styleGuide: input.styleGuide ?? null,
    onProgress: ({ processed, total }) => {
      const ratio = total > 0 ? processed / total : 1;
      input.onProgress?.({
        step: 'sections',
        message:
          total > 0
            ? `Generating reusable sections… (${processed}/${total})`
            : STEPS.sections.message,
        percent: sectionsStart + (sectionsEnd - sectionsStart) * ratio,
      });
    },
  });

  // 4. Templates — assemble the full theme file set (deterministic).
  report('templates');
  const build = buildThemeFiles(
    {
      projectName: input.projectName || 'AI Storefront',
      pages,
      themeCss: input.themeCss || '',
      tailwindCss,
    },
    converted
  );
  await tick();

  // 5. Assets — images are kept as approved public URLs (AGENTS.md §12).
  report('assets', `Processing images and assets… (${build.imageUrls.length} images)`);
  await tick();

  // 6. Validate — a critical failure blocks the ZIP (AGENTS.md §11).
  report('validate');
  const issues = validateTheme(build);
  if (issues.length > 0) {
    const detail = issues
      .slice(0, 3)
      .map((i) => `${i.file}: ${i.message}`)
      .join('; ');
    throw new Error(
      `Theme validation failed (${issues.length} issue${issues.length > 1 ? 's' : ''}). ${detail}`
    );
  }
  await tick();

  // 7. Zip.
  report('zip');
  const bytes = createZip(build.files);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
  await tick();

  // 8. Upload + record.
  report('upload', 'Uploading the ZIP file to storage…');
  const slug = slugify(input.projectName || 'storefront', 'storefront');
  const downloadName = `${slug}-shopify-theme.zip`;
  const storageName = `${Date.now()}-${downloadName}`;
  const uploaded = await uploadThemeZip(input.projectId, storageName, bytes);

  const row = await saveExport(input.projectId, {
    fileName: downloadName,
    storageKey: uploaded.key,
    downloadUrl: uploaded.url,
    status: 'ready',
    fileSize: uploaded.size,
    themeVersion: SHOPIFY_THEME_VERSION,
  });

  report('upload', 'Export complete.');
  return { row, blob, fileName: downloadName, sectionStats: converted.stats };
}
