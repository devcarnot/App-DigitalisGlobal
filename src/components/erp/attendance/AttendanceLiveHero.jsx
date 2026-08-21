'use client';

import {
  ERP_ATTENDANCE_POLICY,
  attendanceRowBreakTotalSeconds,
  attendanceRowGrossSeconds,
  classifyAttendanceArrival,
  formatAttendanceHm,
  formatGracePastLabel,
  projectCheckoutForFullDay,
  secondsToFullDay,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds, attendanceBreakTypeLabel, formatWorkDate } from '../../../lib/erp-attendance';
import { formatSecondsAsHms } from '../ErpAttendanceCharts';
import AttendanceBreakOptionsMenu from './AttendanceBreakOptionsMenu';

function formatTimeCompact(iso) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

/**
 * Top live status strip — modern gradient hero for member self-view.
 */
export default function AttendanceLiveHero({
  todayRow,
  todayStr,
  nowMs,
  uid,
  liveNetWorkingLabel,
  liveBreakElapsedLabel,
  isOnBreak,
  isLiveCounting,
  busy,
  profile,
  canCheckIn,
  canCheckOut,
  canStartBreak,
  canEndBreak,
  onCheckIn,
  onCheckOut,
  onBreakStart,
  onBreakEnd,
}) {
  const netSec = todayRow?.check_in_at
    ? attendanceRowNetSeconds(todayRow, nowMs, { uid, workDate: todayRow.work_date, todayStr })
    : 0;
  const grossSec = todayRow
    ? attendanceRowGrossSeconds(todayRow, nowMs, { uid, workDate: todayRow.work_date, todayStr })
    : 0;
  const breakSec = todayRow
    ? attendanceRowBreakTotalSeconds(todayRow, nowMs, { uid, workDate: todayRow.work_date, todayStr })
    : 0;
  const toFullSec = secondsToFullDay(netSec);
  const projectedOut = projectCheckoutForFullDay(nowMs, netSec);
  const gracePast = todayRow?.check_in_at
    ? formatGracePastLabel(todayRow.check_in_at, todayRow.work_date)
    : null;
  const arrival =
    todayRow?.check_in_at ? classifyAttendanceArrival(todayRow.check_in_at, todayRow.work_date) : 'none';
  const heldAtLabel = formatTimeCompact(new Date(nowMs).toISOString());

  const statusTitle = (() => {
    if (isOnBreak) {
      const label = attendanceBreakTypeLabel(todayRow?.break_type, { short: true });
      return label && todayRow?.break_type && todayRow.break_type !== 'general'
        ? `On break — ${label}`
        : 'On break';
    }
    if (todayRow?.check_in_at && !todayRow.check_out_at) return 'Working';
    if (todayRow?.check_out_at) return 'Checked out';
    return 'Not checked in';
  })();

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_4px_20px_-8px_rgba(16,61,77,0.12)] dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-none">
      <div className="border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/50 to-teal-50/30 px-4 py-3 dark:border-teal-900/35 dark:from-[#0c121a] dark:via-[#0c121a] dark:to-teal-950/15 sm:px-[18px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <p className="text-[14px] font-semibold text-[#103D4D] dark:text-white">Today</p>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatWorkDate(todayStr)}</span>
          {isLiveCounting || isOnBreak ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {!todayRow?.check_in_at ? (
              <button
                type="button"
                disabled={busy || !profile || !canCheckIn}
                onClick={onCheckIn}
                className="inline-flex h-7 items-center justify-center rounded-lg erp-brand-fill px-2.5 text-[10px] font-bold text-white shadow-sm disabled:opacity-40"
              >
                Check in
              </button>
            ) : null}
            {canCheckOut ? (
              <button
                type="button"
                disabled={busy || !profile}
                onClick={onCheckOut}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:bg-[#131b24] dark:text-slate-200"
              >
                Check out
              </button>
            ) : null}
            {canEndBreak ? (
              <button
                type="button"
                disabled={busy || !profile}
                onClick={onBreakEnd}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-[#131b24] dark:text-slate-200"
              >
                Resume
              </button>
            ) : canStartBreak ? (
              <AttendanceBreakOptionsMenu
                disabled={!profile}
                busy={busy}
                isOnBreak={isOnBreak}
                activeBreakType={todayRow?.break_type}
                onBreakStart={onBreakStart}
                onBreakEnd={onBreakEnd}
                triggerLabel="Break"
                triggerClassName="inline-flex h-7 items-center justify-center gap-0.5 rounded-lg border border-amber-300/90 bg-amber-50 px-2.5 text-[10px] font-bold text-amber-950 disabled:opacity-40 dark:border-amber-700/45 dark:bg-amber-950/30 dark:text-amber-100"
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 sm:gap-[18px] sm:px-[18px] sm:py-4">
        <div className="flex min-w-[200px] items-center gap-2.5">
          {isLiveCounting || isOnBreak ? (
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" aria-hidden />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" aria-hidden />
          )}
          <div>
            <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{statusTitle}</p>
            <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              {todayRow?.check_in_at ? (
                <>
                  In at{' '}
                  <span
                    className={
                      arrival === 'late'
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'font-medium text-slate-700 dark:text-slate-200'
                    }
                  >
                    {formatTimeCompact(todayRow.check_in_at)}
                  </span>
                  {gracePast ? (
                    <>
                      {' '}
                      · <span className="font-medium text-orange-600">{gracePast}</span>
                    </>
                  ) : null}
                  {isOnBreak && liveBreakElapsedLabel ? (
                    <>
                      {' '}
                      · break running{' '}
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                        {liveBreakElapsedLabel}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                'Check in to start today'
              )}
            </p>
          </div>
        </div>

        <div className="hidden h-[38px] w-px bg-slate-200 sm:block dark:bg-teal-900/45" />

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {isOnBreak ? `Net working · held at ${heldAtLabel}` : isLiveCounting ? 'Net working · live' : 'Net working'}
          </p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#103D4D] dark:text-white">
            {liveNetWorkingLabel || '00:00:00'}
          </p>
          {todayRow?.check_in_at ? (
            <p className="mt-1.5 font-mono text-[10.5px] text-slate-500">
              {formatSecondsAsHms(grossSec)} on site − {formatSecondsAsHms(breakSec)} breaks
            </p>
          ) : null}
        </div>

        {todayRow?.check_in_at && !todayRow.check_out_at ? (
          <>
            <div className="hidden h-[38px] w-px bg-slate-200 sm:block dark:bg-teal-900/45" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">To a full day</p>
              <p className="mt-1.5 font-mono text-[15px] font-medium tabular-nums">
                {formatAttendanceHm(toFullSec)} left{' '}
                <span className="font-sans text-[11.5px] font-normal text-slate-500">
                  · out by {formatTimeCompact(projectedOut.toISOString())} with no more breaks
                </span>
              </p>
            </div>
          </>
        ) : null}

      </div>

      <div className="flex flex-wrap items-start gap-2 border-t border-slate-100 bg-slate-50/40 px-4 py-3 dark:border-teal-900/35 dark:bg-[#0a1018]/50 sm:px-[18px]">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
        <p className="max-w-3xl flex-1 text-[11.5px] leading-snug text-slate-500">
          Didn&apos;t check out before midnight? That day is marked as a missing punch. Each new day starts fresh — check
          in again when your shift begins.
        </p>
      </div>
    </section>
  );
}
