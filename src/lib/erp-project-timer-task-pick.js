/**
 * Load project tasks so the ERP timer can attribute time to one task when several exist.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @returns {Promise<{ tasks: { id: string, title: string }[], error: string | null }>}
 */
export async function loadProjectTasksForTimerPick(supabase, projectId) {
  if (!projectId) return { tasks: [], error: null };
  const { data, error } = await supabase
    .from('erp_tasks')
    .select('id, title')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return { tasks: [], error: error.message || 'Could not load tasks' };
  const tasks = (data || [])
    .map((r) => ({
      id: r?.id != null ? String(r.id) : '',
      title:
        typeof r?.title === 'string' && r.title.trim()
          ? r.title.trim().slice(0, 280)
          : '',
    }))
    .filter((r) => r.id.length > 0);
  return { tasks, error: null };
}

/** @param {{ tasks: { id: string, title: string }[] }} args */
export function timerPickNeedsUserChoice({ tasks }) {
  return Array.isArray(tasks) && tasks.length >= 2;
}
