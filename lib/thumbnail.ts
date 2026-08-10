import { toPng } from 'html-to-image';
import { insforge } from './insforge';
import { buildStandaloneHtml } from './export/document';
import { loadTailwindCss, waitForImages } from './export/shared';
import { saveProjectThumbnail, type Project } from './projects';
import { getProjectPages } from './pages';
import { getProjectTheme } from './theme';

/**
 * Project preview thumbnails.
 *
 * When a page finishes generating we rasterize the top of it (hero + first
 * sections) to a small PNG and upload it to InsForge Storage, then record the
 * public URL on the project row. The projects grid renders that URL as each
 * card's preview. Runs entirely in the browser with the signed-in user's JWT —
 * the same offscreen-iframe technique the PNG export uses, just cropped and
 * downscaled for a card-sized image.
 */

/** Public InsForge Storage bucket that holds the project thumbnails. */
export const PROJECT_THUMBNAILS_BUCKET =
  process.env.NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET?.trim() || 'project-thumbnails';

/** Desktop render width used to lay the page out before we downscale. */
const RENDER_WIDTH = 1200;
/** Only capture the top of the page — a card preview, not the full scroll. */
const CAPTURE_HEIGHT = 900;
/** Downscale factor → a ~600px-wide PNG, plenty for a card. */
const PIXEL_RATIO = 0.5;

/** Render page HTML in an offscreen iframe and rasterize its top to a PNG Blob. */
async function capturePageThumbnail(html: string, themeCss: string): Promise<Blob> {
  const tailwindCss = await loadTailwindCss();

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${RENDER_WIDTH}px;height:${CAPTURE_HEIGHT}px;` +
    'border:0;visibility:hidden;pointer-events:none;';
  iframe.srcdoc = buildStandaloneHtml({
    title: 'preview',
    bodyHtml: html,
    themeCss,
    tailwindInline: tailwindCss,
  });

  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
      iframe.addEventListener('error', () => reject(new Error('Failed to render preview.')), {
        once: true,
      });
    });

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) throw new Error('Could not access the rendered preview.');

    await waitForImages(doc);
    // Let layout settle after images resolve (reflow of intrinsic sizes).
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const height = Math.min(
      CAPTURE_HEIGHT,
      Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 1)
    );

    const dataUrl = await toPng(doc.body, {
      width: RENDER_WIDTH,
      height,
      backgroundColor: '#ffffff',
      pixelRatio: PIXEL_RATIO,
      style: { margin: '0' },
    });

    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    iframe.remove();
  }
}

/** Log a thumbnail failure without ever throwing into the caller's flow. */
function warnThumbnail(projectId: string, stage: string, detail: unknown): void {
  const message = detail instanceof Error ? detail.message : String(detail ?? '');
  console.warn(
    `[thumbnail] ${stage} failed for project ${projectId}. ` +
      'Confirm the project-thumbnails bucket and projects.thumbnail_url/thumbnail_key ' +
      `columns exist (see docs/projects-thumbnails-setup.md). Detail: ${message}`
  );
}

/**
 * Capture the current preview and persist it as the project's thumbnail.
 * Best-effort: failures are logged (never thrown) so they can't disrupt
 * generation. Returns the public URL on success, or null on failure.
 */
export async function captureAndSaveThumbnail(
  projectId: string,
  html: string,
  themeCss: string
): Promise<string | null> {
  if (typeof window === 'undefined' || !html.trim()) return null;

  let blob: Blob;
  try {
    blob = await capturePageThumbnail(html, themeCss);
  } catch (err) {
    warnThumbnail(projectId, 'render', err);
    return null;
  }

  // Versioned key so a re-capture never has to fight a cached object URL; the
  // project row always points at the latest (older thumbs simply linger).
  const key = `${projectId}/thumb-${Date.now()}.png`;

  try {
    const bucket = insforge.storage.from(PROJECT_THUMBNAILS_BUCKET);
    const { data, error } = await bucket.upload(key, blob);
    if (error) {
      warnThumbnail(projectId, 'upload', error);
      return null;
    }

    let url = data?.url ?? '';
    if (!url) {
      const { data: pub } = bucket.getPublicUrl(data?.key ?? key);
      url = pub?.publicUrl ?? '';
    }
    if (!url) {
      warnThumbnail(projectId, 'public-url', 'no URL returned from storage');
      return null;
    }

    await saveProjectThumbnail(projectId, { url, key: data?.key ?? key });
    return url;
  } catch (err) {
    warnThumbnail(projectId, 'upload/save', err);
    return null;
  }
}

/**
 * Backfill a thumbnail for a project that doesn't have one yet — used by the
 * projects grid so storefronts generated before this feature (or before a
 * successful capture) still get a card preview. Loads the project's saved pages
 * + theme, picks the home (or first ready) page, and captures it. Returns the
 * new URL, or null if the project has no ready page yet or capture failed.
 */
export async function ensureProjectThumbnail(project: Project): Promise<string | null> {
  if (typeof window === 'undefined' || project.thumbnail_url) return project.thumbnail_url ?? null;

  try {
    const [pages, theme] = await Promise.all([
      getProjectPages(project.id),
      getProjectTheme(project.id),
    ]);

    const previewPage =
      pages.find((p) => p.type === 'home' && p.html.trim()) ??
      pages.find((p) => p.html.trim());
    if (!previewPage) return null;

    return await captureAndSaveThumbnail(project.id, previewPage.html, theme?.css ?? '');
  } catch (err) {
    warnThumbnail(project.id, 'backfill-load', err);
    return null;
  }
}
