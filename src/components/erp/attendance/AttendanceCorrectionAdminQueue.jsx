'use client';

import { useMemo, useState } from 'react';
import {
  ATTENDANCE_CORRECTION_STATUS_META,
  formatCorrectionClock,
  formatCorrectionSubmittedLabel,
  reviewAttendanceCorrection,
} from '../../../lib/erp-attendance-corrections';
import { broadcastErpAttendanceChange } from '../../../lib/erp-realtime-sync';
import { formatWorkDate } from '../../../lib/erp-attendance';
import ErpUserAvatar from '../ErpUserAvatar';
import { AttendancePanel } from './AttendancePageFrame';

export default function AttendanceCorrectionAdminQueue({ pending, profileById, canReview, onReviewed }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const sorted = useMemo(
    () => [...(pending || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [pending],
  );

  async function onAction(row, action) {
    if (!canReview || busyId) return;
    setBusyId(row.id);
    setError('');
    try {
      await reviewAttendanceCorrection(row.id, action);
      broadcastErpAttendanceChange(row.user_id);
      onReviewed?.();
    } catch (e) {
      setError(e?.message || 'Could not update request');
    } finally {
      setBusyId(null);
    }
  }

  if (!canReview) return null;

  return (
    <AttendancePanel className="!p-[15px] sm:!px-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Correction requests</p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {sorted.length} pending
        </span>
      </div>

      {error ? <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p> : null}

      {sorted.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-slate-500">No pending correction requests.</p>
      ) : (
        <div className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-0.5">
          {sorted.map((row) => {
            const profile = profileById[row.user_id];
            const name = profile?.full_name || 'Member';
            return (
              <div
                key={row.id}
                className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-teal-900/45"
              >
                <div className="flex items-start gap-2.5">
                  <ErpUserAvatar profile={profile || { id: row.user_id, full_name: name }} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                      {name} · {formatWorkDate(row.work_date)}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
                      {row.kind === 'missing_checkout' ? (
                        <>
                          Missing check-out — apply{' '}
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                            {formatCorrectionClock(row.requested_check_out_at)}
                          </span>{' '}
                          (GMT+5)
                        </>
                      ) : (
                        <>Absent explanation{row.member_note ? `: “${row.member_note}”` : ''}</>
                      )}
                    </p>
                    {row.member_note && row.kind === 'missing_checkout' ? (
                      <p className="mt-1 text-[11px] text-slate-500">Note: {row.member_note}</p>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void onAction(row, 'approve')}
                        className="inline-flex h-7 items-center rounded-md erp-brand-fill px-2.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
                      >
                        Approve & apply
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void onAction(row, 'reject')}
                        className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AttendancePanel>
  );
}

export function AttendanceCorrectionHistoryLine({ row }) {
  const meta = ATTENDANCE_CORRECTION_STATUS_META[row.status] || ATTENDANCE_CORRECTION_STATUS_META.pending;
  return (
    <p className="text-[11.5px] leading-snug text-slate-500">
      {formatCorrectionSubmittedLabel(row)} →{' '}
      <span className={meta.tone}>{meta.label}</span>
    </p>
  );
}
