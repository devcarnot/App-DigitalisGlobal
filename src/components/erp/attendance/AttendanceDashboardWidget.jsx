'use client';

import Link from 'next/link';
import { attendanceBreakTypeLabel } from '../../../lib/erp-attendance';
import { formatSecondsAsHms } from '../ErpAttendanceCharts';
import AttendanceBreakOptionsMenu from './AttendanceBreakOptionsMenu';

const METRIC_ACCENTS = {
  in: {
    card: 'from-sky-50 to-white border-sky-200/70 ring-sky-100/50 dark:border-cyan-900/35',
    icon: '🟢',
  },
  out: {
    card: 'from-violet-50 to-white border-violet-200/70 ring-violet-100/50 dark:border-violet-900/30',
    icon: '🚪',
  },
  break: {
    card: 'from-amber-50 to-white border-amber-200/70 ring-amber-100/50 dark:border-amber-900/30',
    icon: '☕',
  },
  net: {
    card: 'from-emerald-50 to-white border-emerald-200/70 ring-emerald-100/50 dark:border-emerald-900/30',
    icon: '⏱️',
  },
};

const ACTION_BTN =
  'inline-flex h-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-[#131b24] dark:text-slate-200 dark:hover:bg-[#18222d]';

const ACTION_BTN_PRIMARY =
  'inline-flex h-7 shrink-0 items-center justify-center rounded-lg erp-brand-fill px-2.5 text-[10px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40';

const ACTION_BTN_BREAK =
  'inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-lg border border-amber-300/90 bg-amber-50 px-2.5 text-[10px] font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700/45 dark:bg-amber-950/30 dark:text-amber-100';

function AttendanceMetricBox({ label, value, tone = 'in', live = false }) {
  const accent = METRIC_ACCENTS[tone] || METRIC_ACCENTS.in;
  return (
    <div
      className={`relative min-w-0 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-md shadow-slate-900/5 ring-1 dark:bg-[#0c121a] dark:shadow-black/45 dark:[background-image:none] ${accent.card}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {live ? (
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500" aria-hidden title="Live" />
        ) : (
          <span className="text-lg opacity-90" aria-hidden>
            {accent.icon}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

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

function shortWorkDate(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function HeaderActions({
  busy,
  profile,
  canCheckIn,
  canCheckOut,
  canStartBreak,
  canEndBreak,
  todayRow,
  onCheckIn,
  onCheckOut,
  onBreakStart,
  onBreakEnd,
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canCheckIn ? (
        <button type="button" disabled={busy || !profile} onClick={onCheckIn} className={ACTION_BTN_PRIMARY}>
          Check in
        </button>
      ) : null}
      {canCheckOut ? (
        <button type="button" disabled={busy || !profile} onClick={onCheckOut} className={ACTION_BTN}>
          Check out
        </button>
      ) : null}
      {canEndBreak ? (
        <button type="button" disabled={busy || !profile} onClick={onBreakEnd} className={ACTION_BTN}>
          Resume
        </button>
      ) : canStartBreak ? (
        <AttendanceBreakOptionsMenu
          disabled={!profile}
          busy={busy}
          isOnBreak={false}
          activeBreakType={todayRow?.break_type}
          onBreakStart={onBreakStart}
          onBreakEnd={onBreakEnd}
          align="right"
          triggerLabel="Break"
          triggerClassName={ACTION_BTN_BREAK}
        />
      ) : null}
    </div>
  );
}

/**
 * Compact attendance strip for the ERP dashboard home.
 */
export default function AttendanceDashboardWidget({
  todayStr,
  todayRow,
  loading,
  hasRows,
  liveNetWorkingLabel,
  liveBreakElapsedLabel,
  isLiveCounting,
  isOnBreak,
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
  const checkedIn = Boolean(todayRow?.check_in_at);
  const dayDone = Boolean(todayRow?.check_out_at);

  return (
    <section className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm dark:border-teal-900/45 dark:from-[#0c121a] dark:to-[#0a1018]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold text-[#103D4D] dark:text-white">Today</span>
          {isLiveCounting ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              Live
            </span>
          ) : dayDone ? (
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-[#131b24] dark:text-slate-400">
              Done
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <HeaderActions
            busy={busy}
            profile={profile}
            canCheckIn={canCheckIn}
            canCheckOut={canCheckOut}
            canStartBreak={canStartBreak}
            canEndBreak={canEndBreak}
            todayRow={todayRow}
            onCheckIn={onCheckIn}
            onCheckOut={onCheckOut}
            onBreakStart={onBreakStart}
            onBreakEnd={onBreakEnd}
          />
          <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {shortWorkDate(todayStr)}
          </span>
        </div>
      </div>

      {loading && !hasRows ? (
        <div className="flex justify-center py-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : (
        <>
          {checkedIn ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AttendanceMetricBox label="In" tone="in" value={formatTimeCompact(todayRow.check_in_at)} />
              <AttendanceMetricBox
                label="Out"
                tone="out"
                value={todayRow.check_out_at ? formatTimeCompact(todayRow.check_out_at) : '—'}
              />
              <AttendanceMetricBox
                label="Break"
                tone="break"
                value={
                  todayRow.break_started_at
                    ? liveBreakElapsedLabel ?? '…'
                    : formatSecondsAsHms(Number(todayRow.break_seconds_total) || 0)
                }
                live={Boolean(todayRow.break_started_at)}
              />
              <AttendanceMetricBox
                label="Net"
                tone="net"
                value={liveNetWorkingLabel || '00:00:00'}
                live={isLiveCounting && !todayRow.break_started_at}
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Not checked in yet — use Check in above.</p>
          )}

          {isOnBreak ? (
            <p className="mt-2 inline-flex rounded-lg bg-amber-100/90 px-2.5 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              On {attendanceBreakTypeLabel(todayRow?.break_type, { short: true }).toLowerCase()} break
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 dark:border-teal-900/35">
            <Link
              href="/erp/leave"
              className="text-[11px] font-medium text-violet-600 hover:text-violet-800 dark:text-violet-300"
            >
              Leave →
            </Link>
            <Link
              href="/erp/attendance"
              className="text-[11px] font-bold text-[#103D4D] underline decoration-cyan-400/70 underline-offset-2 dark:text-teal-200"
            >
              Full attendance →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
