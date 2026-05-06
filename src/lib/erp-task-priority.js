/** @typedef {'critical'|'high'|'medium'|'normal'} ErpTaskPriority */

/** @type {ErpTaskPriority[]} */
export const ERP_TASK_PRIORITY_ORDER = ['critical', 'high', 'medium', 'normal'];

/** @type {Record<ErpTaskPriority, string>} */
export const ERP_TASK_PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  normal: 'Normal',
};

/** @type {Record<ErpTaskPriority, string>} */
export const ERP_TASK_PRIORITY_PILL_CLASS = {
  critical: 'bg-rose-600 text-white border-rose-700/30',
  high: 'bg-orange-500 text-white border-orange-600/30',
  medium: 'bg-sky-100 text-sky-900 border-sky-400/40 dark:bg-sky-600/95 dark:text-white dark:border-sky-400/35',
  normal: 'bg-slate-200 text-slate-800 border-slate-400/35 dark:bg-slate-700/90 dark:text-slate-100 dark:border-slate-500/40',
};

/**
 * Closed-state styling for native priority &lt;select&gt; (Kanban/list). Matches pill colors; option list stays neutral in browsers.
 * @type {Record<ErpTaskPriority, string>}
 */
export const ERP_TASK_PRIORITY_SELECT_CLASS = {
  critical:
    'border-rose-500/90 bg-gradient-to-r from-rose-600 via-rose-600 to-red-700 text-white shadow-md shadow-rose-950/30 ring-1 ring-rose-400/45',
  high: 'border-orange-500/90 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md shadow-orange-950/25 ring-1 ring-orange-400/45',
  medium:
    'border-sky-500/90 bg-gradient-to-r from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-950/25 ring-1 ring-sky-400/45',
  normal:
    'border-slate-400/90 bg-gradient-to-r from-slate-300 to-slate-400 text-slate-900 shadow-md ring-1 ring-slate-400/45',
};

/**
 * @param {string | null | undefined} raw
 * @returns {ErpTaskPriority}
 */
export function normalizeTaskPriority(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'low' || v === 'lowest') return 'normal';
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'normal') {
    return v;
  }
  return 'medium';
}

/**
 * @param {string | null | undefined} raw
 * @returns {string} Tailwind classes for priority select closed appearance
 */
export function erpTaskPrioritySelectClass(raw) {
  const p = normalizeTaskPriority(raw);
  return ERP_TASK_PRIORITY_SELECT_CLASS[p] || ERP_TASK_PRIORITY_SELECT_CLASS.medium;
}

/**
 * @param {ErpTaskPriority} a
 * @param {ErpTaskPriority} b
 * @returns {number}
 */
export function compareTaskPriority(a, b) {
  const na = normalizeTaskPriority(a);
  const nb = normalizeTaskPriority(b);
  return ERP_TASK_PRIORITY_ORDER.indexOf(na) - ERP_TASK_PRIORITY_ORDER.indexOf(nb);
}

/**
 * Strongest (most urgent) priority among active tasks; falls back to all tasks if none active.
 * @param {{ priority?: string, status?: string }[]} tasks
 * @returns {ErpTaskPriority}
 */
export function rollupPriorityFromTasks(tasks) {
  if (!tasks?.length) return 'medium';
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const pool = active.length ? active : tasks;
  let best = 'normal';
  for (const t of pool) {
    const p = normalizeTaskPriority(t.priority);
    if (compareTaskPriority(p, best) < 0) best = p;
  }
  return best;
}
