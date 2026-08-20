'use client';

import {
  ERP_ATTENDANCE_BREAK_TYPES,
  attendanceBreakTypeLabel,
  attendanceBreakTypeMeta,
  attendanceRowNetSeconds,
  dateStringAddDays,
  formatWorkDate,
} from '../../lib/erp-attendance';

export function formatSecondsAsHms(totalSec) {
  const cap = 86400 * 2;
  const n = Math.max(0, Math.min(Math.floor(Number(totalSec) || 0), cap));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatAttendanceTimeCompact(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatNetHoursShort(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return '0m';
}

/** Build daily net minutes for each calendar day in [fromStr, toStr]. */
export function buildDailyNetSeriesForRange(fromStr, toStr, rows, uid, nowMs = Date.now()) {
  const labels = [];
  const minutes = [];
  const dates = [];
  let d = String(fromStr || '').slice(0, 10);
  const end = String(toStr || '').slice(0, 10);
  let guard = 0;
  while (d && d <= end && guard < 400) {
    guard += 1;
    dates.push(d);
    const row = rows.find((r) => String(r.work_date).slice(0, 10) === d);
    const netSec = row?.check_in_at
      ? attendanceRowNetSeconds(row, nowMs, { uid, workDate: d })
      : 0;
    minutes.push(Math.round(netSec / 60));
    const dt = new Date(`${d}T12:00:00`);
    labels.push({
      weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
      day: dt.getDate(),
      title: formatWorkDate(d),
    });
    d = dateStringAddDays(d, 1);
  }
  return { labels, minutes, dates };
}

export function buildDailyNetSeries(rows, todayStr, dayCount, uid, nowMs = Date.now()) {
  const fromStr = dateStringAddDays(todayStr, -(dayCount - 1));
  return buildDailyNetSeriesForRange(fromStr, todayStr, rows, uid, nowMs);
}

function dailyHoursBarTone(minutes) {
  if (minutes <= 0) return 'bg-slate-300/50 dark:bg-slate-600/40';
  const hours = minutes / 60;
  if (hours < 5) {
    return 'bg-gradient-to-t from-rose-600 to-rose-400 shadow-sm dark:from-rose-700 dark:to-rose-500';
  }
  if (hours <= 7) {
    return 'bg-gradient-to-t from-amber-500 to-yellow-400 shadow-sm dark:from-amber-600 dark:to-amber-400';
  }
  return 'bg-gradient-to-t from-emerald-600 to-teal-500 shadow-sm dark:from-emerald-700 dark:to-emerald-500';
}

export function AttendanceHoursBarChart({ labels, minutes, dates, compact = false }) {
  const max = Math.max(1, ...minutes);
  const barArea = compact ? 'h-24' : 'h-28';
  return (
    <div>
      <div
        className={`flex items-end justify-between gap-0.5 overflow-x-auto border-b border-slate-100 pb-0.5 dark:border-slate-700/80 ${compact ? 'mt-3' : 'mt-4'}`}
        role="img"
        aria-label="Daily net working hours chart"
      >
        {minutes.map((v, i) => {
          const h = Math.round((v / max) * 100);
          const hoursLabel = v >= 60 ? `${Math.floor(v / 60)}h ${v % 60}m` : `${v}m`;
          const label = labels[i];
          return (
            <div key={dates[i]} className="flex min-w-[1.35rem] flex-1 flex-col items-center gap-0.5">
              <div className={`flex w-full items-end justify-center ${barArea}`}>
                <div
                  className={`w-[68%] max-w-[2rem] rounded-t-md transition-all ${dailyHoursBarTone(v)} ${v === 0 ? 'opacity-40' : ''}`}
                  style={{ height: `${Math.max(v > 0 ? 10 : 4, h)}%` }}
                  title={`${label.title}: ${hoursLabel}`}
                />
              </div>
              <div className="flex flex-col items-center leading-none">
                <span className="text-[8px] font-bold text-slate-700 dark:text-slate-200">{label.weekday}</span>
                <span className="mt-0.5 text-[7px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{label.day}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rose-500" aria-hidden />
          &lt; 5h
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-400" aria-hidden />
          5–7h
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden />
          &gt; 7h
        </span>
      </div>
    </div>
  );
}

const BREAK_GROUP_BAR_CLASS = {
  breaks: 'bg-gradient-to-r from-amber-500 to-amber-400 dark:from-amber-600 dark:to-amber-500',
  leave: 'bg-gradient-to-r from-violet-500 to-violet-400 dark:from-violet-600 dark:to-violet-500',
  work: 'bg-gradient-to-r from-sky-500 to-sky-400 dark:from-sky-600 dark:to-sky-500',
  other: 'bg-gradient-to-r from-slate-500 to-slate-400 dark:from-slate-600 dark:to-slate-500',
};

/** Aggregate break session seconds by type (+ legacy break_seconds_total as general). */
export function aggregateBreakSecondsByType(rows, sessions) {
  const totals = {};
  for (const s of sessions || []) {
    const id = String(s.break_type || 'general').toLowerCase();
    totals[id] = (totals[id] || 0) + Math.max(0, Number(s.duration_seconds) || 0);
  }
  let sessionSum = Object.values(totals).reduce((a, b) => a + b, 0);
  let legacyTotal = 0;
  for (const r of rows || []) {
    legacyTotal += Math.max(0, Number(r.break_seconds_total) || 0);
  }
  if (legacyTotal > sessionSum) {
    totals.general = (totals.general || 0) + (legacyTotal - sessionSum);
  }
  const items = ERP_ATTENDANCE_BREAK_TYPES.map((t) => ({
    ...t,
    seconds: totals[t.id] || 0,
  })).filter((t) => t.seconds > 0);
  if ((totals.general || 0) > 0 && !items.some((t) => t.id === 'general')) {
    items.push({
      id: 'general',
      group: 'other',
      label: 'Break (unspecified)',
      shortLabel: 'General',
      seconds: totals.general,
    });
  }
  items.sort((a, b) => b.seconds - a.seconds);
  return items;
}

export function AttendanceBreakTypeChart({ items }) {
  if (!items.length) {
    return (
      <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No pauses logged in this range.</p>
    );
  }
  const max = Math.max(1, ...items.map((i) => i.seconds));
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = Math.round((item.seconds / max) * 100);
        const meta = attendanceBreakTypeMeta(item.id);
        const barClass = BREAK_GROUP_BAR_CLASS[meta?.group || item.group || 'other'] || BREAK_GROUP_BAR_CLASS.other;
        return (
          <div key={item.id}>
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px]">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {attendanceBreakTypeLabel(item.id)}
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {formatNetHoursShort(item.seconds)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(8, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AttendanceHistoryTable({ rows, uid, showBreaks = false, onEditRow }) {
  if (rows.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">No entries in this range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-[11px]">
        <thead>
          <tr className="border-b border-slate-100 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:border-teal-900/40 dark:text-slate-400">
            <th className="px-2 py-2 font-bold">Date</th>
            <th className="px-2 py-2 font-bold">In</th>
            <th className="px-2 py-2 font-bold">Out</th>
            {showBreaks ? <th className="px-2 py-2 font-bold">Breaks</th> : null}
            <th className="px-2 py-2 text-right font-bold">Net</th>
            {onEditRow ? <th className="px-2 py-2 text-right font-bold"> </th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const netSec = r.check_in_at
              ? attendanceRowNetSeconds(r, Date.now(), { uid, workDate: r.work_date })
              : 0;
            const breakSec = Number(r.break_seconds_total) || 0;
            return (
              <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-teal-950/40">
                <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-800 dark:text-white">
                  {formatWorkDate(r.work_date)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {formatAttendanceTimeCompact(r.check_in_at)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {r.check_out_at ? formatAttendanceTimeCompact(r.check_out_at) : '—'}
                </td>
                {showBreaks ? (
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {breakSec > 0 ? formatSecondsAsHms(breakSec) : '—'}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                  {r.check_in_at ? formatSecondsAsHms(netSec) : '—'}
                </td>
                {onEditRow ? (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onEditRow(r)}
                      className="rounded-lg border border-teal-200/90 bg-white px-2 py-0.5 text-[10px] font-bold text-[#103D4D] shadow-sm transition hover:bg-teal-50 dark:border-teal-700/50 dark:bg-slate-800 dark:text-teal-200 dark:hover:bg-teal-950/50"
                    >
                      Edit
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
