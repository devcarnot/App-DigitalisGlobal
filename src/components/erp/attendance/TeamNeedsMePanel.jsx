'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  formatCorrectionClock,
  reviewAttendanceCorrection,
} from '../../../lib/erp-attendance-corrections';
import { formatWorkDate } from '../../../lib/erp-attendance';
import { broadcastErpAttendanceChange } from '../../../lib/erp-realtime-sync';
import { memberWorkloadSliceHref } from '../../../lib/erp-member-projects-links';
import { AttendancePanel } from './AttendancePageFrame';

/**
 * Team lead sidebar: corrections, open shifts, no check-in alerts.
 */
export default function TeamNeedsMePanel({
  pendingCorrections = [],
  profileById = {},
  memberIds = [],
  todayRowsByUser = {},
  todayStr,
  openShiftCount = 0,
  workloadByUser,
  canReview = true,
  onReviewed,
  onMemberClick,
}) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const teamSet = useMemo(() => new Set(memberIds), [memberIds]);

  const teamCorrections = useMemo(
    () => (pendingCorrections || []).filter((r) => teamSet.has(r.user_id)),
    [pendingCorrections, teamSet],
  );

  const notInToday = useMemo(() => {
    const out = [];
    for (const id of memberIds) {
      const row = todayRowsByUser[id];
      if (!row?.check_in_at) {
        const profile = profileById[id];
        out.push({
          id,
          name: profile?.full_name?.trim() || 'Member',
          workload: workloadByUser?.get?.(id),
        });
      }
    }
    return out;
  }, [memberIds, todayRowsByUser, profileById, workloadByUser]);

  async function onReview(row, action) {
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

  const empty = teamCorrections.length === 0 && openShiftCount === 0 && notInToday.length === 0;

  return (
    <AttendancePanel className="w-full lg:w-[296px] lg:flex-none !p-[15px] sm:!px-[18px]">
      <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Needs me</p>

      {error ? <p className="mt-2 text-[11px] font-medium text-red-600">{error}</p> : null}

      <div className="mt-3 flex flex-col gap-2">
        {empty ? (
          <p className="text-[11.5px] text-slate-500">No urgent items right now.</p>
        ) : null}

        {teamCorrections.map((row) => {
          const profile = profileById[row.user_id];
          const name = profile?.full_name?.trim() || 'Member';
          return (
            <div key={row.id} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-teal-900/45">
              <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                {name} · correction request
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
                {formatWorkDate(row.work_date)}
                {row.kind === 'missing_checkout'
                  ? ` · missing punch, claims out ${formatCorrectionClock(row.requested_check_out_at)}`
                  : row.member_note
                    ? ` · ${row.member_note}`
                    : ' · absent explanation'}
              </p>
              {canReview ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void onReview(row, 'approve')}
                    className="inline-flex h-7 items-center rounded-md erp-brand-fill px-2.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void onReview(row, 'reject')}
                    className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {openShiftCount > 0 ? (
          <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-teal-900/45">
            <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
              {openShiftCount} open shift{openShiftCount === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[11.5px] text-slate-500">Missing check-out on past days in this fortnight.</p>
          </div>
        ) : null}

        {notInToday.slice(0, 3).map(({ id, name, workload }) => (
          <div
            key={id}
            className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/25"
          >
            <p className="text-[12px] font-semibold text-amber-950 dark:text-amber-100">{name} · no check-in</p>
            <p className="mt-1 text-[11.5px] text-slate-600 dark:text-slate-400">No punch today.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onMemberClick?.(id)}
                className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold dark:border-teal-800/45 dark:bg-[#131b24]"
              >
                View attendance
              </button>
              {workload?.openTasks > 0 ? (
                <Link
                  href={memberWorkloadSliceHref(id, 'assigned')}
                  className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
                >
                  {workload.openTasks} open tasks
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500 dark:border-teal-900/35">
        Approve applies the member&apos;s correction. HR disputes stay in the admin queue when escalated.
      </p>
    </AttendancePanel>
  );
}
