'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  breakHmsToSeconds,
  breakSecondsToHms,
  datetimeLocalValueToIsoUtc,
  formatDurationHms,
  formatWorkDate,
  isoToDatetimeLocalValue,
} from '../../../lib/erp-attendance';
import { broadcastErpAttendanceChange } from '../../../lib/erp-realtime-sync';
import { ErpDateTimeInput } from '../ErpDateInput';
import { erpModalPanelMaxWidthClass } from '../ErpModalFormPrimitives';

/**
 * @param {{
 *   row: object | null,
 *   memberName?: string,
 *   onClose: () => void,
 *   onSaved?: () => void,
 * }} props
 */
export default function AttendanceEditTimesModal({ row, memberName = 'Member', onClose, onSaved }) {
  const [editCheckInLocal, setEditCheckInLocal] = useState('');
  const [editCheckOutLocal, setEditCheckOutLocal] = useState('');
  const [editBreakHours, setEditBreakHours] = useState('0');
  const [editBreakMinutes, setEditBreakMinutes] = useState('0');
  const [editBreakSeconds, setEditBreakSeconds] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!row) return;
    const { hours, minutes, seconds } = breakSecondsToHms(row.break_seconds_total);
    setEditCheckInLocal(isoToDatetimeLocalValue(row.check_in_at));
    setEditCheckOutLocal(row.check_out_at ? isoToDatetimeLocalValue(row.check_out_at) : '');
    setEditBreakHours(String(hours));
    setEditBreakMinutes(String(minutes));
    setEditBreakSeconds(String(seconds));
    setError('');
  }, [row]);

  const save = useCallback(async () => {
    if (!row?.id) return;
    const inIso = datetimeLocalValueToIsoUtc(editCheckInLocal);
    if (!inIso) {
      setError('Check-in date and time are required.');
      return;
    }
    const outIso = editCheckOutLocal.trim() ? datetimeLocalValueToIsoUtc(editCheckOutLocal) : null;
    if (outIso && new Date(outIso).getTime() < new Date(inIso).getTime()) {
      setError('Check-out must be after check-in.');
      return;
    }
    const breakSeconds = breakHmsToSeconds(editBreakHours, editBreakMinutes, editBreakSeconds);
    if (outIso) {
      const grossSec = Math.max(0, Math.floor((new Date(outIso).getTime() - new Date(inIso).getTime()) / 1000));
      if (breakSeconds > grossSec) {
        setError('Break time cannot be longer than the shift (check-in to check-out).');
        return;
      }
    } else if (breakSeconds > 0) {
      setError('Add a check-out time before setting break duration for an open shift.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_admin_set_times', {
        p_id: row.id,
        p_check_in_at: inIso,
        p_check_out_at: outIso,
        p_break_seconds_total: breakSeconds,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      broadcastErpAttendanceChange(row.user_id);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }, [
    row,
    editCheckInLocal,
    editCheckOutLocal,
    editBreakHours,
    editBreakMinutes,
    editBreakSeconds,
    onClose,
    onSaved,
  ]);

  if (!row) return null;

  return (
    <div className="fixed inset-0 z-[750] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => !busy && onClose()}
      />
      <div
        className={`relative z-[751] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-3xl dark:border-teal-900/50 dark:bg-[#0a1018]`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit check-in / check-out / breaks</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {memberName} · {formatWorkDate(row.work_date)}
        </p>
        <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
          Times use your browser&apos;s local timezone. Leave check-out empty if they forgot to check out. Working time
          is shift duration minus breaks.
        </p>
        {row.break_started_at ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100">
            On break now. Saving will end the active break and update times, and apply the break total below.
          </p>
        ) : null}
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-in</label>
            <ErpDateTimeInput value={editCheckInLocal} onChange={(e) => setEditCheckInLocal(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Check-out <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <ErpDateTimeInput value={editCheckOutLocal} onChange={(e) => setEditCheckOutLocal(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Break time <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <p className="mb-2 text-[12px] text-slate-500 dark:text-slate-400">
              Total unpaid break for this day. Requires check-out if greater than zero.
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <input
                type="number"
                min={0}
                max={23}
                inputMode="numeric"
                value={editBreakHours}
                onChange={(e) => setEditBreakHours(e.target.value)}
                className="h-[2.75rem] w-[4.75rem] min-w-[4.75rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium tabular-nums text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/80 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-200"
                aria-label="Break hours"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">h</span>
              <input
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                value={editBreakMinutes}
                onChange={(e) => setEditBreakMinutes(e.target.value)}
                className="h-[2.75rem] w-[4.75rem] min-w-[4.75rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium tabular-nums text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/80 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-200"
                aria-label="Break minutes"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">m</span>
              <input
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                value={editBreakSeconds}
                onChange={(e) => setEditBreakSeconds(e.target.value)}
                className="h-[2.75rem] w-[4.75rem] min-w-[4.75rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium tabular-nums text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/80 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-200"
                aria-label="Break seconds"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">s</span>
              <span className="w-full text-[12px] font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:w-auto">
                Total {formatDurationHms(breakHmsToSeconds(editBreakHours, editBreakMinutes, editBreakSeconds))}
              </span>
            </div>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-xl erp-brand-fill px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
