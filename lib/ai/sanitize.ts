/**
 * Generated storefront HTML is untrusted (AGENTS.md §9). This module strips the
 * dangerous bits server-side before the HTML ever reaches the browser, and
 * builds the sandboxed preview document the iframe renders.
 *
 * Isomorphic on purpose: `sanitizeGeneratedHtml` runs in the route handler and
 * `buildPreviewShell` runs in the client, but neither imports server-only code.
 */

import { previewEditorScript } from './preview-editor';
import { applyImageKitToHtml } from '@/lib/images/rewrite';
import { IMAGEKIT_URL_ENDPOINT } from '@/lib/images/imagekit';

/** Remove scripts, event handlers, and unsafe URLs from model-generated HTML. */
export function sanitizeGeneratedHtml(raw: string): string {
  let html = raw;

  // Strip any accidental markdown code fences.
  html = html.replace(/```html\s*/gi, '').replace(/```\s*$/g, '');

  // Remove <script>...</script> blocks and lone <script> tags.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<script\b[^>]*>/gi, '');

  // Remove inline event handlers: on*="..." / on*='...' / on*=value.
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

  // Neutralise javascript: and data:text/html URLs in href/src.
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  html = html.replace(/(href|src)\s*=\s*("|')\s*data:text\/html[^"']*\2/gi, '$1=$2#$2');

  // Drop <style> blocks — styling must come from Tailwind classes only.
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Swap placeholder / data-ik-prompt <img> sources for ImageKit gen-image URLs
  // (no-op when ImageKit isn't configured). Runs last so it acts on clean HTML.
  html = applyImageKitToHtml(html);

  return html.trim();
}

/**
 * Sanitize the project-level global stylesheet (AGENTS.md §9). It is applied via
 * `style.textContent`, which never parses HTML, so tag breakout isn't possible;
 * this strips the CSS-specific risks (external fetches and legacy script vectors)
 * and any stray <style> wrapper the model may have added.
 */
export function sanitizeThemeCss(raw: string): string {
  let css = raw;

  // Drop accidental markdown code fences and any <style> wrapper.
  css = css.replace(/```(?:css)?\s*/gi, '').replace(/```\s*$/g, '');
  css = css.replace(/<\/?style\b[^>]*>/gi, '');

  // Remove external fetches and legacy JS-in-CSS vectors.
  css = css.replace(/@import\b[^;]*;?/gi, '');
  css = css.replace(/expression\s*\(/gi, '(');
  css = css.replace(/javascript:/gi, '');

  return css.trim();
}

/**
 * The preview iframe document, loaded exactly ONCE per editor session. Tailwind
 * loads a single time; page content is streamed in afterwards via postMessage
 * (`builder:setBody`), so live updates never reload the document or re-fetch the
 * CDN. The iframe is rendered with sandbox="allow-scripts" and NO
 * allow-same-origin, so this runtime is isolated from the app's origin, cookies,
 * and storage. (The Tailwind CDN runtime is for live preview only — never for
 * export, per AGENTS.md §10.)
 */
export function buildPreviewShell(): string {
  // Public delivery endpoint only — safe to expose to the sandboxed iframe. It
  // powers in-preview "Generate image" + AI transforms and carries no secret.
  const ikEndpoint = IMAGEKIT_URL_ENDPOINT;
  // A neutral inline SVG shown when an ImageKit image fails or times out.
  const fallbackImg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
        '<rect width="800" height="600" fill="#f1ede9"/>' +
        '<g fill="none" stroke="#c9bfb6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="300" y="230" width="200" height="150" rx="12"/>' +
        '<circle cx="352" cy="284" r="16"/><path d="M312 372l58-52 40 34 46-40 44 38"/></g>' +
        '<text x="400" y="430" text-anchor="middle" fill="#a89f96" font-family="sans-serif" font-size="24">Image unavailable</text>' +
        '</svg>'
    );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body{margin:0}
  /* Loading shimmer behind every image so a slow ImageKit generation shows a
     placeholder instead of a blank gap; the opaque image covers it once loaded. */
  @keyframes __ik_pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}
  body img{background-image:linear-gradient(100deg,#f1ede9 30%,#e7e0d9 50%,#f1ede9 70%);background-size:200% 100%;animation:__ik_pulse 1.3s ease-in-out infinite;}
  body img.__ik-ready{background-image:none;animation:none;}
</style>
<style id="__builder_theme__"></style>
<script>window.__IK_ENDPOINT__ = ${JSON.stringify(ikEndpoint)};</script>
<script>${previewEditorScript()}</script>
<script>
  (function () {
    var themeEl = document.getElementById('__builder_theme__');
    var editMode = false;
    var FALLBACK = ${JSON.stringify(fallbackImg)};
    // Stop the loading shimmer once an image paints; on failure/timeout swap in a
    // neutral fallback so the layout never shows a broken-image icon.
    function decorateImages() {
      var imgs = document.body ? document.body.querySelectorAll('img') : [];
      for (var i = 0; i < imgs.length; i++) {
        (function (img) {
          if (img.getAttribute('data-ik-fb') === 'watched') return;
          img.setAttribute('data-ik-fb', 'watched');
          function ready() { img.classList.add('__ik-ready'); }
          function fail() {
            img.classList.add('__ik-ready');
            if (img.getAttribute('src') !== FALLBACK) img.src = FALLBACK;
          }
          if (img.complete && img.naturalWidth > 0) { ready(); return; }
          img.addEventListener('load', ready);
          img.addEventListener('error', fail);
        })(imgs[i]);
      }
    }
    // Let the inline editor re-watch images it adds or re-points (Generate image,
    // AI transforms) so they get the same shimmer + fallback treatment.
    window.__ikDecorate = decorateImages;
    window.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data) return;
      if (data.type === 'builder:setBody') {
        document.body.innerHTML = data.html || '';
        decorateImages();
        // The new body has no editor UI or listeners; re-apply edit mode so
        // hover/highlight/toolbar keep working after a content swap.
        if (editMode && window.__builderSetEditMode) window.__builderSetEditMode(true);
      } else if (data.type === 'builder:setTheme') {
        // Assigning textContent never parses HTML, so the project stylesheet
        // cannot break out of this <style> element.
        if (themeEl) themeEl.textContent = data.css || '';
      } else if (data.type === 'builder:setEditMode') {
        editMode = !!data.enabled;
        if (window.__builderSetEditMode) window.__builderSetEditMode(editMode);
      }
    });
    // Tell the parent the listener is attached and it can send content.
    if (window.parent) window.parent.postMessage({ type: 'builder:ready' }, '*');
  })();
</script>
</head>
<body class="bg-white text-gray-900 antialiased"></body>
</html>`;
}
