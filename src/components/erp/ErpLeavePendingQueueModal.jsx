'use client';

import { useEffect } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import { erpModalBackdropClass } from './ErpModalFormPrimitives';
import { LEAVE_TYPE_LABELS } from '../../lib/erp-leave';

const PANEL =
  'relative z-[1] flex max-h-[min(92dvh,680px)] w-full max-w-[min(calc(100vw-2rem),520px)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_28px_70px_-28px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/[0.04] dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-[0_28px_70px_-28px_rgba(0,0,0,0.7)] dark:ring-white/[0.03]';

/**
 * Scrollable list of every pending leave request so reviewers can open any row
 * (not only the first in the queue).
 */
export default function ErpLeavePendingQueueModal({ open, onClose, rows, nameById, onPickRow }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" role="presentation">
        <button type="button" aria-label="Close" onClick={() => onClose?.()} className={erpModalBackdropClass} />
        <div className={PANEL} role="dialog" aria-modal="true" aria-labelledby="erp-pending-queue-title">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-teal-900/50">
            <div className="min-w-0">
              <p id="erp-pending-queue-title" className="text-base font-bold text-slate-900 dark:text-white">
                Pending leave requests
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {rows.length} open · tap a row to view full details
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 [scrollbar-width:thin]">
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPickRow?.(r.id)}
                    className="w-full rounded-2xl border border-amber-200/70 bg-gradient-to-r from-white to-amber-50/50 px-4 py-3 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md dark:border-amber-900/45 dark:from-[#121a22] dark:to-[#1a1408]/90 dark:hover:border-amber-700/55"
                  >
                    <p className="font-bold text-slate-900 dark:text-white">{nameById[r.user_id] || 'Member'}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}
                      </span>{' '}
                      · {r.start_date} → {r.end_date} · {r.day_count} day{r.day_count === 1 ? '' : 's'}
                    </p>
                    {r.reason ? (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {r.reason}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
