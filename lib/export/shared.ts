import { VENDORED_TAILWIND_PATH } from '@/lib/shopify/config';
import type { ExportPage } from '@/lib/shopify/types';

/**
 * Small shared helpers for the client-side "Export Code" (HTML ZIP) and
 * "Export to PNG" flows. Kept isomorphic-friendly and dependency-free; the DOM
 * work lives in the individual export modules.
 */

/** Fetch the vendored full Tailwind build once (the same asset the theme uses). */
export async function loadTailwindCss(): Promise<string> {
  const res = await fetch(VENDORED_TAILWIND_PATH);
  if (!res.ok) {
    throw new Error('Could not load the bundled Tailwind stylesheet.');
  }
  return res.text();
}

/** Turn an arbitrary label/key into a Shopify-safe, lowercase file base. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'page';
}

/**
 * File base for a page inside the export (no extension). The home page becomes
 * `index` so an exported HTML set opens naturally; everything else uses its key.
 */
export function pageFileBase(page: ExportPage): string {
  if (page.key === 'home' || page.path === '/' || page.path === '') return 'index';
  return slugify(page.key || page.label);
}

/**
 * Ensure every page gets a unique file base even if two keys slugify the same
 * (e.g. two custom pages). Returns a map from page key -> unique base.
 */
export function uniqueFileBases(pages: ExportPage[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const page of pages) {
    const base = pageFileBase(page);
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${n++}`;
    }
    used.add(candidate);
    map.set(page.key, candidate);
  }
  return map;
}

/**
 * Wait until every <img> in a rendered document has loaded (or errored), so a
 * rasterizer captures the images instead of blank spots. Resolves early after
 * `timeoutMs` so a single slow asset can't stall the capture. Browser-only.
 */
export function waitForImages(doc: Document, timeoutMs = 12000): Promise<void> {
  const imgs = Array.from(doc.images);
  const pending = imgs
    .filter((img) => !(img.complete && img.naturalWidth > 0))
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        })
    );
  if (pending.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Trigger a browser download for a Blob, cleaning up the object URL after. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
