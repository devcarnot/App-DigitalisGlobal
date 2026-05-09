/**
 * Shared constants for the personal Notes Kanban board (`/erp/notes`).
 *
 * Columns are local-only (the DB just stores the `column_key`); admins can
 * add custom lanes later without a schema change.
 */

/** @typedef {{ key: string, title: string, accent: string }} ErpNoteColumn */

/** Default board lanes shown to every viewer. */
export const ERP_NOTE_COLUMNS = /** @type {ErpNoteColumn[]} */ ([
  {
    key: 'todo',
    title: 'To do',
    accent:
      'border-slate-300/80 bg-slate-50/80 dark:border-slate-700/55 dark:bg-slate-900/45',
  },
  {
    key: 'doing',
    title: 'In progress',
    accent:
      'border-sky-300/80 bg-sky-50/70 dark:border-sky-800/55 dark:bg-sky-950/35',
  },
  {
    key: 'review',
    title: 'Waiting / review',
    accent:
      'border-violet-300/80 bg-violet-50/70 dark:border-violet-800/55 dark:bg-violet-950/30',
  },
  {
    key: 'done',
    title: 'Done',
    accent:
      'border-emerald-300/80 bg-emerald-50/70 dark:border-emerald-800/55 dark:bg-emerald-950/30',
  },
]);

export const ERP_NOTE_DEFAULT_COLUMN = 'todo';

/** Tag colors for a card; matches the CHECK constraint in the migration. */
export const ERP_NOTE_COLORS = [
  { id: 'slate', label: 'Slate', stripe: 'bg-slate-400 dark:bg-slate-500' },
  { id: 'teal', label: 'Teal', stripe: 'bg-teal-500 dark:bg-teal-400' },
  { id: 'sky', label: 'Sky', stripe: 'bg-sky-500 dark:bg-sky-400' },
  { id: 'violet', label: 'Violet', stripe: 'bg-violet-500 dark:bg-violet-400' },
  { id: 'amber', label: 'Amber', stripe: 'bg-amber-500 dark:bg-amber-400' },
  { id: 'rose', label: 'Rose', stripe: 'bg-rose-500 dark:bg-rose-400' },
  { id: 'emerald', label: 'Emerald', stripe: 'bg-emerald-500 dark:bg-emerald-400' },
];

export const ERP_NOTE_DEFAULT_COLOR = 'slate';

/** Map color id → Tailwind classes for the small left stripe on a card. */
export function noteColorStripeClass(colorId) {
  const found = ERP_NOTE_COLORS.find((c) => c.id === colorId);
  return found?.stripe || ERP_NOTE_COLORS[0].stripe;
}

/** Resolve a stored column_key to a column definition (falls back to `todo`). */
export function resolveNoteColumn(columnKey) {
  return ERP_NOTE_COLUMNS.find((c) => c.key === columnKey) || ERP_NOTE_COLUMNS[0];
}

/** "Today / Tomorrow / 3d / Mon Jun 5" style chip for the due-date pill. */
export function formatNoteDueShort(dueIso) {
  if (!dueIso) return '';
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return `In ${days}d`;
  if (days < -1 && days > -7) return `${Math.abs(days)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function isNoteOverdue(dueIso, columnKey) {
  if (!dueIso) return false;
  if (columnKey === 'done') return false;
  const t = new Date(dueIso).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}
