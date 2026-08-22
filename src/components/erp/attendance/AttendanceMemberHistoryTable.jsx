'use client';

import { useMemo } from 'react';
import {
  classifyAttendanceArrival,
  formatAttendanceHm,
  getFullDayNetSeconds,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds, formatWorkDate } from '../../../lib/erp-attendance';
import { formatAttendanceTimeCompact } from '../ErpAttendanceCharts';

function formatBreak(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  if (n <= 0) return '—';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AttendanceMemberHistoryTable({
  member,
  rows = [],
  limit = 10,
  excludeDateStr,
  compact = false,
  onEditRow,
  canEdit = false,
}) {
  const excludeDate = String(excludeDateStr || '').slice(0, 10);

  const recentRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.user_id === member?.id)
        .filter((r) => {
          const wd = String(r.work_date || '').slice(0, 10);
          return !excludeDate || wd !== excludeDate;
        })
        .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)))
        .slice(0, limit),
    [rows, member?.id, limit, excludeDate],
  );

  if (!member) return null;

  const fullDaySec = getFullDayNetSeconds();

  if (recentRows.length === 0) {
    return (
      <p className={`text-slate-500 dark:text-slate-400 ${compact ? 'px-2 py-2 text-[10.5px]' : 'py-3 text-center text-[11px]'}`}>
        No attendance records in the last {limit} days.
      </p>
    );
  }

  const gridCols =
    canEdit && onEditRow
      ? 'grid-cols-[minmax(0,1.2fr)_64px_64px_56px_64px_48px]'
      : 'grid-cols-[minmax(0,1.2fr)_64px_64px_56px_64px]';

  return (
    <div className={`overflow-x-auto ${compact ? 'px-1 pb-1' : ''}`}>
      <div className={compact ? 'min-w-[420px]' : 'min-w-[520px]'}>
        <div
          className={`grid ${gridCols} items-center gap-2 rounded-lg bg-gradient-to-r from-[#103D4D]/90 to-teal-700 font-bold uppercase tracking-[0.1em] text-white/75 ${
            compact ? 'px-2 py-1 text-[8px]' : 'px-2.5 py-2 text-[9px]'
          }`}
        >
          <span>Date</span>
          <span>In</span>
          <span>Out</span>
          <span>Break</span>
          <span className="text-right">Net</span>
          {canEdit && onEditRow ? <span className="text-right"> </span> : null}
        </div>
        <div className="mt-1 space-y-0.5">
          {recentRows.map((row) => {
            const dateStr = String(row.work_date || '').slice(0, 10);
            const netSec = row.check_in_at
              ? attendanceRowNetSeconds(row, Date.now(), { uid: member.id, workDate: dateStr })
              : 0;
            const arrival = row.check_in_at ? classifyAttendanceArrival(row.check_in_at, dateStr) : 'none';
            const inTone =
              arrival === 'late'
                ? 'text-orange-700 dark:text-orange-300'
                : arrival === 'early'
                  ? 'text-sky-700 dark:text-sky-300'
                  : 'text-slate-700 dark:text-slate-200';
            const shortDay = row.check_in_at && netSec > 0 && netSec < fullDaySec;
            return (
              <div
                key={row.id}
                className={`grid ${gridCols} items-center gap-2 rounded-lg border border-slate-100/90 bg-white/90 dark:border-teal-900/30 dark:bg-[#0a1018]/90 ${
                  compact ? 'px-2 py-1.5 text-[10.5px]' : 'px-2.5 py-2 text-[11.5px]'
                }`}
              >
                <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                  {formatWorkDate(row.work_date)}
                </span>
                <span className={`font-mono tabular-nums ${inTone}`}>
                  {row.check_in_at ? formatAttendanceTimeCompact(row.check_in_at) : '—'}
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {row.check_out_at ? formatAttendanceTimeCompact(row.check_out_at) : '—'}
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {formatBreak(row.break_seconds_total)}
                </span>
                <span className="text-right">
                  <span
                    className={`inline-flex min-w-[2.5rem] justify-center rounded-md px-1.5 py-0.5 font-mono font-bold tabular-nums ${
                      compact ? 'text-[10px]' : 'text-[11px]'
                    } ${
                      !row.check_in_at
                        ? 'text-slate-400'
                        : shortDay
                          ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200/70 dark:bg-orange-950/30 dark:text-orange-200'
                          : 'bg-teal-50 text-teal-900 ring-1 ring-teal-200/70 dark:bg-teal-950/35 dark:text-teal-100'
                    }`}
                  >
                    {row.check_in_at ? formatAttendanceHm(netSec) : '—'}
                  </span>
                </span>
                {canEdit && onEditRow ? (
                  <span className="text-right">
                    <button
                      type="button"
                      onClick={() => onEditRow(row)}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200"
                    >
                      Edit
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
