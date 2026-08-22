'use client';

import Link from 'next/link';
import { formatSecondsAsHms } from '../ErpAttendanceCharts';
import AttendanceBreakOptionsMenu from './AttendanceBreakOptionsMenu';

export const ATTENDANCE_ACTION_BTN =
  'inline-flex h-6 shrink-0 items-center justify-center rounded-md border border-slate-200/90 bg-white px-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-[#131b24] dark:text-slate-200 dark:hover:bg-[#18222d]';

export const ATTENDANCE_ACTION_BTN_PRIMARY =
  'inline-flex h-6 shrink-0 items-center justify-center rounded-md erp-brand-fill px-2 text-[10px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40';

export const ATTENDANCE_ACTION_BTN_BREAK =
  'inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-md border border-amber-300/90 bg-amber-50 px-2 text-[10px] font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700/45 dark:bg-amber-950/30 dark:text-amber-100';

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

function TimeChip({ label, value, live = false, tone = 'default' }) {
  const tones = {
    default: 'border-slate-200/90 bg-white dark:border-slate-600 dark:bg-[#131b24]',
    net: 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-900/40 dark:bg-emerald-950/25',
    break: 'border-amber-200/80 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  };
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-bold tabular-nums ${tones[tone] || tones.default}`}
    >
      <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-mono text-slate-800 dark:text-slate-100">{value}</span>
      {live ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden title="Live" />
      ) : null}
    </span>
  );
}

/**
 * Attendance times + punch controls for the dashboard nav strip (second header line).
 */
export default function AttendanceDashboardNavStrip({
  busy,
  checkInAwaitingLocation = false,
  profile,
  todayRow,
  canCheckIn,
  canCheckOut,
  canStartBreak,
  canEndBreak,
  liveNetWorkingLabel,
  liveBreakElapsedLabel,
  isLiveCounting,
  isOnBreak,
  onCheckIn,
  onCheckOut,
  onBreakStart,
  onBreakEnd,
  className = '',
}) {
  const checkedIn = Boolean(todayRow?.check_in_at);
  const checkedOut = Boolean(todayRow?.check_out_at);
  const breakTotalSec = Number(todayRow?.break_seconds_total) || 0;
  const breakLabel =
    todayRow?.break_started_at && liveBreakElapsedLabel
      ? liveBreakElapsedLabel
      : formatSecondsAsHms(breakTotalSec);

  const hasActions = canCheckIn || canCheckOut || canStartBreak || canEndBreak;

  if (!checkedIn && !hasActions) return null;

  return (
    <div className={`flex flex-wrap items-center justify-end gap-1.5 ${className}`}>
      {checkedIn ? (
        <>
          <TimeChip label="In" value={formatTimeCompact(todayRow.check_in_at)} />
          <TimeChip
            label="Net"
            value={liveNetWorkingLabel || '00:00:00'}
            live={isLiveCounting && !todayRow?.break_started_at}
            tone="net"
          />
          {checkedIn && !checkedOut ? (
            <TimeChip
              label="Break"
              value={breakLabel}
              live={Boolean(todayRow?.break_started_at)}
              tone="break"
            />
          ) : checkedOut && breakTotalSec > 0 ? (
            <TimeChip label="Break" value={formatSecondsAsHms(breakTotalSec)} tone="break" />
          ) : null}
          {checkedOut ? (
            <TimeChip label="Out" value={formatTimeCompact(todayRow.check_out_at)} />
          ) : null}
        </>
      ) : (
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Not checked in</span>
      )}

      {canCheckIn ? (
        <button type="button" disabled={busy || !profile} onClick={onCheckIn} className={ATTENDANCE_ACTION_BTN_PRIMARY}>
          {checkInAwaitingLocation ? 'Allow location…' : busy ? 'Checking in…' : 'Check in'}
        </button>
      ) : null}
      {canCheckOut ? (
        <button type="button" disabled={busy || !profile} onClick={onCheckOut} className={ATTENDANCE_ACTION_BTN}>
          Check out
        </button>
      ) : null}
      {canEndBreak ? (
        <button type="button" disabled={busy || !profile} onClick={onBreakEnd} className={ATTENDANCE_ACTION_BTN}>
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
          triggerClassName={ATTENDANCE_ACTION_BTN_BREAK}
        />
      ) : null}

      {checkedOut ? (
        <Link
          href="/erp/attendance"
          className="text-[10px] font-bold text-[#103D4D] underline decoration-cyan-400/60 underline-offset-2 hover:text-teal-800 dark:text-teal-200"
        >
          Attendance →
        </Link>
      ) : null}

      {isOnBreak ? (
        <span className="hidden text-[10px] font-semibold text-amber-800 sm:inline dark:text-amber-200">On break</span>
      ) : null}
    </div>
  );
}
