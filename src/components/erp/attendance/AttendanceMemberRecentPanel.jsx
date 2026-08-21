'use client';

import { useMemo } from 'react';
import { classifyAttendanceArrival, formatAttendanceHm, getFullDayNetSeconds } from '../../../lib/erp-attendance-policy';
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

export default function AttendanceMemberRecentPanel({
  member,
  rows = [],
  limit = 10,
  onViewAll,
  onEditRow,
  canEdit = false,
}) {
  const recentRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.user_id === member?.id)
        .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)))
        .slice(0, limit),
    [rows, member?.id, limit],
  );

  if (!member || recentRows.length === 0) return null;

  const name = member.full_name?.trim() || 'Member';
  const fullDaySec = getFullDayNetSeconds();

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-teal-200/60 bg-gradient-to-br from-teal-50/50 via-white to-slate-50/80 shadow-sm dark:border-teal-900/45 dark:from-teal-950/20 dark:via-[#0a1018] dark:to-[#0c121a]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100/80 bg-white/60 px-3 py-2.5 dark:border-teal-900/35 dark:bg-[#0c121a]/60 sm:px-4">
        <div>
          <p className="text-[12px] font-bold text-[#103D4D] dark:text-teal-100">Previous {limit} days</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{name}</p>
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={() => onViewAll(member.id)}
            className="inline-flex h-7 items-center rounded-lg border border-teal-200/80 bg-white px-2.5 text-[11px] font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 dark:border-teal-800/50 dark:bg-[#131b24] dark:text-teal-200 dark:hover:bg-teal-950/40"
          >
            Full history
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto px-2 pb-2 pt-1 sm:px-3">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[minmax(0,1.2fr)_72px_72px_64px_72px_56px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#103D4D]/90 to-teal-700 px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-white/75">
            <span>Date</span>
            <span>In</span>
            <span>Out</span>
            <span>Break</span>
            <span className="text-right">Net</span>
            <span className="text-right">{canEdit && onEditRow ? ' ' : ''}</span>
          </div>
          <div className="mt-1 space-y-1">
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
                  className="grid grid-cols-[minmax(0,1.2fr)_72px_72px_64px_72px_56px] items-center gap-2 rounded-lg border border-slate-100/90 bg-white/90 px-2.5 py-2 text-[11.5px] shadow-sm dark:border-teal-900/30 dark:bg-[#0a1018]/90"
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
                      className={`inline-flex min-w-[2.75rem] justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                        !row.check_in_at
                          ? 'text-slate-400'
                          : shortDay
                            ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200/70 dark:bg-orange-950/30 dark:text-orange-200 dark:ring-orange-900/40'
                            : 'bg-teal-50 text-teal-900 ring-1 ring-teal-200/70 dark:bg-teal-950/35 dark:text-teal-100 dark:ring-teal-800/45'
                      }`}
                    >
                      {row.check_in_at ? formatAttendanceHm(netSec) : '—'}
                    </span>
                  </span>
                  <span className="text-right">
                    {canEdit && onEditRow ? (
                      <button
                        type="button"
                        onClick={() => onEditRow(row)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200"
                      >
                        Edit
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
