import { insforge } from './insforge';
import type { PageType } from './ai/events';

/**
 * Project-pages repository — all `project_pages` table access lives here
 * (AGENTS.md §14/§17: keep database queries out of UI components). Each row is a
 * page/tab in a project and holds the generated HTML, so reopening a project by
 * id restores every page exactly as it was last saved. Runs in the browser
 * against the InsForge SDK; RLS guarantees a user only ever touches their own
 * rows.
 */

export interface ProjectPageRow {
  id: string;
  project_id: string;
  user_id: string;
  /** Stable slug (e.g. "home") — unique within a project. Mirrors BuilderPage.id. */
  page_key: string;
  label: string;
  type: PageType;
  path: string;
  html: string;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** The subset a caller supplies when saving a page. */
export interface PageInput {
  pageKey: string;
  label: string;
  type: PageType;
  path: string;
  html: string;
  status: string;
  position: number;
}

/** Fetch every page for a project, ordered by tab position. RLS scopes to the owner. */
export async function getProjectPages(projectId: string): Promise<ProjectPageRow[]> {
  const { data, error } = await insforge.database
    .from('project_pages')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message ?? 'Failed to load project pages.');
  }
  return (Array.isArray(data) ? data : []) as ProjectPageRow[];
}

/**
 * Insert or update a single page, keyed by (project_id, page_key). This is how a
 * generated page or a scoped edit is persisted without touching sibling pages —
 * we never rewrite the whole project, only the one page that changed.
 */
export async function savePage(projectId: string, page: PageInput): Promise<void> {
  const values = {
    label: page.label,
    type: page.type,
    path: page.path,
    html: page.html,
    status: page.status,
    position: page.position,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await insforge.database
    .from('project_pages')
    .update(values)
    .eq('project_id', projectId)
    .eq('page_key', page.pageKey)
    .select();

  if (updateError) {
    throw new Error(updateError.message ?? 'Failed to update page.');
  }
  if (Array.isArray(updated) && updated.length > 0) return;

  // No existing row for this page_key — create it. `user_id` is filled by the
  // column default (`auth.uid()`) and re-validated by the insert RLS policy.
  const { error: insertError } = await insforge.database
    .from('project_pages')
    .insert([{ project_id: projectId, page_key: page.pageKey, ...values }])
    .select();

  if (insertError) {
    throw new Error(insertError.message ?? 'Failed to create page.');
  }
}

/** Remove a page (closing a tab permanently). RLS scopes the delete to the owner. */
export async function deletePage(projectId: string, pageKey: string): Promise<void> {
  const { error } = await insforge.database
    .from('project_pages')
    .delete()
    .eq('project_id', projectId)
    .eq('page_key', pageKey);

  if (error) {
    throw new Error(error.message ?? 'Failed to delete page.');
  }
}

/** Delete every page in a project (used when the user resets the chat/build). */
export async function clearPages(projectId: string): Promise<void> {
  const { error } = await insforge.database
    .from('project_pages')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message ?? 'Failed to clear project pages.');
  }
}
