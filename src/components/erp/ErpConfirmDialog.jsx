'use client';

import { useEffect } from 'react';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';

/**
 * In-app confirmation modal — use instead of window.confirm for a consistent ERP look.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} [props.title]
 * @param {import('react').ReactNode} props.children — message body (text or rich)
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
    'rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ';
  if (tone === 'danger') {
    confirmClass += 'bg-rose-600 hover:bg-rose-700';
  } else if (tone === 'teal') {
    confirmClass += 'bg-gradient-to-r from-[#103D4D] to-teal-700 hover:from-[#0d3545] hover:to-teal-800 shadow-teal-900/20';
  } else {
    confirmClass += 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm';
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => !busy && onCancel?.()}
      />
      <div
        className={`relative z-[701] w-full ${erpModalPanelMaxWidthClass} rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'erp-confirm-dialog-title' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2 id="erp-confirm-dialog-title" className="text-lg font-bold text-slate-900">
            {title}
          </h2>
        ) : null}
        <div className={title ? 'mt-2 text-sm leading-relaxed text-slate-600' : 'text-sm leading-relaxed text-slate-600'}>
          {children}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
