import { insforge } from './insforge';

/**
 * Chat-history repository — all `project_messages` table access lives here
 * (AGENTS.md §14/§17). Persisting the conversation lets a project reopen with its
 * full chat intact, and gives the AI the same context on the next turn. Runs in
 * the browser against the InsForge SDK; RLS scopes every row to its owner.
 */

export interface ProjectMessageRow {
  id: string;
  project_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  position: number;
  created_at: string;
}

export interface MessageInput {
  role: 'user' | 'assistant';
  content: string;
  position: number;
}

/** Fetch a project's chat history in order. RLS scopes to the owner. */
export async function getProjectMessages(projectId: string): Promise<ProjectMessageRow[]> {
  const { data, error } = await insforge.database
    .from('project_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message ?? 'Failed to load chat history.');
  }
  return (Array.isArray(data) ? data : []) as ProjectMessageRow[];
}

/**
 * Append messages to a project's history (typically the user turn plus the final
 * assistant reply, saved once a turn completes). `user_id` is filled by the
 * column default (`auth.uid()`) and re-validated by the insert RLS policy.
 */
export async function appendMessages(projectId: string, messages: MessageInput[]): Promise<void> {
  if (messages.length === 0) return;

  const rows = messages.map((m) => ({
    project_id: projectId,
    role: m.role,
    content: m.content,
    position: m.position,
  }));

  const { error } = await insforge.database.from('project_messages').insert(rows).select();

  if (error) {
    throw new Error(error.message ?? 'Failed to save chat messages.');
  }
}

/** Delete a project's entire chat history (used when the user resets the chat). */
export async function clearMessages(projectId: string): Promise<void> {
  const { error } = await insforge.database
    .from('project_messages')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message ?? 'Failed to clear chat history.');
  }
}
