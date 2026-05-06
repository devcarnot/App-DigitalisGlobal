'use client';

import { createPortal } from 'react-dom';
import { useEffect, useId } from 'react';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';

/** @typedef {{ id: string, title: string }} TimerPickTaskRow */

function taskLabel(title) {
  const t = typeof title === 'string' ? title.trim() : '';
  return t || '(Untitled task)';
}

/**
 * Chooses which task a new timer session belongs to (or general project time).
 *
 * @param {{
 *   open: boolean,
 *   loading?: boolean,
 *   fetchError?: string | null,
 *   tasks: TimerPickTaskRow[],
 *   projectName?: string | null,
 *   onPick: (choice: { taskId: string | null, taskTitle: string }) => void,
 *   onCancel: () => void,
 *   onRetry?: (() => void) | null,
 * }} props
 */
export default function ErpProjectTimerTaskPickModal({
  open,
  loading = false,
  fetchError = null,
  tasks,
  projectName,
  onPick,
  onCancel,
  onRetry = null,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  const sub =
    typeof projectName === 'string' && projectName.trim()
      ? `Project · ${projectName.trim()}`
      : 'Pick where this session should count.';

  return createPortal(
    <div className="fixed inset-0 z-[280] flex items-end justify-center px-0 py-3 sm:items-center sm:p-4" role="presentation">
      <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3px] dark:bg-black/70" aria-label="Dismiss" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-[1] flex max-h-[min(92dvh,560px)] w-full ${erpModalPanelMaxWidthClass} flex-col overflow-hidden rounded-none border border-teal-200/80 bg-white shadow-[0_24px_72px_-14px_rgba(16,61,77,0.45)] sm:max-h-[min(90vh,640px)] sm:rounded-[1.25rem] dark:border-teal-800/50 dark:bg-[#0c151c]`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-teal-100/95 px-4 py-4 sm:px-5 dark:border-teal-900/40">
          <div className="min-w-0">
            <p id={titleId} className="text-base font-bold tracking-tight text-[#103D4D] dark:text-teal-100">
              Which task are you timing?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{sub}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2832]"
          >
            Cancel
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <p className="py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400">Loading tasks…</p>
          ) : fetchError ? (
            <div className="space-y-3 py-2">
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                {fetchError}
              </p>
              {typeof onRetry === 'function' ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full rounded-xl border border-teal-200/90 bg-teal-50 px-4 py-2.5 text-sm font-bold text-[#103D4D] shadow-sm hover:bg-teal-100 dark:border-teal-700/55 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-900/55"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No tasks in this project.</p>
          ) : (
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => onPick({ taskId: null, taskTitle: '' })}
                  className="flex w-full items-center rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-teal-900/40 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#152029]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span>General · no specific task</span>
                    <span className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Logs time on the project only (session history will show “General”).
                    </span>
                  </span>
                </button>
              </li>
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ taskId: t.id, taskTitle: taskLabel(t.title) })}
                    className="flex w-full min-w-0 items-center rounded-xl border border-teal-200/70 bg-gradient-to-br from-teal-50/80 to-white px-3 py-3 text-left text-sm font-semibold text-[#103D4D] transition hover:border-teal-300 hover:from-teal-50 dark:border-teal-800/45 dark:bg-[#101924] dark:from-transparent dark:to-transparent dark:text-teal-100 dark:hover:border-teal-600/55 dark:hover:bg-[#14222d]"
                  >
                    <span className="min-w-0 truncate" title={taskLabel(t.title)}>
                      {taskLabel(t.title)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
