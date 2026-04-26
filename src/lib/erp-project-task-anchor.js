import { pickCanonicalRootTask } from './erp-task-tree';

/**
 * Ensures the project has exactly one implicit anchor row (parent_task_id null) used only to hang real tasks under.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ projectId: string, userId: string, projectName?: string | null }} args
 * @returns {Promise<string>} anchor task id
 */
export async function ensureProjectTaskAnchor(supabase, { projectId, userId, projectName }) {
  const { data: roots, error } = await supabase
    .from('erp_tasks')
    .select('id, title, created_at')
    .eq('project_id', projectId)
    .is('parent_task_id', null)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const list = roots || [];
  if (list.length === 0) {
    const anchorTitle = (projectName && String(projectName).trim()) || 'Project work';
    const { data: row, error: insErr } = await supabase
      .from('erp_tasks')
      .insert({
        project_id: projectId,
        parent_task_id: null,
        title: anchorTitle,
        status: 'open',
        created_by: userId,
        assignee_id: null,
        due_date: null,
        tagged_user_ids: [],
        attachments: [],
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return row.id;
  }

  const picked = pickCanonicalRootTask(list, projectName);
  return picked.id;
}
