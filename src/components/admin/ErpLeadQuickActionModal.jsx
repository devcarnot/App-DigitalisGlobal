'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const CONFIG = {
  note: { title: 'Add note', submit: 'Save note', placeholder: 'What was discussed? Next steps…' },
  task: { title: 'Add task', submit: 'Save task', placeholder: 'Follow up, send proposal, call back…' },
  meeting: { title: 'Book follow-up', submit: 'Save follow-up', placeholder: 'Meeting purpose or reminder…' },
};

/**
 * Small modal for logging a note, task, or follow-up on a lead.
 */
export default function ErpLeadQuickActionModal({ open, kind = 'note', leadLabel, busy, error, value, dueAt, onChange, onDueChange, onClose, onSubmit }) {
  const cfg = CONFIG[kind] || CONFIG.note;

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[235] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" aria-label="Close" onClick={() => !busy && onClose?.()} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-teal-900/55 dark:bg-[#121f28]"
      >
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{cfg.title}</h3>
        {leadLabel ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{leadLabel}</p> : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          <div>
            <label className="sr-only" htmlFor="erp-lead-quick-body">
              Details
            </label>
            <textarea
              id="erp-lead-quick-body"
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              className="min-h-[6rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
              placeholder={cfg.placeholder}
              maxLength={5000}
              autoFocus
            />
          </div>
          {kind === 'task' || kind === 'meeting' ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-quick-due">
                {kind === 'meeting' ? 'Follow-up date & time' : 'Due date & time'}
              </label>
              <input
                id="erp-lead-quick-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => onDueChange?.(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
              />
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose?.()}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-200"
          >
            Cancel
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-xl erp-brand-fill py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {busy ? 'Saving…' : cfg.submit}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
