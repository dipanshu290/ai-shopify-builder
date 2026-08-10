import { createZip } from '@/lib/shopify/zip';
import type { ExportPage, ThemeFile } from '@/lib/shopify/types';
import { buildPageHtmlFile } from './document';
import { downloadBlob, loadTailwindCss, slugify, uniqueFileBases } from './shared';

/**
 * "Export Code" — bundle every generated page as a standalone `.html` file in a
 * ZIP. Each page links a single shared `assets/tailwind.css` (the vendored full
 * build), so the archive is self-contained and opens without a build step.
 */
export async function exportPagesAsCodeZip(
  pages: ExportPage[],
  themeCss: string,
  projectName: string
): Promise<void> {
  const ready = pages.filter((p) => p.html && p.html.trim());
  if (ready.length === 0) {
    throw new Error('There are no generated pages to export yet. Generate a page first.');
  }

  const tailwindCss = await loadTailwindCss();
  const bases = uniqueFileBases(ready);

  const files: ThemeFile[] = [{ path: 'assets/tailwind.css', contents: tailwindCss }];
  for (const page of ready) {
    const base = bases.get(page.key)!;
    files.push({ path: `${base}.html`, contents: buildPageHtmlFile(page, themeCss) });
  }

  const zipBytes = createZip(files);
  // Copy into a plain ArrayBuffer so the Blob part is a clean BlobPart.
  const blob = new Blob([zipBytes.slice().buffer], { type: 'application/zip' });
  downloadBlob(blob, `${slugify(projectName || 'storefront')}-code.zip`);
}
