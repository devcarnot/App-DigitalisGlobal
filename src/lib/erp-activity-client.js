import { supabase } from './supabase';

/**
 * Generic project-scoped activity row (RLS: project member, user_id must be the signed-in actor).
 * Use for board moves, priority changes, etc. Omit project chat — that is excluded from Recent Activity.
 */
export function logErpActivity({ projectId, userId, action, meta = {} }) {
  if (!projectId || !userId || !action) return Promise.resolve();
  return supabase
    .from('erp_activity_log')
    .insert({
      project_id: projectId,
      user_id: userId,
      action: String(action),
      meta: meta && typeof meta === 'object' ? meta : {},
    })
    .then(({ error }) => {
      if (error) console.warn('erp activity log', action, error.message);
    });
}

/** Fire-and-forget task status audit row (RLS: project member, own user_id). */
export function logErpTaskStatusChange({ projectId, userId, taskId, title, previousStatus, nextStatus }) {
  if (!projectId || !userId || !taskId || !nextStatus) return Promise.resolve();
  return supabase
    .from('erp_activity_log')
    .insert({
      project_id: projectId,
      user_id: userId,
      action: 'task_status_changed',
      meta: {
        task_id: taskId,
        title: title ? String(title).slice(0, 200) : '',
        from: previousStatus != null ? String(previousStatus) : null,
        to: String(nextStatus),
      },
    })
    .then(({ error }) => {
      if (error) console.warn('erp activity log', error.message);
    });
}
