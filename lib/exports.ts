import { insforge } from './insforge';

/**
 * Theme-exports repository — all `theme_exports` table access lives here
 * (AGENTS.md §14/§17: keep database queries out of UI components). Each row
 * records one Shopify theme ZIP produced for a project and uploaded to InsForge
 * Storage. We keep a single current export per project (a unique index on
 * `project_id`), so regenerating replaces the row. Runs in the browser against
 * the InsForge SDK; RLS scopes every row to its owner.
 */

export type ExportStatus = 'ready' | 'failed';

export interface ThemeExportRow {
  id: string;
  project_id: string;
  user_id: string;
  /** Downloadable ZIP name, e.g. "acme-store-shopify-theme.zip". */
  file_name: string;
  /** Object key/path within the storage bucket. */
  storage_key: string;
  /** Public (or signed) URL the browser can download from. */
  download_url: string;
  status: ExportStatus;
  /** ZIP size in bytes. */
  file_size: number;
  /** Shopify theme version stamped at export time. */
  theme_version: string;
  created_at: string;
  updated_at: string;
}

/** The subset a caller supplies when recording an export. */
export interface ExportInput {
  fileName: string;
  storageKey: string;
  downloadUrl: string;
  status: ExportStatus;
  fileSize: number;
  themeVersion: string;
}

/** Fetch the current export for a project, or null if none exists yet. */
export async function getLatestExport(projectId: string): Promise<ThemeExportRow | null> {
  const { data, error } = await insforge.database
    .from('theme_exports')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load project export.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ThemeExportRow) ?? null;
}

/**
 * Insert or update the project's current export (keyed by project_id). `user_id`
 * is filled by the column default (`auth.uid()`) and re-validated by the insert
 * RLS policy. Returns the persisted row.
 */
export async function saveExport(
  projectId: string,
  input: ExportInput
): Promise<ThemeExportRow> {
  const values = {
    file_name: input.fileName,
    storage_key: input.storageKey,
    download_url: input.downloadUrl,
    status: input.status,
    file_size: input.fileSize,
    theme_version: input.themeVersion,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await insforge.database
    .from('theme_exports')
    .update(values)
    .eq('project_id', projectId)
    .select();

  if (updateError) {
    throw new Error(updateError.message ?? 'Failed to update export record.');
  }
  if (Array.isArray(updated) && updated.length > 0) {
    return updated[0] as ThemeExportRow;
  }

  const { data: inserted, error: insertError } = await insforge.database
    .from('theme_exports')
    .insert([{ project_id: projectId, ...values }])
    .select();

  if (insertError) {
    throw new Error(insertError.message ?? 'Failed to create export record.');
  }
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  if (!row) {
    throw new Error('Export record was not returned after creation.');
  }
  return row as ThemeExportRow;
}
