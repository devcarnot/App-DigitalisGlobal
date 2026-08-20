'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ATTENDANCE_ARRIVAL_META,
  ATTENDANCE_OUTCOME_META,
  getFullDayNetSeconds,
  buildMonthCalendarCells,
  countMonthScheduleStats,
  currentMonthString,
  summarizeMonthOutcomes,
  summarizeMonthArrivalBands,
  shiftPolicySubtitle,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds } from '../../../lib/erp-attendance';
import { useErpSession } from '../useErpSession';
import { AttendanceLegendPill, AttendancePanel } from './AttendancePageFrame';

const DAY_CELL_MIN_PX = 22;
const DAY_CELL_MAX_PX = 34;
const DAY_GAP_PX = 2;

const OUTCOME_LEGEND_KEYS = ['full', 'short', 'half', 'absent', 'leave', 'missing', 'open'];
const ARRIVAL_LEGEND_KEYS = ['early', 'on_time', 'late', 'none'];

function outcomeLegendSwatch(key) {
  if (key === 'missing') {
    return 'h-2 w-2 shrink-0 rounded-sm bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#fff_3px_6px)] border border-slate-300';
  }
  if (key === 'open') {
    return 'h-2 w-2 shrink-0 rounded-sm border border-dashed border-teal-500 bg-teal-50';
  }
  return `h-2 w-2 shrink-0 rounded-sm ${ATTENDANCE_OUTCOME_META[key].cell.split(' ')[0]}`;
}

function arrivalLegendSwatch(key) {
  return `h-[5px] w-2 shrink-0 rounded-sm ${ATTENDANCE_ARRIVAL_META[key].band}`;
}

function countDaysPerRow(containerWidth, totalDays) {
  if (!containerWidth || totalDays <= 0) return totalDays;
  const fit = Math.floor((containerWidth + DAY_GAP_PX) / (DAY_CELL_MIN_PX + DAY_GAP_PX));
  return Math.min(totalDays, Math.max(1, fit));
}

function monthStringShift(monthStr, delta) {
  const [y, mo] = monthStr.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthStr, style = 'long') {
  const [y, mo] = monthStr.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
    month: style === 'short' ? 'short' : 'long',
    year: 'numeric',
  });
}

