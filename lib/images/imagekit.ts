/**
 * ImageKit URL builders (AGENTS.md §12). Isomorphic on purpose: it runs in the
 * route handler (rewriting generated HTML), in the client, and its logic is
 * mirrored inside the sandboxed preview iframe for inline editing.
 *
 * This module deals ONLY with the public delivery endpoint — building
 * text-to-image (`ik-genimg`) and AI-transformation delivery URLs. It never
 * touches the ImageKit private key, which must stay server-only and is only
 * needed for uploads/DAM operations, not URL delivery.
 *
 * URL shapes (see https://imagekit.io/docs/ai-transformations):
 *   Text-to-image:  {endpoint}/ik-genimg-prompt-{prompt}/{file}.jpg?tr=w-1200
 *   AI transforms:  {url}?tr=e-bgremove | e-upscale | e-retouch | e-dropshadow |
 *                            e-changebg-prompte-{b64} | e-edit-prompte-{b64} | e-genvar
 */

/** Public delivery endpoint, e.g. https://ik.imagekit.io/your_id. Trailing slash trimmed. */
export const IMAGEKIT_URL_ENDPOINT = (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? '')
  .trim()
  .replace(/\/+$/, '');

/** True only when a usable ImageKit delivery endpoint is configured. */
export function isImageKitConfigured(): boolean {
  return /^https?:\/\/[^\s]+$/i.test(IMAGEKIT_URL_ENDPOINT);
}

/** Filesystem-safe, readable filename slug for a generated image. */
export function slugifyImageName(text: string): string {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'image';
}

export type GenImageOptions = {
  /** Output width in px (added as a w- transformation). */
  width?: number;
  /** Output height in px (added as an h- transformation). */
  height?: number;
  /**
   * Cache-busting/variation seed. `ik-genimg` caches per path, so the same
   * prompt+file always returns the same image; a seed varies the filename.
   */
  seed?: string | number;
};

/** Build the `tr=` value for delivery options (width/height + sensible defaults). */
function deliveryTransform(opts: GenImageOptions): string {
  const parts: string[] = [];
  if (opts.width && opts.width > 0) parts.push('w-' + Math.round(opts.width));
  if (opts.height && opts.height > 0) parts.push('h-' + Math.round(opts.height));
  return parts.join(',');
}

/**
 * Build a text-to-image ImageKit URL from a natural-language prompt.
 * Returns an empty string when ImageKit is not configured, so callers can fall
 * back to their existing placeholder image.
 */
export function buildGenImageUrl(prompt: string, opts: GenImageOptions = {}): string {
  if (!isImageKitConfigured()) return '';
  const text = (prompt || '').trim() || 'clean modern product photo';
  // The prompt lives in the path segment; encode it so slashes/spaces/specials
  // can't break out of the segment.
  const encodedPrompt = encodeURIComponent(text);
  const seed = opts.seed != null ? '-' + slugifyImageName(String(opts.seed)) : '';
  const file = slugifyImageName(text) + seed + '.jpg';
  const tr = deliveryTransform(opts);
  return `${IMAGEKIT_URL_ENDPOINT}/ik-genimg-prompt-${encodedPrompt}/${file}${tr ? `?tr=${tr}` : ''}`;
}

/** True when a URL is served by the configured ImageKit endpoint (or any ImageKit host). */
export function isImageKitUrl(url: string): boolean {
  if (!url) return false;
  if (IMAGEKIT_URL_ENDPOINT && url.startsWith(IMAGEKIT_URL_ENDPOINT)) return true;
  return /(^https?:)?\/\/[^/]*ik\.imagekit\.io\//i.test(url) || url.includes('/ik-genimg-');
}

/**
 * Append a chained transformation step to an ImageKit URL's `tr` parameter,
 * preserving any existing steps and other query params. Chained steps are
 * joined with `:` so each runs in click order (e.g. `w-1200:e-bgremove`).
 */
export function appendTransform(url: string, token: string): string {
  if (!url || !token) return url;
  const hashIdx = url.indexOf('#');
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const qIdx = noHash.indexOf('?');
  const base = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const query = qIdx >= 0 ? noHash.slice(qIdx + 1) : '';

  const params = query ? query.split('&') : [];
  let found = false;
  const next = params.map((p) => {
    if (p.startsWith('tr=')) {
      found = true;
      const existing = p.slice(3);
      return 'tr=' + (existing ? existing + ':' + token : token);
    }
    return p;
  });
  if (!found) next.push('tr=' + token);
  return base + '?' + next.join('&') + hash;
}

/** UTF-8-safe base64 for prompt-carrying transforms (`-prompte-` encoding). */
function toBase64(text: string): string {
  if (typeof btoa === 'function') {
    // Browser / edge: encode UTF-8 first so non-ASCII survives.
    return btoa(unescape(encodeURIComponent(text)));
  }
  return Buffer.from(text, 'utf-8').toString('base64');
}

/**
 * Build an ImageKit AI-transformation token to feed to {@link appendTransform}.
 * Prompt-based transforms are base64-encoded (`-prompte-`) so commas and other
 * special characters can't break the comma-delimited `tr` value.
 */
export function transformToken(
  kind: 'bgremove' | 'upscale' | 'retouch' | 'dropshadow' | 'genvar' | 'changebg' | 'edit',
  prompt?: string
): string {
  switch (kind) {
    case 'bgremove':
      return 'e-bgremove';
    case 'upscale':
      return 'e-upscale';
    case 'retouch':
      return 'e-retouch';
    case 'dropshadow':
      return 'e-dropshadow';
    case 'genvar':
      return 'e-genvar';
    case 'changebg':
      return 'e-changebg-prompte-' + encodeURIComponent(toBase64((prompt || '').trim()));
    case 'edit':
      return 'e-edit-prompte-' + encodeURIComponent(toBase64((prompt || '').trim()));
  }
}
