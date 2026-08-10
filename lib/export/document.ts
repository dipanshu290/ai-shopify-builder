import type { ExportPage } from '@/lib/shopify/types';

/**
 * Builds a complete, standalone HTML document for one generated page. Used by
 * both "Export Code" (written to disk, linking a shared Tailwind asset) and
 * "Export to PNG" (rendered in an offscreen iframe with Tailwind inlined so the
 * utility classes resolve before we rasterize).
 *
 * The page's stored `html` is already sanitized (scripts/handlers stripped at
 * generation time), so no script ever ends up in the exported document.
 */

interface StandaloneOptions {
  title: string;
  bodyHtml: string;
  /** The project's global stylesheet, inlined into <head>. */
  themeCss: string;
  /** Link a shared stylesheet (Export Code). Mutually exclusive with inline. */
  tailwindHref?: string;
  /** Inline the full Tailwind build (PNG rendering). Mutually exclusive with href. */
  tailwindInline?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildStandaloneHtml(opts: StandaloneOptions): string {
  const tailwind = opts.tailwindHref
    ? `<link rel="stylesheet" href="${escapeHtml(opts.tailwindHref)}" />`
    : opts.tailwindInline
      ? `<style>${opts.tailwindInline}</style>`
      : '';

  const theme = opts.themeCss?.trim()
    ? `<style id="theme">${opts.themeCss}</style>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
${tailwind}
<style>body{margin:0}</style>
${theme}
</head>
<body class="bg-white text-gray-900 antialiased">
${opts.bodyHtml}
</body>
</html>`;
}

/** Convenience for the code export: a self-contained doc linking assets/tailwind.css. */
export function buildPageHtmlFile(page: ExportPage, themeCss: string): string {
  return buildStandaloneHtml({
    title: page.label || page.key,
    bodyHtml: page.html,
    themeCss,
    tailwindHref: 'assets/tailwind.css',
  });
}
