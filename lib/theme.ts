import { insforge } from './insforge';

/**
 * Project-theme repository — all `project_themes` table access lives here
 * (AGENTS.md §14/§17). Each project has ONE global stylesheet (design tokens,
 * reusable component classes, brand/logo treatment) plus a short style guide the
 * AI reuses so every generated page shares the same look. Runs in the browser
 * against the InsForge SDK; RLS scopes every row to its owner.
 */

export interface ProjectThemeRow {
  id: string;
  project_id: string;
  user_id: string;
  /** The global CSS applied to every page in the project. */
  css: string;
  /** Short brand + component-class guide fed into every page/edit prompt. */
  style_guide: string;
  created_at: string;
  updated_at: string;
}

export interface ThemeInput {
  css: string;
  styleGuide: string;
}

/** Fetch a project's global theme, or null if one hasn't been generated yet. */
export async function getProjectTheme(projectId: string): Promise<ProjectThemeRow | null> {
  const { data, error } = await insforge.database
    .from('project_themes')
    .select('*')
    .eq('project_id', projectId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load project theme.');
  }
  const theme = Array.isArray(data) ? data[0] : data;
  return (theme as ProjectThemeRow) ?? null;
}

/**
 * Insert or update the project's single global theme (keyed by project_id).
 * `user_id` is filled by the column default (`auth.uid()`) and re-validated by
 * the insert RLS policy.
 */
export async function saveTheme(projectId: string, theme: ThemeInput): Promise<void> {
  const values = {
    css: theme.css,
    style_guide: theme.styleGuide,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await insforge.database
    .from('project_themes')
    .update(values)
    .eq('project_id', projectId)
    .select();

  if (updateError) {
    throw new Error(updateError.message ?? 'Failed to update project theme.');
  }
  if (Array.isArray(updated) && updated.length > 0) return;

  const { error: insertError } = await insforge.database
    .from('project_themes')
    .insert([{ project_id: projectId, ...values }])
    .select();

  if (insertError) {
    throw new Error(insertError.message ?? 'Failed to create project theme.');
  }
}

/** Delete a project's theme (used when the user resets the build). */
export async function clearTheme(projectId: string): Promise<void> {
  const { error } = await insforge.database
    .from('project_themes')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message ?? 'Failed to clear project theme.');
  }
}
