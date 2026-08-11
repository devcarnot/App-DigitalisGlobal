'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';
import ErpLeaveDetailModal from './ErpLeaveDetailModal';
import { erpModalBackdropClass } from './ErpModalFormPrimitives';

const PANEL_CLASS =
  'relative z-[1] flex max-h-[min(94dvh,720px)] w-full max-w-[min(calc(100vw-2rem),640px)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_28px_70px_-28px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/[0.04] dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-[0_28px_70px_-28px_rgba(0,0,0,0.7)] dark:ring-white/[0.03]';

/**
 * Leave detail dialog, or a read-only fallback when we only have the notification copy
 * (e.g. legacy rows with no request id in `link`).
 */
export default function ErpLeaveOrNoticeModal({
  open,
  onClose,
  request,
  memberName,
  reviewerName,
  viewerRole,
  onChangeStatus,
  busy = false,
  onOpenAttachment,
  fallbackNotice,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose, open]);

  if (!open) return null;

  if (request) {
    return (
      <ErpLeaveDetailModal
        open
        request={request}
        memberName={memberName}
        reviewerName={reviewerName}
        viewerRole={viewerRole}
        onClose={onClose}
        onChangeStatus={onChangeStatus}
        onOpenAttachment={onOpenAttachment}
        busy={busy}
      />
    );
  }

  if (fallbackNotice && (fallbackNotice.title || fallbackNotice.body)) {
    return (
      <ErpBodyPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" role="presentation">
          <button type="button" aria-label="Close dialog" onClick={() => !busy && onClose?.()} className={erpModalBackdropClass} />
          <div className={PANEL_CLASS} role="dialog" aria-modal="true" aria-labelledby="erp-leave-fallback-title">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-teal-900/50">
              <h2 id="erp-leave-fallback-title" className="text-base font-bold text-slate-900 dark:text-white">
                {fallbackNotice.title || 'Leave update'}
              </h2>
              <button
                type="button"
                onClick={() => !busy && onClose?.()}
                className="rounded-xl border border-slate-200/90 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-teal-800/55 dark:text-slate-200 dark:hover:bg-[#15202c]"
              >
                Close
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                {fallbackNotice.body || 'n/a'}
              </p>
              <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                Full structured leave data could not be loaded from this notification. Open the Leave page to review in context.
              </p>
              <Link
                href="/erp/leave"
                onClick={() => onClose?.()}
                className="mt-3 inline-flex rounded-xl erp-brand-fill px-4 py-2 text-[11px] font-bold text-white shadow-md"
              >
                Open Leave
              </Link>
            </div>
          </div>
        </div>
      </ErpBodyPortal>
    );
  }

  return null;
}
