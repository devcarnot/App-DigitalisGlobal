'use client';

import { useMemo, useState } from 'react';
import {
  ATTENDANCE_ARRIVAL_META,
  ATTENDANCE_OUTCOME_META,
  FULL_DAY_NET_SECONDS,
  buildMonthCalendarCells,
  countMonthScheduleStats,
  currentMonthString,
  summarizeArrivalBands,
  summarizeAttendanceOutcomes,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds } from '../../../lib/erp-attendance';
import { AttendanceLegendPill, AttendancePanel } from './AttendancePageFrame';

export default function AttendanceMonthCalendar({
  rows,
  todayStr,
  nowMs,
  uid,
  approvedLeaveDates,
  initialMonth,
}) {
  const [monthStr, setMonthStr] = useState(initialMonth || currentMonthString());

  const cells = useMemo(
    () => buildMonthCalendarCells(monthStr, rows, todayStr, nowMs, { uid, approvedLeaveDates }),
    [monthStr, rows, todayStr, nowMs, uid, approvedLeaveDates],
  );

  const outcomeCounts = useMemo(() => {
    const [y, mo] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    return summarizeAttendanceOutcomes(
      rows.filter((r) => String(r.work_date).startsWith(monthStr)),
      todayStr,
      daysInMonth,
      nowMs,
      { uid, approvedLeaveDates },
    );
  }, [monthStr, rows, todayStr, nowMs, uid, approvedLeaveDates]);

  const arrivalCounts = useMemo(
    () => summarizeArrivalBands(rows, monthStr, todayStr),
    [rows, monthStr, todayStr],
  );

  const scheduleStats = useMemo(() => countMonthScheduleStats(monthStr, todayStr), [monthStr, todayStr]);

  const overtimeDays = useMemo(() => {
    let n = 0;
    for (const cell of cells) {
      if (cell.dateStr > todayStr) continue;
      const row = cell.row;
      if (!row?.check_in_at || !row.check_out_at) continue;
      const net = attendanceRowNetSeconds(row, nowMs, { uid, workDate: cell.dateStr, todayStr });
      if (net > FULL_DAY_NET_SECONDS) n += 1;
    }
    return n;
  }, [cells, todayStr, nowMs, uid]);

  const monthLabel = useMemo(() => {
    const [y, mo] = monthStr.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [monthStr]);

  function shiftMonth(delta) {
    const [y, mo] = monthStr.split('-').map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    setMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <AttendancePanel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
            {monthLabel} · every day accounted for
          </p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            fill = the day&apos;s outcome · band underneath = when you arrived
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-[30px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-medium dark:border-teal-900/45"
          onClick={() => shiftMonth(0)}
        >
          {monthLabel} <span className="text-slate-400">▾</span>
        </button>
      </div>

      <div className="mt-4 flex gap-0.5 overflow-x-auto pb-1">
        {cells.map((cell) => {
          const meta = ATTENDANCE_OUTCOME_META[cell.outcome] || ATTENDANCE_OUTCOME_META.none;
          const band = cell.arrival !== 'none' ? ATTENDANCE_ARRIVAL_META[cell.arrival]?.band : '';
          let overtime = false;
          if (cell.row?.check_in_at && cell.row.check_out_at) {
            const net = attendanceRowNetSeconds(cell.row, nowMs, { uid, workDate: cell.dateStr, todayStr });
            overtime = net > FULL_DAY_NET_SECONDS;
          }
          return (
            <div key={cell.dateStr} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
              <span
                className={`font-mono text-[9.5px] ${cell.isSunday ? 'text-slate-400' : cell.isToday ? 'font-semibold text-slate-800' : 'text-slate-500'}`}
              >
                {cell.weekday.slice(0, 2)}
              </span>
              <div
                title={`${cell.dateStr} · ${meta.label}`}
                className={`flex h-[34px] w-full items-start justify-center rounded-[5px] pt-1 text-[10px] font-semibold font-mono ${meta.cell} ${overtime ? 'shadow-[inset_0_-4px_0_#6366f1]' : ''}`}
              >
                {String(cell.day).padStart(2, '0')}
              </div>
              {band ? <div className={`h-[5px] w-full rounded-[3px] ${band}`} /> : <div className="h-[5px]" />}
            </div>
          );
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {['full', 'short', 'half', 'absent', 'leave', 'missing', 'open'].map((key) =>
          outcomeCounts[key] > 0 ? (
            <AttendanceLegendPill
              key={key}
              colorClass={ATTENDANCE_OUTCOME_META[key].cell.split(' ')[0]}
              label={ATTENDANCE_OUTCOME_META[key].label}
              count={outcomeCounts[key]}
            />
          ) : null,
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {['early', 'on_time', 'late', 'none'].map((key) =>
          arrivalCounts[key] > 0 ? (
            <AttendanceLegendPill
              key={key}
              colorClass={ATTENDANCE_ARRIVAL_META[key].band}
              label={ATTENDANCE_ARRIVAL_META[key].label}
              count={arrivalCounts[key]}
            />
          ) : null,
        )}
        {overtimeDays > 0 ? (
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-slate-50 px-2.5 text-[11.5px] text-slate-500 dark:bg-[#131b24]">
            <span className="h-[5px] w-2 rounded-sm bg-indigo-500" />
            underline = overtime · {overtimeDays} day{overtimeDays === 1 ? '' : 's'}
          </span>
        ) : null}
        <span className="inline-flex h-[26px] items-center rounded-full bg-slate-50 px-2.5 text-[11.5px] text-slate-500 dark:bg-[#131b24]">
          {scheduleStats.scheduled} scheduled days so far · {scheduleStats.sundays} Sunday
          {scheduleStats.sundays === 1 ? '' : 's'} off
        </span>
      </div>
    </AttendancePanel>
  );
}
