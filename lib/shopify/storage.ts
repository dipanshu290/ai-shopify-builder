import { insforge } from '@/lib/insforge';
import { THEME_EXPORTS_BUCKET } from './config';

/**
 * Upload the exported theme ZIP to InsForge Storage (AGENTS.md §12/§14). Runs in
 * the browser with the signed-in user's JWT; the bucket is public, so the
 * returned URL is directly downloadable. Both the storage `key` and the `url`
 * are persisted (per the InsForge storage pattern) by the caller.
 */

export interface UploadedZip {
  key: string;
  url: string;
  size: number;
}

/**
 * Store the ZIP under a per-project, versioned key so regenerating keeps prior
 * archives in storage while the DB row (unique per project) points at the
 * latest. Returns the object key + a public download URL.
 */
export async function uploadThemeZip(
  projectId: string,
  storageFileName: string,
  bytes: Uint8Array
): Promise<UploadedZip> {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
  const key = `${projectId}/${storageFileName}`;

  const bucket = insforge.storage.from(THEME_EXPORTS_BUCKET);
  const { data, error } = await bucket.upload(key, blob);
  if (error) {
    throw new Error(error.message ?? 'Failed to upload the theme ZIP to storage.');
  }

  // Prefer the URL the upload returns; fall back to the bucket's public URL.
  let url = data?.url ?? '';
  if (!url) {
    const { data: pub } = bucket.getPublicUrl(key);
    url = pub?.publicUrl ?? '';
  }
  if (!url) {
    throw new Error('Upload succeeded but no download URL was returned.');
  }

  return { key: data?.key ?? key, url, size: data?.size ?? blob.size };
}
