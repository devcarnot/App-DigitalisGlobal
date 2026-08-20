'use client';

import {
  ATTENDANCE_ARRIVAL_META,
  ERP_ATTENDANCE_POLICY,
  attendanceRowBreakTotalSeconds,
  attendanceRowGrossSeconds,
  classifyAttendanceArrival,
  formatAttendanceHm,
  formatGracePastLabel,
  projectCheckoutForFullDay,
  secondsToFullDay,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds, attendanceBreakTypeLabel } from '../../../lib/erp-attendance';
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
 * Top live status strip — matches audit mockup layout.
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
    <section className="rounded-[10px] border border-slate-200/90 bg-white p-[15px] shadow-sm dark:border-teal-900/45 dark:bg-[#0c121a] sm:px-[18px]">
      <div className="flex flex-wrap items-center gap-4 sm:gap-[18px]">
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
                  In at {formatTimeCompact(todayRow.check_in_at)}
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!todayRow?.check_in_at ? (
            <button
              type="button"
              disabled={busy || !profile || !canCheckIn}
              onClick={onCheckIn}
              className="h-[38px] rounded-lg erp-brand-fill px-4 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              Check in
            </button>
          ) : null}
          {canCheckOut ? (
            <button
              type="button"
              disabled={busy || !profile}
              onClick={onCheckOut}
              className="h-[38px] rounded-lg border border-slate-200 bg-white px-3.5 text-[12.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
            >
              Check out ▾
            </button>
          ) : null}
          {canEndBreak ? (
            <button
              type="button"
              disabled={busy || !profile}
              onClick={onBreakEnd}
              className="h-[38px] rounded-lg erp-brand-fill px-[18px] text-[12.5px] font-semibold text-white"
            >
              Resume work
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-start gap-2 border-t border-slate-100 pt-3.5 dark:border-teal-900/35">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
        <p className="max-w-3xl flex-1 text-[11.5px] leading-snug text-slate-500">
          Didn&apos;t check out before midnight? That day is marked as a missing punch. Each new day starts fresh —
          check in again when your shift begins.
        </p>
        {canStartBreak || isOnBreak ? (
          <AttendanceBreakOptionsMenu
            disabled={!profile}
            busy={busy}
            isOnBreak={isOnBreak}
            activeBreakType={todayRow?.break_type}
            onBreakStart={onBreakStart}
            onBreakEnd={onBreakEnd}
          />
        ) : null}
      </div>
    </section>
  );
}
