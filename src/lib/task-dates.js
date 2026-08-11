/**
 * Parse Postgres `date` / ISO date strings as local calendar dates (avoids UTC off-by-one in UI).
 */

export function parseDateOnlyLocal(s) {
  if (s == null || s === '') return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Local calendar `YYYY-MM-DD` for today (for `<input type="date" min />` and validation). */
export function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * True if the value is empty or a valid `YYYY-MM-DD` on or after today (local calendar).
 * @param {string} yyyyMmDd
 */
export function isTaskDueDateNotInPast(yyyyMmDd) {
  if (!yyyyMmDd) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(yyyyMmDd).trim())) return false;
  return String(yyyyMmDd).trim() >= todayDateInputValue();
}

/** Value for <input type="date" /> */
export function toDateInputValue(s) {
  if (s == null || s === '') return '';
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = parseDateOnlyLocal(s);
  if (!dt) return '';
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function formatTaskDueDate(s) {
  if (s == null || s === '') return 'n/a';
  const dt = parseDateOnlyLocal(s);
  if (!dt) return 'n/a';
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function startOfLocalDay(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * Classify a due date relative to the viewer's local "today":
 *   'past'   → already overdue (red)
 *   'today'  → due today (blue)
 *   'future' → due in the future (green)
 *   null     → no / unparseable due date
 *
 * Used to drive consistent color coding for due-date labels across the ERP
 * (dashboard, modals, task lists, …).
 */
export function taskDueStatus(s) {
  const dt = parseDateOnlyLocal(s);
  if (!dt) return null;
  const d = startOfLocalDay(dt).getTime();
  const today = startOfLocalDay(new Date()).getTime();
  if (d < today) return 'past';
  if (d === today) return 'today';
  return 'future';
}

/**
 * Tailwind classes for the three due-date states. Returns both a soft `label`
 * class (for prefixes like "Due") and a stronger `value` class (for the
 * formatted date itself) so call sites can keep a clean visual hierarchy.
 *
 * Unknown / missing status → muted slate.
 */
export function taskDueColorClasses(status) {
  if (status === 'past')
    return {
      label: 'text-rose-600 dark:text-rose-300',
      value: 'text-rose-700 dark:text-rose-200',
      badge:
        'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900/45',
    };
  if (status === 'today')
    return {
      label: 'text-sky-600 dark:text-sky-300',
      value: 'text-sky-700 dark:text-sky-100',
      badge:
        'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/50 dark:text-sky-100 dark:ring-sky-900/45',
    };
  if (status === 'future')
    return {
      label: 'text-emerald-600 dark:text-emerald-300',
      value: 'text-emerald-700 dark:text-emerald-100',
      badge:
        'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/45 dark:text-emerald-100 dark:ring-emerald-900/40',
    };
  return {
    label: 'text-slate-400 dark:text-slate-400',
    value: 'text-slate-500 dark:text-slate-300',
    badge: 'bg-slate-50 text-slate-500 ring-slate-100 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/50',
  };
}