export default function AttendanceMonthCalendar({
  rows,
  todayStr,
  nowMs,
  uid,
  approvedLeaveDates,
  initialMonth,
  monthStr: controlledMonthStr,
  onMonthChange,
}) {
  const { workspaceSettingsTick } = useErpSession();
  const [internalMonthStr, setInternalMonthStr] = useState(initialMonth || currentMonthString());
  const monthStr = controlledMonthStr ?? internalMonthStr;
  const setMonthStr = (next) => {
    if (onMonthChange) onMonthChange(next);
    else setInternalMonthStr(next);
  };
  const calendarRef = useRef(null);
  const [daysPerRow, setDaysPerRow] = useState(31);

  const cells = useMemo(
    () => buildMonthCalendarCells(monthStr, rows, todayStr, nowMs, { uid, approvedLeaveDates }),
    [monthStr, rows, todayStr, nowMs, uid, approvedLeaveDates, workspaceSettingsTick],
  );

  const outcomeCounts = useMemo(
    () => summarizeMonthOutcomes(rows, monthStr, todayStr, nowMs, { uid, approvedLeaveDates }),
    [monthStr, rows, todayStr, nowMs, uid, approvedLeaveDates, workspaceSettingsTick],
  );

  const arrivalCounts = useMemo(
    () => summarizeMonthArrivalBands(rows, monthStr, todayStr),
    [rows, monthStr, todayStr, workspaceSettingsTick],
  );

  const scheduleStats = useMemo(() => countMonthScheduleStats(monthStr, todayStr), [monthStr, todayStr]);

  const policySubtitle = useMemo(() => shiftPolicySubtitle(), [workspaceSettingsTick]);

  const overtimeDays = useMemo(() => {
    let n = 0;
    for (const cell of cells) {
      if (cell.dateStr > todayStr) continue;
      const row = cell.row;
      if (!row?.check_in_at || !row.check_out_at) continue;
      const net = attendanceRowNetSeconds(row, nowMs, { uid, workDate: cell.dateStr, todayStr });
      if (net > getFullDayNetSeconds()) n += 1;
    }
    return n;
  }, [cells, todayStr, nowMs, uid, workspaceSettingsTick]);

  const monthLabel = useMemo(() => formatMonthLabel(monthStr, 'long'), [monthStr]);
  const prevMonthStr = useMemo(() => monthStringShift(monthStr, -1), [monthStr]);
  const nextMonthStr = useMemo(() => monthStringShift(monthStr, 1), [monthStr]);
  const prevMonthLabel = useMemo(() => formatMonthLabel(prevMonthStr, 'short'), [prevMonthStr]);
  const nextMonthLabel = useMemo(() => formatMonthLabel(nextMonthStr, 'short'), [nextMonthStr]);
  const isCurrentMonth = monthStr === todayStr.slice(0, 7);

  useLayoutEffect(() => {
    const el = calendarRef.current;
    if (!el) return undefined;

    const measure = () => {
      setDaysPerRow(countDaysPerRow(el.clientWidth, cells.length));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cells.length]);

  function shiftMonth(delta) {
    setMonthStr(monthStringShift(monthStr, delta));
  }

  const firstRowCells = cells.slice(0, daysPerRow);
  const secondRowCells = cells.slice(daysPerRow);
  const matchedCellWidth = `calc((100% - ${(daysPerRow - 1) * DAY_GAP_PX}px) / ${daysPerRow})`;

  function renderDayCell(cell, rowMode) {
    const meta = ATTENDANCE_OUTCOME_META[cell.outcome] || ATTENDANCE_OUTCOME_META.none;
    const band = cell.arrival !== 'none' ? ATTENDANCE_ARRIVAL_META[cell.arrival]?.band : '';
    let overtime = false;
    if (cell.row?.check_in_at && cell.row.check_out_at) {
      const net = attendanceRowNetSeconds(cell.row, nowMs, { uid, workDate: cell.dateStr, todayStr });
      overtime = net > getFullDayNetSeconds();
    }
    const widthStyle =
      rowMode === 'second'
        ? { width: matchedCellWidth, minWidth: DAY_CELL_MIN_PX, maxWidth: DAY_CELL_MAX_PX }
        : undefined;

    return (
      <div
        key={cell.dateStr}
        style={widthStyle}
        className={`flex min-w-0 flex-col items-center gap-1 ${rowMode === 'first' ? 'min-w-[22px]' : 'flex-none'}`}
      >
        <span
          className={`font-mono text-[9.5px] ${cell.isSunday ? 'text-slate-400' : cell.isToday ? 'font-semibold text-slate-800' : 'text-slate-500'}`}
        >
          {cell.weekday.slice(0, 2)}
        </span>
        <div
          title={`${cell.dateStr} · ${meta.label}`}
          className={`flex h-[34px] w-full items-start justify-center rounded-[5px] pt-1 font-mono text-[10px] font-semibold ${meta.cell} ${overtime ? 'shadow-[inset_0_-4px_0_#6366f1]' : ''}`}
        >
          {String(cell.day).padStart(2, '0')}
        </div>
        {band ? <div className={`h-[5px] w-full rounded-[3px] ${band}`} /> : <div className="h-[5px] w-full" />}
      </div>
    );
  }

  return (
    <AttendancePanel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
            {monthLabel} · every day accounted for
          </p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            fill = the day&apos;s outcome · band underneath = when you arrived · {policySubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="inline-flex h-[30px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-teal-900/45 dark:bg-[#0c121a] dark:text-slate-300 dark:hover:bg-[#131b24]"
            aria-label={`Previous month, ${prevMonthLabel}`}
          >
            <span className="text-slate-400">‹</span>
            {prevMonthLabel}
          </button>
          <span className="inline-flex h-[30px] min-w-[9rem] items-center justify-center rounded-lg border border-slate-300/80 bg-slate-50 px-3 text-[12px] font-semibold text-slate-900 dark:border-teal-800/50 dark:bg-[#131b24] dark:text-white">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="inline-flex h-[30px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-teal-900/45 dark:bg-[#0c121a] dark:text-slate-300 dark:hover:bg-[#131b24]"
            aria-label={`Next month, ${nextMonthLabel}`}
          >
            {nextMonthLabel}
            <span className="text-slate-400">›</span>
          </button>
          {!isCurrentMonth ? (
            <button
              type="button"
              onClick={() => setMonthStr(todayStr.slice(0, 7))}
              className="inline-flex h-[30px] items-center rounded-lg px-2 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
            >
              Today
            </button>
          ) : null}
        </div>
      </div>

      <div ref={calendarRef} className="mt-4 space-y-2">
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${Math.max(firstRowCells.length, 1)}, minmax(${DAY_CELL_MIN_PX}px, 1fr))`,
          }}
        >
          {firstRowCells.map((cell) => renderDayCell(cell, 'first'))}
        </div>
        {secondRowCells.length > 0 ? (
          <div className="flex justify-center gap-0.5">
            {secondRowCells.map((cell) => renderDayCell(cell, 'second'))}
          </div>
        ) : null}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {OUTCOME_LEGEND_KEYS.map((key) => (
          <AttendanceLegendPill
            key={key}
            swatchClassName={outcomeLegendSwatch(key)}
            label={ATTENDANCE_OUTCOME_META[key].label}
            count={outcomeCounts[key] || 0}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ARRIVAL_LEGEND_KEYS.map((key) => (
          <AttendanceLegendPill
            key={key}
            swatchClassName={arrivalLegendSwatch(key)}
            label={ATTENDANCE_ARRIVAL_META[key].label}
            count={arrivalCounts[key] || 0}
          />
        ))}
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
