'use client';

import { useEffect } from 'react';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';

/**
 * In-app confirmation modal — use instead of window.confirm for a consistent ERP look.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} [props.title]
 * @param {string} [props.description] — plain-text body (alternative to children)
 * @param {import('react').ReactNode} [props.children] — message body (text or rich)
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {'danger' | 'neutral' | 'teal'} [props.tone] — primary button style
 * @param {boolean} [props.busy]
 * @param {() => void} props.onCancel
 * @param {() => void} props.onConfirm
 */
export default function ErpConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  let confirmClass =
    'rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ';
  if (tone === 'danger') {
    confirmClass +=
      'bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 dark:shadow-black/30';
  } else if (tone === 'teal') {
    confirmClass += 'erp-brand-fill shadow-teal-900/20 dark:shadow-black/30';
  } else {
    confirmClass +=
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm dark:border-teal-800/55 dark:bg-[#15202c] dark:text-slate-100 dark:hover:bg-[#1a2836]';
  }

  const body = children ?? (description ? <p>{description}</p> : null);

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] dark:bg-black/60 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => !busy && onCancel?.()}
      />
      <div
        className={`relative z-[701] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl ring-1 ring-slate-900/[0.04] dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-[0_28px_70px_-28px_rgba(0,0,0,0.75)] dark:ring-white/[0.03] sm:rounded-3xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'erp-confirm-dialog-title' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2
            id="erp-confirm-dialog-title"
            className="text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
        ) : null}
        {body ? (
          <div
            className={
              title
                ? 'mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400'
                : 'text-sm leading-relaxed text-slate-600 dark:text-slate-400'
            }
          >
            {body}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#121a22] dark:text-slate-200 dark:hover:bg-[#162029]"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={confirmClass}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
