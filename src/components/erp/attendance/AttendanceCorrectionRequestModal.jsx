'use client';

import { useMemo, useState } from 'react';
import { ErpDateTimeInput } from '../ErpDateInput';
import { datetimeLocalValueToIsoUtc } from '../../../lib/erp-attendance';
import {
  defaultCheckoutLocalValue,
  submitAttendanceCorrection,
} from '../../../lib/erp-attendance-corrections';
import { erpModalPanelMaxWidthClass } from '../ErpModalFormPrimitives';

export default function AttendanceCorrectionRequestModal({ item, onClose, onSubmitted }) {
  const [checkOutLocal, setCheckOutLocal] = useState(() =>
    item?.kind === 'missing' ? defaultCheckoutLocalValue(item.dateStr) : '',
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const title = useMemo(() => {
    if (item?.kind === 'missing') return 'Request check-out correction';
    return 'Explain absence';
  }, [item?.kind]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!item?.dateStr) return;
    setBusy(true);
    setError('');
    try {
      const kind = item.kind === 'missing' ? 'missing_checkout' : 'absent_explain';
      let requestedCheckOutIso = null;
      if (kind === 'missing_checkout') {
        if (!checkOutLocal.trim()) {
          throw new Error('Pick the check-out time you want recorded.');
        }
        requestedCheckOutIso = datetimeLocalValueToIsoUtc(checkOutLocal);
        if (!requestedCheckOutIso) {
          throw new Error('Invalid check-out time.');
        }
      }
      await submitAttendanceCorrection({
        workDate: item.dateStr,
        kind,
        requestedCheckOutIso,
        memberNote: note,
        attendanceDayId: item.attendanceDayId,
      });
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Could not submit correction');
    } finally {
      setBusy(false);
    }
  }

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-correction-title"
        className={`relative z-[1] w-full ${erpModalPanelMaxWidthClass} rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl dark:border-teal-900/45 dark:bg-[#0c121a] sm:p-5`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="attendance-correction-title" className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="mt-1 text-[12px] text-slate-500">{item.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#131b24]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3">
          {item.kind === 'missing' ? (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Check-out time (GMT+5)
              </span>
              <p className="mt-1 mb-2 text-[11.5px] text-slate-500">
                Admin will review this and apply the check-out if approved.
              </p>
              <ErpDateTimeInput
                value={checkOutLocal}
                onChange={(e) => setCheckOutLocal(e.target.value)}
                disabled={busy}
              />
            </label>
          ) : (
            <p className="text-[12px] text-slate-600 dark:text-slate-300">
              Tell your manager why you were absent. HR may approve leave retroactively or mark it explained.
            </p>
          )}

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder={item.kind === 'missing' ? 'e.g. Forgot to punch out after client call' : 'What happened?'}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-100"
            />
          </label>

          {error ? <p className="text-[12px] font-medium text-red-600">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold dark:border-teal-900/45 dark:bg-[#131b24]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 items-center rounded-lg erp-brand-fill px-4 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send to admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
