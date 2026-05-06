/** Must stay in sync with `erp_task_checklist_title_max` in Supabase (see migration). */
export const ERP_TASK_CHECKLIST_TITLE_MAX_CHARS = 2000;

export function normalizeChecklistItemTitle(raw) {
  return String(raw || '').trim();
}

export function checklistTitleLengthError(trimmedTitle) {
  if (!trimmedTitle) return null;
  if (trimmedTitle.length > ERP_TASK_CHECKLIST_TITLE_MAX_CHARS) {
    return `Each checklist line can be at most ${ERP_TASK_CHECKLIST_TITLE_MAX_CHARS} characters (${trimmedTitle.length} entered). Shorten it or split into multiple items.`;
  }
  return null;
}

/** Map raw PostgREST errors to friendlier checklist copy */
export function formatChecklistItemError(message) {
  const m = String(message || '');
  if (/erp_task_checklist_title_max|title_max/i.test(m)) {
    return `Each checklist line can be at most ${ERP_TASK_CHECKLIST_TITLE_MAX_CHARS} characters. Shorten the text or split into multiple items.`;
  }
  return m || 'Could not save checklist item.';
}
