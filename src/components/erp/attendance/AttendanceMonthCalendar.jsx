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
import { isAttendanceDayClickable } from '../../../lib/erp-attendance-corrections';
import { useErpSession } from '../useErpSession';
import { AttendanceLegendPill, AttendancePanel } from './AttendancePageFrame';
import { AttendanceSectionHeader } from './AttendanceViewPageFrame';
import AttendanceDayCorrectionMenu from './AttendanceDayCorrectionMenu';

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

function cellMatchesFilter(cell, filter, { nowMs, uid, todayStr }) {
  if (!filter) return true;
  if (filter.type === 'outcome') return cell.outcome === filter.key;
  if (filter.type === 'arrival') return cell.arrival === filter.key;
  if (filter.type === 'overtime') {
    if (cell.dateStr > todayStr) return false;
    if (!cell.row?.check_in_at || !cell.row.check_out_at) return false;
    const net = attendanceRowNetSeconds(cell.row, nowMs, { uid, workDate: cell.dateStr, todayStr });
    return net > getFullDayNetSeconds();
  }
  return true;
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
  onOpenCorrection,
}) {
  const { workspaceSettingsTick } = useErpSession();
  const [internalMonthStr, setInternalMonthStr] = useState(initialMonth || currentMonthString());
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuDay, setMenuDay] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const monthStr = controlledMonthStr ?? internalMonthStr;
  const setMonthStr = (next) => {
    if (onMonthChange) onMonthChange(next);
    else setInternalMonthStr(next);
  };
  const calendarRef = useRef(null);
  const legendRef = useRef(null);
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
    setActiveFilter(null);
  }

  function toggleFilter(type, key) {
    setActiveFilter((prev) => (prev?.type === type && prev?.key === key ? null : { type, key }));
  }

  function clearFilter() {
    setActiveFilter(null);
  }

  function handlePanelBackgroundClick(e) {
    if (!activeFilter) return;
    if (legendRef.current?.contains(e.target)) return;
    clearFilter();
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

    const canCorrect =
      Boolean(onOpenCorrection) &&
      isAttendanceDayClickable({ dateStr: cell.dateStr, outcome: cell.outcome, todayStr });

    const matchesFilter = cellMatchesFilter(cell, activeFilter, { nowMs, uid, todayStr });
    const dimmed = Boolean(activeFilter) && !matchesFilter;
    const highlighted = Boolean(activeFilter) && matchesFilter;

    function onDayClick(e) {
      if (activeFilter) {
        clearFilter();
        return;
      }
      if (!canCorrect) return;
      setMenuAnchor({ x: e.clientX, y: e.clientY });
      setMenuDay(cell);
    }

    return (
      <div
        key={cell.dateStr}
        style={widthStyle}
        className={`flex min-w-0 flex-col items-center gap-1 transition-opacity duration-200 ${rowMode === 'first' ? 'min-w-[22px]' : 'flex-none'} ${dimmed ? 'opacity-30' : ''}`}
      >
        <span
          className={`font-mono text-[9.5px] ${cell.isSunday ? 'text-slate-400' : cell.isToday ? 'font-semibold text-slate-800' : 'text-slate-500'} ${highlighted ? 'font-semibold text-teal-800 dark:text-teal-200' : ''}`}
        >
          {cell.weekday.slice(0, 2)}
        </span>
        <button
          type="button"
          disabled={!canCorrect}
          onClick={onDayClick}
          title={
            canCorrect
              ? `${cell.dateStr} · ${meta.label} · tap to request correction`
              : `${cell.dateStr} · ${meta.label}`
          }
          className={`relative flex h-[34px] w-full items-start justify-center rounded-[5px] pt-1 font-mono text-[10px] font-semibold transition ${meta.cell} ${overtime ? 'shadow-[inset_0_-4px_0_#6366f1]' : ''} ${
            highlighted
              ? 'z-10 scale-[1.08] shadow-md ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-[#0c121a]'
              : ''
          } ${
            canCorrect
              ? 'cursor-pointer hover:ring-2 hover:ring-teal-400/70 hover:ring-offset-1 dark:hover:ring-offset-[#0c121a]'
              : 'cursor-default'
          }`}
        >
          {String(cell.day).padStart(2, '0')}
        </button>
        {band ? (
          <div className={`h-[5px] w-full rounded-[3px] ${band} ${highlighted ? 'opacity-100' : ''}`} />
        ) : (
          <div className="h-[5px] w-full" />
        )}
      </div>
    );
  }

  return (
    <AttendancePanel flush>
      <div onMouseDown={handlePanelBackgroundClick}>
      <AttendanceSectionHeader
        title={`${monthLabel} · every day accounted for`}
        subtitle={`Fill = day outcome · band = arrival time · tap a past day to request correction · tap legend to highlight · click elsewhere to reset · ${policySubtitle}`}
      />

      <div className="flex flex-wrap items-center justify-end gap-1 px-4 pt-3 sm:px-[18px]">
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
              onClick={() => {
                setMonthStr(todayStr.slice(0, 7));
                setActiveFilter(null);
              }}
              className="inline-flex h-[30px] items-center rounded-lg px-2 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
            >
              Today
            </button>
          ) : null}
      </div>

      <div ref={calendarRef} className="mt-2 space-y-2 px-4 sm:px-[18px]">
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

      <div ref={legendRef} onMouseDown={(e) => e.stopPropagation()} className="mt-3.5 flex flex-wrap gap-1.5 px-4 pb-4 sm:px-[18px]">
        {OUTCOME_LEGEND_KEYS.map((key) => (
          <AttendanceLegendPill
            key={key}
            swatchClassName={outcomeLegendSwatch(key)}
            label={ATTENDANCE_OUTCOME_META[key].label}
            count={outcomeCounts[key] || 0}
            active={activeFilter?.type === 'outcome' && activeFilter?.key === key}
            onClick={() => toggleFilter('outcome', key)}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-4 pb-4 sm:px-[18px]">
        <div onMouseDown={(e) => e.stopPropagation()} className="flex flex-wrap gap-1.5">
          {ARRIVAL_LEGEND_KEYS.map((key) => (
            <AttendanceLegendPill
              key={key}
              swatchClassName={arrivalLegendSwatch(key)}
              label={ATTENDANCE_ARRIVAL_META[key].label}
              count={arrivalCounts[key] || 0}
              active={activeFilter?.type === 'arrival' && activeFilter?.key === key}
              onClick={() => toggleFilter('arrival', key)}
            />
          ))}
          {overtimeDays > 0 ? (
            <AttendanceLegendPill
              swatchClassName="h-[5px] w-2 shrink-0 rounded-sm bg-indigo-500"
              label="Overtime"
              count={overtimeDays}
              active={activeFilter?.type === 'overtime'}
              onClick={() => toggleFilter('overtime', 'yes')}
            />
          ) : null}
        </div>
        <span className="inline-flex h-[26px] items-center rounded-full bg-slate-50 px-2.5 text-[11.5px] text-slate-500 dark:bg-[#131b24]">
          {scheduleStats.scheduled} scheduled days so far · {scheduleStats.sundays} Sunday
          {scheduleStats.sundays === 1 ? '' : 's'} off
        </span>
      </div>
      </div>

      <AttendanceDayCorrectionMenu
        anchor={menuAnchor}
        dateStr={menuDay?.dateStr}
        row={menuDay?.row}
        outcome={menuDay?.outcome}
        todayStr={todayStr}
        onClose={() => {
          setMenuAnchor(null);
          setMenuDay(null);
        }}
        onOpenCorrection={onOpenCorrection}
      />
    </AttendancePanel>
  );
}
