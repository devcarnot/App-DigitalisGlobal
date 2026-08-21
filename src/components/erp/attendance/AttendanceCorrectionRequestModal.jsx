'use client';

import { useMemo, useState } from 'react';
import { ErpDateTimeInput } from '../ErpDateInput';
import { datetimeLocalValueToIsoUtc, isoToDatetimeLocalValue } from '../../../lib/erp-attendance';
import {
  defaultCheckInLocalValue,
  defaultCheckoutLocalValue,
  submitAttendanceCorrection,
} from '../../../lib/erp-attendance-corrections';
import { erpModalPanelMaxWidthClass } from '../ErpModalFormPrimitives';

function resolveRequestKind(item) {
  if (item?.requestKind) return item.requestKind;
  if (item?.kind === 'missing') return 'missing_checkout';
  return 'absent_explain';
}

function initialCheckInLocal(item, requestKind) {
  if (requestKind === 'adjust_times' && item?.attendanceRow?.check_in_at) {
    return isoToDatetimeLocalValue(item.attendanceRow.check_in_at);
  }
  if (requestKind === 'forgot_punch') return defaultCheckInLocalValue(item?.dateStr);
  return '';
}

function initialCheckOutLocal(item, requestKind) {
  if (requestKind === 'adjust_times' && item?.attendanceRow?.check_out_at) {
    return isoToDatetimeLocalValue(item.attendanceRow.check_out_at);
  }
  if (requestKind === 'missing_checkout' || requestKind === 'forgot_punch' || requestKind === 'adjust_times') {
    return defaultCheckoutLocalValue(item?.dateStr);
  }
  return '';
}

function needsCheckInField(requestKind) {
  return requestKind === 'forgot_punch' || requestKind === 'adjust_times';
}

function needsCheckOutField(requestKind) {
  return requestKind === 'missing_checkout' || requestKind === 'forgot_punch' || requestKind === 'adjust_times';
}

export default function AttendanceCorrectionRequestModal({ item, onClose, onSubmitted }) {
  const requestKind = resolveRequestKind(item);
  const [checkInLocal, setCheckInLocal] = useState(() => initialCheckInLocal(item, requestKind));
  const [checkOutLocal, setCheckOutLocal] = useState(() => initialCheckOutLocal(item, requestKind));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const title = useMemo(() => {
    if (requestKind === 'missing_checkout') return 'Request check-out correction';
    if (requestKind === 'forgot_punch') return 'Request attendance correction';
    if (requestKind === 'adjust_times') return 'Request time correction';
    return 'Explain absence';
  }, [requestKind]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!item?.dateStr) return;
    setBusy(true);
    setError('');
    try {
      let requestedCheckOutIso = null;
      let requestedCheckInIso = null;

      if (needsCheckOutField(requestKind)) {
        if (!checkOutLocal.trim()) {
          throw new Error('Pick the check-out time you want recorded.');
        }
        requestedCheckOutIso = datetimeLocalValueToIsoUtc(checkOutLocal);
        if (!requestedCheckOutIso) {
          throw new Error('Invalid check-out time.');
        }
      }

      if (needsCheckInField(requestKind)) {
        if (!checkInLocal.trim()) {
          throw new Error('Pick the check-in time you want recorded.');
        }
        requestedCheckInIso = datetimeLocalValueToIsoUtc(checkInLocal);
        if (!requestedCheckInIso) {
          throw new Error('Invalid check-in time.');
        }
        if (requestedCheckOutIso && requestedCheckInIso >= requestedCheckOutIso) {
          throw new Error('Check-out must be after check-in.');
        }
      }

      await submitAttendanceCorrection({
        workDate: item.dateStr,
        kind: requestKind,
        requestedCheckOutIso,
        requestedCheckInIso,
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
          {requestKind === 'forgot_punch' ? (
            <p className="text-[12px] text-slate-600 dark:text-slate-300">
              You were at work but forgot to check in/out. Enter the times and admin will review before applying.
            </p>
          ) : null}

          {requestKind === 'adjust_times' ? (
            <p className="text-[12px] text-slate-600 dark:text-slate-300">
              Update the check-in and check-out times for this day. Admin will review before applying.
            </p>
          ) : null}

          {needsCheckInField(requestKind) ? (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Check-in time (GMT+5)
              </span>
              <ErpDateTimeInput
                value={checkInLocal}
                onChange={(e) => setCheckInLocal(e.target.value)}
                disabled={busy}
                className="mt-1.5"
              />
            </label>
          ) : null}

          {needsCheckOutField(requestKind) ? (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Check-out time (GMT+5)
              </span>
              {requestKind === 'missing_checkout' ? (
                <p className="mt-1 mb-2 text-[11.5px] text-slate-500">
                  Admin will review this and apply the check-out if approved.
                </p>
              ) : null}
              <ErpDateTimeInput
                value={checkOutLocal}
                onChange={(e) => setCheckOutLocal(e.target.value)}
                disabled={busy}
                className="mt-1.5"
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
              placeholder={
                requestKind === 'forgot_punch'
                  ? 'e.g. Was in office all day but forgot to punch'
                  : requestKind === 'adjust_times'
                    ? 'e.g. Punched in late by mistake'
                    : requestKind === 'missing_checkout'
                      ? 'e.g. Forgot to punch out after client call'
                      : 'What happened?'
              }
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
