'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { formatTaskDueDate } from '../../lib/task-dates';
import { ERP_TASK_STATUS_LABELS } from '../../lib/erp-task-status';
import { erpModalPanelMaxWidthClass } from '../erp/ErpModalFormPrimitives';

/** @typedef {'all'|'completed'|'active'|'overdue'|'dueSoon'} WorkloadSliceKey */

const BOARD_LABEL = {
  todo: 'Open',
  in_progress: 'In progress',
  review: 'Review',
  completed: 'Done',
};

/** @type {Record<string, string>} */
const BOARD_BADGE = {
  todo: 'border-slate-300/55 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100',
  in_progress:
    'border-sky-400/55 bg-sky-100 text-sky-950 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100',
  review: 'border-violet-400/45 bg-violet-100 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  completed:
    'border-emerald-500/35 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
};

const TASK_BADGE_CLASS = {
  open: BOARD_BADGE.todo,
  in_progress: BOARD_BADGE.in_progress,
  in_review:
    'border-violet-400/45 bg-violet-100 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  done: BOARD_BADGE.completed,
  cancelled: 'border-slate-400/40 bg-slate-200 text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200',
};

function IconFolder({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPulse({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 12h3l2-6 4 12 2-6h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAlert({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h18.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SLICE_META = {
  all: {
    eyebrow: 'PROJECTS',
    headline: 'All projects',
    empty: 'This member has no projects yet.',
    eyebrowIcon: IconFolder,
    eyebrowWrapClass: 'bg-[#103D4D] text-white ring-2 ring-teal-500/35 shadow-md',
    hint: 'Click any card to open the project workspace.',
    cta: 'Open projects view →',
    mode: 'neutral',
  },
  completed: {
    eyebrow: 'DONE',
    headline: 'Completed projects',
    empty: 'No completed projects for this member.',
    eyebrowIcon: IconCheck,
    eyebrowWrapClass: 'border border-emerald-800/65 bg-emerald-600 text-white shadow-md shadow-emerald-950/35',
    hint: 'Click any card to open the completed project.',
    cta: 'Open projects view →',
    mode: 'emerald',
  },
  active: {
    eyebrow: 'ACTIVE',
    headline: 'Active projects',
    empty: 'No active projects.',
    eyebrowIcon: IconPulse,
    eyebrowWrapClass: 'border border-sky-800/65 bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-md shadow-sky-950/35',
    hint: 'Click any card to open the workspace and track progress.',
    cta: 'Open projects view →',
    mode: 'sky',
  },
  overdue: {
    eyebrow: 'OVERDUE',
    headline: 'Assigned tasks · past due',
    empty: 'No open tasks assigned to them are past due.',
    eyebrowIcon: IconAlert,
    eyebrowWrapClass:
      'border border-rose-900/85 bg-gradient-to-br from-rose-600 to-red-700 text-white shadow-lg shadow-rose-950/45',
    hint: 'Open a card to jump to the project and update the assignment.',
    cta: 'Open matching projects →',
    mode: 'rose',
  },
  dueSoon: {
    eyebrow: 'THIS WEEK',
    headline: 'Assigned tasks · due soon',
    empty: 'No open assignments due in the next 7 days.',
    eyebrowIcon: IconClock,
    eyebrowWrapClass:
      'border border-amber-900/85 bg-gradient-to-br from-amber-500 via-amber-500 to-orange-600 text-white shadow-md shadow-amber-950/35',
    hint: 'Open a card to work the task before the due date.',
    cta: 'Open matching projects →',
    mode: 'amber',
  },
};

/**
 * Detail modal for workload stat rows on Admin → Members.
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {WorkloadSliceKey | null} props.sliceKey
 * @param {string} props.memberName
 * @param {unknown[]} props.items
 * @param {string} props.filteredProjectsHref
 */
export default function ErpMemberWorkloadSliceModal({
  open,
  onClose,
  sliceKey,
  memberName,
  items,
  filteredProjectsHref,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || sliceKey == null || !SLICE_META[sliceKey]) return null;

  const cfg = SLICE_META[sliceKey];
  const EyebrowIcon = cfg.eyebrowIcon;
  const list = Array.isArray(items) ? items : [];
  const n = list.length;

  const pl = n === 1 ? 'project' : 'projects';
  const tl = n === 1 ? 'task' : 'tasks';
  let subtitleSuffix =
    sliceKey === 'all'
      ? `${n} ${pl} · this member`
      : sliceKey === 'completed'
        ? `${n} completed ${pl}`
        : sliceKey === 'active'
          ? `${n} active ${pl}`
          : sliceKey === 'overdue'
            ? `${n} open ${tl} assigned to them · past due`
            : `${n} open ${tl} assigned to them · due within the next week`;

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-slate-950/75 backdrop-blur-md"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workload-slice-modal-title"
        className={`relative z-10 flex max-h-[min(92vh,880px)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/95 shadow-[0_48px_100px_-32px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/[0.05] dark:border-teal-900/50 dark:from-[#141c24] dark:to-[#0f161c] dark:ring-teal-950/50 ${erpModalPanelMaxWidthClass}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-teal-800/60 dark:bg-[#1a2630] dark:text-slate-200 dark:hover:bg-[#1f2d3a]"
        >
          Close
        </button>

        <div className="shrink-0 border-b border-slate-200/80 px-6 pb-5 pt-6 pr-24 dark:border-teal-900/40">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ${cfg.eyebrowWrapClass}`}
            >
              <EyebrowIcon className="h-3.5 w-3.5 opacity-95" />
              {cfg.eyebrow}
            </span>
          </div>
          <h2 id="workload-slice-modal-title" className="mt-3 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
            {cfg.headline} · {memberName || 'Member'}
          </h2>
          <p className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">{subtitleSuffix}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-10 text-center text-sm font-medium text-slate-500 dark:border-teal-900/40 dark:bg-[#121a22] dark:text-slate-400">
              {cfg.empty}
            </p>
          ) : (
            <ul className="space-y-3">
              {list.map((raw) => {
                const it = /** @type {any} */ (raw);
                const taskRow = it.kind === 'task' || it.taskId != null;

                const renderDueColumn = () => {
                  const showRose = sliceKey === 'overdue' && it.daysOverdue != null;
                  const showAmber = sliceKey === 'dueSoon' && it.daysUntilDue != null;
                  if (showRose) {
                    return (
                      <>
                        <p className="text-lg font-extrabold tabular-nums text-rose-600 dark:text-rose-400">
                          {it.daysOverdue} {it.daysOverdue === 1 ? 'day' : 'days'} overdue
                        </p>
                        {it.deadlineDate ? (
                          <p className="mt-1 text-[11px] font-semibold text-rose-500/95 dark:text-rose-400/90">
                            Due {formatTaskDueDate(it.deadlineDate)}
                          </p>
                        ) : null}
                      </>
                    );
                  }
                  if (showAmber) {
                    return (
                      <>
                        <p className="text-lg font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
                          {it.daysUntilDue === 0
                            ? 'Due today'
                            : `${it.daysUntilDue} ${it.daysUntilDue === 1 ? 'day' : 'days'} left`}
                        </p>
                        {it.deadlineDate ? (
                          <p className="mt-1 text-[11px] font-semibold text-amber-600/95 dark:text-amber-300/95">
                            Due {formatTaskDueDate(it.deadlineDate)}
                          </p>
                        ) : null}
                      </>
                    );
                  }
                  return (
                    <>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Deadline
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                        {it.deadlineDate ? formatTaskDueDate(it.deadlineDate) : '—'}
                      </p>
                    </>
                  );
                };

                if (taskRow) {
                  const ts = String(it.taskStatus || 'open');
                  const taskLabel = ERP_TASK_STATUS_LABELS[ts] || ts.replace(/_/g, ' ');
                  const taskBadgeClass = TASK_BADGE_CLASS[ts] || TASK_BADGE_CLASS.open;

                  return (
                    <li key={it.taskId}>
                      <Link
                        href={`/erp/projects/${it.projectId}`}
                        onClick={onClose}
                        className="group block rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm transition hover:border-cyan-300/60 hover:shadow-[0_12px_40px_-18px_rgba(16,61,77,0.25)] dark:border-teal-900/45 dark:bg-[#151f28] dark:hover:border-teal-600/50"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${taskBadgeClass}`}
                              >
                                {taskLabel}
                              </span>
                            </div>
                            <p className="text-base font-bold leading-snug text-slate-900 group-hover:text-[#103D4D] dark:text-slate-100 dark:group-hover:text-teal-200">
                              {it.name}
                            </p>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {it.projectLabel}
                              {it.clientName ? ` · ${it.clientName}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 text-right sm:min-w-[8.5rem]">{renderDueColumn()}</div>
                        </div>
                      </Link>
                    </li>
                  );
                }

                const bc = String(it.boardColumn || 'todo');
                const bl = BOARD_LABEL[bc] || bc.replace(/_/g, ' ');
                const badgeClass = BOARD_BADGE[bc] || BOARD_BADGE.todo;

                return (
                  <li key={it.projectId}>
                    <Link
                      href={`/erp/projects/${it.projectId}`}
                      onClick={onClose}
                      className="group block rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm transition hover:border-cyan-300/60 hover:shadow-[0_12px_40px_-18px_rgba(16,61,77,0.25)] dark:border-teal-900/45 dark:bg-[#151f28] dark:hover:border-teal-600/50"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${badgeClass}`}
                            >
                              {bl}
                            </span>
                          </div>
                          <p className="text-base font-bold leading-snug text-slate-900 group-hover:text-[#103D4D] dark:text-slate-100 dark:group-hover:text-teal-200">
                            {it.name}
                          </p>
                          {it.clientName ? (
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{it.clientName}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right sm:min-w-[8.5rem]">{renderDueColumn()}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200/80 bg-slate-50/90 px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-6 dark:border-teal-900/40 dark:bg-[#141c23]">
          <p className="text-[11px] font-medium leading-relaxed text-slate-500 sm:max-w-md dark:text-slate-400">
            {cfg.hint}{' '}
            <Link
              href={filteredProjectsHref}
              onClick={onClose}
              className="font-bold text-[#103D4D] underline underline-offset-2 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
            >
              Browse the filtered Projects grid
            </Link>{' '}
            for the same subset.
          </p>
          <Link
            href={filteredProjectsHref}
            onClick={onClose}
            className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-3 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-teal-950/25 ring-1 ring-white/15 transition hover:shadow-xl sm:mt-0 sm:w-auto dark:shadow-black/35"
          >
            {cfg.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
