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

function NeedsCard({ tone = 'default', title, body, children }) {
  const tones = {
    default:
      'border-slate-200/90 bg-white dark:border-teal-900/45 dark:bg-[#101824]',
    warn: 'border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-orange-50/40 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/10',
    alert:
      'border-rose-200/80 bg-gradient-to-br from-rose-50/70 to-white dark:border-rose-900/40 dark:from-rose-950/25 dark:to-[#101824]',
  };
  const accent = {
    default: 'bg-[#103D4D]',
    warn: 'bg-amber-500',
    alert: 'bg-rose-500',
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border shadow-sm ${tones[tone] || tones.default}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${accent[tone] || accent.default}`} aria-hidden />
      <div className="px-3.5 py-3 pl-4">
        <p className="text-[12px] font-semibold leading-snug text-slate-900 dark:text-white">{title}</p>
        {body ? <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">{body}</p> : null}
        {children}
      </div>
    </div>
  );
}

export default function TeamNeedsMePanel({
  pendingCorrections = [],
  profileById = {},
  memberIds = [],
  todayRowsByUser = {},
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

  const itemCount = teamCorrections.length + (openShiftCount > 0 ? 1 : 0) + Math.min(notInToday.length, 3);

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

  const empty = itemCount === 0;

  return (
    <AttendancePanel className="flex w-full flex-col !p-0 lg:w-[300px] lg:flex-none lg:shadow-[0_4px_20px_-8px_rgba(16,61,77,0.12)] dark:lg:shadow-none">
      <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50/50 via-white to-rose-50/30 px-4 py-3.5 dark:border-teal-900/35 dark:from-violet-950/20 dark:via-[#0c121a] dark:to-rose-950/10 sm:px-[18px]">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Needs me</p>
          {itemCount > 0 ? (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#103D4D] px-1.5 text-[10px] font-bold tabular-nums text-white dark:bg-teal-700">
              {itemCount}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Actions waiting on you today</p>
      </div>

      <div className="flex flex-1 flex-col px-4 py-3 sm:px-[18px]">
        {error ? (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-700 dark:border-red-900/45 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5">
          {empty ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center dark:border-teal-900/45 dark:bg-[#0a1018]">
              <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">All clear</p>
              <p className="mt-1 text-[11px] text-slate-500">No urgent items right now.</p>
            </div>
          ) : null}

          {teamCorrections.map((row) => {
            const profile = profileById[row.user_id];
            const name = profile?.full_name?.trim() || 'Member';
            return (
              <NeedsCard
                key={row.id}
                tone="alert"
                title={`${name} · correction`}
                body={`${formatWorkDate(row.work_date)}${
                  row.kind === 'missing_checkout'
                    ? ` · claims out ${formatCorrectionClock(row.requested_check_out_at)}`
                    : row.kind === 'forgot_punch'
                      ? ` · claims in ${formatCorrectionClock(row.requested_check_in_at)}, out ${formatCorrectionClock(row.requested_check_out_at)}`
                      : row.kind === 'adjust_times'
                        ? ` · adjust to in ${formatCorrectionClock(row.requested_check_in_at)}, out ${formatCorrectionClock(row.requested_check_out_at)}`
                        : row.member_note
                        ? ` · ${row.member_note}`
                        : ' · absent explanation'
                }`}
              >
                {canReview ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onReview(row, 'approve')}
                      className="inline-flex h-8 items-center rounded-lg erp-brand-fill px-3 text-[11.5px] font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onReview(row, 'reject')}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-semibold shadow-sm dark:border-teal-800/45 dark:bg-[#131b24]"
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </NeedsCard>
            );
          })}

          {openShiftCount > 0 ? (
            <NeedsCard
              tone="default"
              title={`${openShiftCount} open shift${openShiftCount === 1 ? '' : 's'}`}
              body="Missing check-out on past days in this fortnight."
            />
          ) : null}

          {notInToday.slice(0, 3).map(({ id, name, workload }) => (
            <NeedsCard key={id} tone="warn" title={`${name} · no check-in`} body="No punch recorded today.">
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onMemberClick?.(id)}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-semibold shadow-sm dark:border-teal-800/45 dark:bg-[#131b24]"
                >
                  View attendance
                </button>
                {workload?.openTasks > 0 ? (
                  <Link
                    href={memberWorkloadSliceHref(id, 'assigned')}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-semibold shadow-sm dark:border-teal-800/45 dark:bg-[#131b24]"
                  >
                    {workload.openTasks} tasks
                  </Link>
                ) : null}
              </div>
            </NeedsCard>
          ))}
        </div>

        <p className="mt-auto border-t border-slate-100 pt-3 text-[10.5px] leading-relaxed text-slate-500 dark:border-teal-900/35">
          Approve applies the member&apos;s correction. HR disputes stay in the admin queue when escalated.
        </p>
      </div>
    </AttendancePanel>
  );
}
