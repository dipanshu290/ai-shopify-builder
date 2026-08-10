import { toPng } from 'html-to-image';
import { createZip } from '@/lib/shopify/zip';
import type { ExportPage, ThemeFile } from '@/lib/shopify/types';
import { buildStandaloneHtml } from './document';
import { downloadBlob, loadTailwindCss, slugify, uniqueFileBases, waitForImages } from './shared';

/**
 * "Export to PNG" — rasterize every generated page to a full-page PNG. Each page
 * is rendered in an offscreen, same-origin iframe (Tailwind inlined so classes
 * resolve) and captured with html-to-image, which inlines the ImageKit images so
 * they appear in the output instead of blank spots. One page downloads directly;
 * multiple pages are bundled into a ZIP so the browser doesn't block a burst of
 * separate downloads.
 */

/** Render width for the desktop snapshot. */
const RENDER_WIDTH = 1440;
/** Per-page ceiling so a runaway-tall page can't exceed browser canvas limits. */
const MAX_HEIGHT = 14000;

export interface PngProgress {
  processed: number;
  total: number;
  label: string;
}

/** Render a single page to a PNG Blob via an offscreen iframe. */
async function renderPageToPng(
  page: ExportPage,
  themeCss: string,
  tailwindCss: string
): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${RENDER_WIDTH}px;height:800px;border:0;` +
    'visibility:hidden;pointer-events:none;';
  iframe.srcdoc = buildStandaloneHtml({
    title: page.label || page.key,
    bodyHtml: page.html,
    themeCss,
    tailwindInline: tailwindCss,
  });

  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
      iframe.addEventListener('error', () => reject(new Error('Failed to render page.')), {
        once: true,
      });
    });

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) throw new Error('Could not access the rendered page.');

    await waitForImages(doc);
    // Let layout settle after images resolve (reflow of intrinsic sizes).
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const height = Math.min(
      MAX_HEIGHT,
      Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 1)
    );
    iframe.style.height = `${height}px`;

    const dataUrl = await toPng(doc.body, {
      width: RENDER_WIDTH,
      height,
      backgroundColor: '#ffffff',
      pixelRatio: 1,
      style: { margin: '0' },
    });

    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    iframe.remove();
  }
}

export async function exportPagesAsPng(
  pages: ExportPage[],
  themeCss: string,
  projectName: string,
  onProgress?: (p: PngProgress) => void
): Promise<void> {
  const ready = pages.filter((p) => p.html && p.html.trim());
  if (ready.length === 0) {
    throw new Error('There are no generated pages to export yet. Generate a page first.');
  }

  const tailwindCss = await loadTailwindCss();
  const bases = uniqueFileBases(ready);
  const project = slugify(projectName || 'storefront');

  const rendered: { base: string; blob: Blob }[] = [];
  for (let i = 0; i < ready.length; i++) {
    const page = ready[i];
    onProgress?.({ processed: i, total: ready.length, label: page.label });
    const blob = await renderPageToPng(page, themeCss, tailwindCss);
    rendered.push({ base: bases.get(page.key)!, blob });
  }
  onProgress?.({ processed: ready.length, total: ready.length, label: '' });

  // Single page → download the PNG directly; multiple → bundle into one ZIP.
  if (rendered.length === 1) {
    downloadBlob(rendered[0].blob, `${project}-${rendered[0].base}.png`);
    return;
  }

  const files: ThemeFile[] = [];
  for (const { base, blob } of rendered) {
    files.push({ path: `${base}.png`, contents: new Uint8Array(await blob.arrayBuffer()) });
  }
  const zipBytes = createZip(files);
  const zip = new Blob([zipBytes.slice().buffer], { type: 'application/zip' });
  downloadBlob(zip, `${project}-png.zip`);
}
