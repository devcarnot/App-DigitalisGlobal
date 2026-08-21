'use client';

import {
  attendanceRowBreakTotalSeconds,
  attendanceRowGrossSeconds,
  classifyAttendanceArrival,
  formatAttendanceHm,
  formatGracePastLabel,
  getFullDayNetSeconds,
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

const STATUS_THEME = {
  working: {
    dot: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]',
    ring: 'ring-emerald-400/30',
    pill: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200',
    accent: 'from-emerald-500 to-teal-600',
  },
  break: {
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]',
    ring: 'ring-amber-400/30',
    pill: 'border-amber-200/80 bg-amber-50/90 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100',
    accent: 'from-amber-400 to-orange-500',
  },
  out: {
    dot: 'bg-slate-400',
    ring: 'ring-slate-300/40',
    pill: 'border-slate-200/90 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
    accent: 'from-slate-400 to-slate-500',
  },
  idle: {
    dot: 'bg-slate-300',
    ring: 'ring-slate-200/50',
    pill: 'border-slate-200/90 bg-white text-slate-500 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-400',
    accent: 'from-slate-300 to-slate-400',
  },
};

function statusTheme({ isOnBreak, todayRow }) {
  if (isOnBreak) return STATUS_THEME.break;
  if (todayRow?.check_in_at && !todayRow.check_out_at) return STATUS_THEME.working;
  if (todayRow?.check_out_at) return STATUS_THEME.out;
  return STATUS_THEME.idle;
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
  const fullDaySec = getFullDayNetSeconds();
  const toFullSec = secondsToFullDay(netSec);
  const dayProgress = todayRow?.check_in_at ? Math.min(100, (netSec / fullDaySec) * 100) : 0;
  const projectedOut = projectCheckoutForFullDay(nowMs, netSec);
  const gracePast = todayRow?.check_in_at
    ? formatGracePastLabel(todayRow.check_in_at, todayRow.work_date)
    : null;
  const arrival =
    todayRow?.check_in_at ? classifyAttendanceArrival(todayRow.check_in_at, todayRow.work_date) : 'none';
  const heldAtLabel = formatTimeCompact(new Date(nowMs).toISOString());
  const theme = statusTheme({ isOnBreak, todayRow });

  const statusTitle = (() => {
    if (isOnBreak) {
      const label = attendanceBreakTypeLabel(todayRow?.break_type, { short: true });
      return label && todayRow?.break_type && todayRow.break_type !== 'general'
        ? `On break · ${label}`
        : 'On break';
    }
    if (todayRow?.check_in_at && !todayRow.check_out_at) return 'Working';
    if (todayRow?.check_out_at) return 'Checked out';
    return 'Not checked in';
  })();

  const actionBtnPrimary =
    'inline-flex h-8 items-center justify-center rounded-lg erp-brand-fill px-3 text-[11px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(16,61,77,0.45)] transition hover:brightness-105 disabled:opacity-40';
  const actionBtnGhost =
    'inline-flex h-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white/80 px-3 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-teal-200 hover:bg-white disabled:opacity-40 dark:border-teal-900/45 dark:bg-[#131b24]/80 dark:text-slate-200';
  const actionBtnBreak =
    'inline-flex h-8 items-center justify-center gap-0.5 rounded-lg border border-amber-300/90 bg-gradient-to-b from-amber-50 to-amber-100/80 px-3 text-[11px] font-bold text-amber-950 shadow-sm transition hover:from-amber-100 disabled:opacity-40 dark:border-amber-700/45 dark:from-amber-950/40 dark:to-amber-950/20 dark:text-amber-100';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_-12px_rgba(16,61,77,0.18)] dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-none">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.08),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.06),transparent_48%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.06),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.04),transparent_48%)]"
        aria-hidden
      />
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${theme.accent}`} aria-hidden />

      <div className="relative border-b border-slate-100/80 px-3.5 py-2 dark:border-teal-900/35 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-[13px] font-bold tracking-tight text-[#103D4D] dark:text-white">Today</p>
            <span className="truncate text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
              {formatWorkDate(todayStr)}
            </span>
            {isLiveCounting || isOnBreak ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50/90 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            ) : null}
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {!todayRow?.check_in_at ? (
              <button type="button" disabled={busy || !profile || !canCheckIn} onClick={onCheckIn} className={actionBtnPrimary}>
                Check in
              </button>
            ) : null}
            {canCheckOut ? (
              <button type="button" disabled={busy || !profile} onClick={onCheckOut} className={actionBtnGhost}>
                Check out
              </button>
            ) : null}
            {canEndBreak ? (
              <button type="button" disabled={busy || !profile} onClick={onBreakEnd} className={actionBtnGhost}>
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
                triggerClassName={actionBtnBreak}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative grid gap-3 px-3.5 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-4 sm:py-3">
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${theme.ring}`}
            aria-hidden
          >
            <span className={`h-2.5 w-2.5 rounded-full ${theme.dot} ${isLiveCounting || isOnBreak ? 'animate-pulse' : ''}`} />
          </span>
          <div className="min-w-0">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${theme.pill}`}
            >
              {statusTitle}
            </span>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {todayRow?.check_in_at ? (
                <>
                  In at{' '}
                  <span
                    className={
                      arrival === 'late'
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'font-semibold text-slate-800 dark:text-slate-200'
                    }
                  >
                    {formatTimeCompact(todayRow.check_in_at)}
                  </span>
                  {gracePast ? (
                    <>
                      {' '}
                      · <span className="font-medium text-orange-600 dark:text-orange-400">{gracePast}</span>
                    </>
                  ) : null}
                  {isOnBreak && liveBreakElapsedLabel ? (
                    <>
                      {' '}
                      · break{' '}
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {liveBreakElapsedLabel}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                'Check in when your shift starts'
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100/90 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-sm dark:border-teal-900/40 dark:bg-[#101824]/70">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {isOnBreak ? `Net · held ${heldAtLabel}` : isLiveCounting ? 'Net working · live' : 'Net working'}
              </p>
              <p className="mt-0.5 font-mono text-[1.65rem] font-bold leading-none tabular-nums tracking-tight text-[#103D4D] dark:text-white">
                {liveNetWorkingLabel || '00:00:00'}
              </p>
            </div>
            {todayRow?.check_in_at && !todayRow.check_out_at ? (
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{Math.round(dayProgress)}%</p>
                <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${theme.accent} transition-all duration-500`}
                    style={{ width: `${dayProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {todayRow?.check_in_at ? (
            <p className="mt-2 font-mono text-[10px] text-slate-500">
              {formatSecondsAsHms(grossSec)} on site · {formatSecondsAsHms(breakSec)} breaks
            </p>
          ) : null}
        </div>

        {todayRow?.check_in_at && !todayRow.check_out_at ? (
          <div className="rounded-xl border border-slate-100/90 bg-slate-50/80 px-3 py-2.5 dark:border-teal-900/40 dark:bg-[#0a1018]/80">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">To full day</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[#103D4D] dark:text-teal-100">
              {formatAttendanceHm(toFullSec)}
              <span className="ml-1 text-[11px] font-semibold text-slate-500">left</span>
            </p>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Out by{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {formatTimeCompact(projectedOut.toISOString())}
              </span>{' '}
              with no more breaks
            </p>
          </div>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}
      </div>

      <p className="relative border-t border-slate-100/80 px-3.5 py-2 text-[10px] leading-snug text-slate-400 dark:border-teal-900/35 dark:text-slate-500 sm:px-4">
        Missing checkout before midnight marks the day as a missing punch — each new day starts fresh.
      </p>
    </section>
  );
}
