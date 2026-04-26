/** Matches public.erp_tasks.status CHECK in Supabase. */
export const ERP_TASK_STATUS_VALUES = ['open', 'in_progress', 'in_review', 'done', 'cancelled'];

export const ERP_TASK_STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Completed',
  cancelled: 'Cancelled',
};

export function normalizeTaskStatus(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return ERP_TASK_STATUS_VALUES.includes(s) ? s : 'open';
}
