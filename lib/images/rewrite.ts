/**
 * Rewrite generated-storefront <img> tags to ImageKit text-to-image URLs
 * (AGENTS.md §12: images come from ImageKit). The model emits each image with a
 * `data-ik-prompt` describing the ideal photo (and a placeholder `src` from an
 * allowed host as a fallback); here we turn that prompt into an `ik-genimg` URL.
 *
 * Isomorphic and idempotent: it runs inside `sanitizeGeneratedHtml`, so it fires
 * on every path (streaming preview, final document, patched HTML, inline edits).
 * It never re-generates an image whose `src` is already an ImageKit URL, a
 * `data:` URI, or a user-pasted URL, so re-sanitising edited HTML is safe.
 *
 * When ImageKit is not configured it is a no-op — the model's placeholder image
 * stays, so the builder still works without ImageKit.
 */

import { buildGenImageUrl, isImageKitConfigured, isImageKitUrl } from './imagekit';

const PLACEHOLDER_HOST = /(images\.unsplash\.com|picsum\.photos|placehold|via\.placeholder)/i;

function attr(tag: string, name: string): string | null {
  const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag) ||
    new RegExp("\\b" + name + "\\s*=\\s*'([^']*)'", 'i').exec(tag);
  return m ? m[1] : null;
}

function numAttr(tag: string, name: string): number | undefined {
  const v = attr(tag, name);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Set (or insert) the src attribute on an <img ...> tag string. */
function setSrc(tag: string, url: string): string {
  const escaped = url.replace(/"/g, '&quot;');
  if (/\bsrc\s*=\s*"[^"]*"/i.test(tag)) {
    return tag.replace(/\bsrc\s*=\s*"[^"]*"/i, 'src="' + escaped + '"');
  }
  if (/\bsrc\s*=\s*'[^']*'/i.test(tag)) {
    return tag.replace(/\bsrc\s*=\s*'[^']*'/i, 'src="' + escaped + '"');
  }
  return tag.replace(/^<img/i, '<img src="' + escaped + '"');
}

function rewriteTag(tag: string): string {
  const src = attr(tag, 'src') ?? '';

  // Never touch images the user already set or that are already ImageKit URLs —
  // keeps the rewrite idempotent across re-sanitising and inline edits.
  if (src.startsWith('data:') || isImageKitUrl(src)) return tag;

  const prompt = attr(tag, 'data-ik-prompt');
  const isPlaceholder = !!src && PLACEHOLDER_HOST.test(src);

  // Generate only when the model asked for it (data-ik-prompt) or left a known
  // placeholder host. Leave any other explicit URL alone.
  if (!prompt && !isPlaceholder) return tag;

  const promptText = (prompt || attr(tag, 'alt') || 'clean modern storefront photo').trim();
  const url = buildGenImageUrl(promptText, {
    width: numAttr(tag, 'width') ?? 1200,
    height: numAttr(tag, 'height'),
  });
  if (!url) return tag;
  return setSrc(tag, url);
}

/** Swap placeholder/`data-ik-prompt` <img> sources for ImageKit gen-image URLs. */
export function applyImageKitToHtml(html: string): string {
  if (!html || !isImageKitConfigured()) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => rewriteTag(tag));
}
