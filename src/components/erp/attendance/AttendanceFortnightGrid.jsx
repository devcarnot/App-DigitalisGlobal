'use client';

import { useEffect, useMemo, useRef, useState } from 'react';import {
  ATTENDANCE_OUTCOME_META,
  classifyAttendanceDayOutcome,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds, dateStringAddDays, formatWorkDate } from '../../../lib/erp-attendance';
import ErpUserAvatar from '../ErpUserAvatar';
import { dailyHoursBarTone, formatNetHoursShort } from '../ErpAttendanceCharts';
import { AttendanceLegendPill, AttendancePanel } from './AttendancePageFrame';

const LEGEND_KEYS = ['full', 'short', 'absent', 'leave', 'missing', 'open', 'off'];

const LEGEND_SWATCH = {
  full: 'bg-[#103D4D]',
  short: 'bg-amber-300',
  absent: 'bg-red-500',
  leave: 'bg-slate-300',
  missing: 'bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#fff_3px_6px)] border border-slate-300',
  open: 'border-[1.5px] border-dashed border-teal-500 bg-teal-50',
  off: 'bg-slate-100 border border-slate-200',
};

const OUTCOME_BAR_CLASS = {
  full: 'bg-[#103D4D]',
  short: 'bg-amber-400',
  half: 'bg-orange-400',
  absent: 'bg-red-400',
  leave: 'bg-slate-300',
  missing: 'bg-[repeating-linear-gradient(45deg,#e2e8f0_0_2px,#fff_2px_4px)] border border-slate-300',
  open: 'border border-dashed border-teal-500 bg-teal-100 dark:bg-teal-950/40',
  off: 'bg-slate-100 border border-slate-200 dark:bg-slate-800',
  future: 'border border-dashed border-slate-200',
  none: 'bg-slate-100/80 dark:bg-slate-800/50',
};

function ViewToggle({ view, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-[#131b24]">
      {[
        { id: 'grid', label: 'Grid' },
        { id: 'chart', label: 'Graph' },
      ].map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
            view === t.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0c121a] dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function outcomeMatchesFilter(outcome, filterKey) {
  if (!filterKey) return true;
  if (filterKey === 'short') return outcome === 'short' || outcome === 'half';
  return outcome === filterKey;
}

function MemberDayBar({ minutes, outcome, title, isToday, maxMinutes, filterKey }) {
  const worked = minutes > 0;
  const barClass = worked ? dailyHoursBarTone(minutes) : OUTCOME_BAR_CLASS[outcome] || OUTCOME_BAR_CLASS.none;
  const matchesFilter = outcomeMatchesFilter(outcome, filterKey);
  const dimmed = Boolean(filterKey) && !matchesFilter;
  const highlighted = Boolean(filterKey) && matchesFilter;
  const h = worked
    ? Math.max(8, Math.round((Math.min(minutes, maxMinutes) / maxMinutes) * 100))
    : outcome === 'off' || outcome === 'future' || outcome === 'none'
      ? 4
      : 10;

  return (
    <div
      className={`flex min-w-[1.35rem] flex-1 flex-col items-center gap-0.5 transition-opacity duration-200 ${dimmed ? 'opacity-25' : ''}`}
      title={title}
    >
      <div className="flex h-10 w-full items-end justify-center">
        <div
          className={`w-[72%] max-w-[1.75rem] rounded-t-[4px] transition-all ${barClass} ${!worked ? 'opacity-90' : ''} ${
            isToday ? 'ring-2 ring-teal-400/80 ring-offset-1 dark:ring-offset-[#0c121a]' : ''
          } ${highlighted ? 'ring-2 ring-teal-500/80 ring-offset-1 dark:ring-offset-[#0c121a]' : ''}`}
          style={{ height: `${h}%`, minHeight: worked ? 6 : 3 }}
        />
      </div>
    </div>
  );
}

export default function AttendanceFortnightGrid({
  members,
  rows,
  todayStr,
  nowMs,
  leaveByUser,
  dayCount = 14,
  onMemberClick,
}) {
  const [view, setView] = useState('grid');
  const [activeFilter, setActiveFilter] = useState(null);
  const legendRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!activeFilter) return undefined;
    function onDocMouseDown(e) {
      if (legendRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setActiveFilter(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [activeFilter]);

  const fromStr = useMemo(() => dateStringAddDays(todayStr, -(dayCount - 1)), [todayStr, dayCount]);
  const days = useMemo(() => {
    const list = [];
    let d = fromStr;
    let guard = 0;
    while (d <= todayStr && guard < 400) {
      guard += 1;
      const dt = new Date(`${d}T12:00:00`);
      list.push({
        dateStr: d,
        isToday: d === todayStr,
        label: dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
        day: dt.getDate(),
        title: formatWorkDate(d),
      });
      d = dateStringAddDays(d, 1);
    }
    return list;
  }, [fromStr, todayStr]);

  const rowsByUser = useMemo(() => {
    const map = {};
    for (const r of rows || []) {
      if (!map[r.user_id]) map[r.user_id] = [];
      map[r.user_id].push(r);
    }
    return map;
  }, [rows]);

  const maxChartMinutes = 10 * 60;

  const memberSeries = useMemo(() => {
    return (members || []).map((member) => {
      const memberRows = rowsByUser[member.id] || [];
      const leaveDates = leaveByUser?.get?.(member.id);
      const bars = days.map((d) => {
        const row = memberRows.find((r) => String(r.work_date).slice(0, 10) === d.dateStr);
        const outcome = classifyAttendanceDayOutcome(row || { work_date: d.dateStr }, todayStr, nowMs, {
          uid: member.id,
          approvedLeaveDates: leaveDates,
        });
        const netSec = row?.check_in_at
          ? attendanceRowNetSeconds(row, nowMs, { uid: member.id, workDate: d.dateStr, todayStr })
          : 0;
        const minutes = Math.round(netSec / 60);
        const meta = ATTENDANCE_OUTCOME_META[outcome] || ATTENDANCE_OUTCOME_META.none;
        const hoursLabel = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
        return {
          ...d,
          outcome,
          minutes,
          netSec,
          tooltip: `${member.full_name?.trim() || 'Member'} · ${d.title} · ${meta.label}${minutes > 0 ? ` · ${hoursLabel}` : ''}`,
        };
      });
      const totalSec = bars.reduce((s, b) => s + b.netSec, 0);
      return { member, bars, totalSec };
    });
  }, [members, rowsByUser, days, todayStr, nowMs, leaveByUser]);

  return (
    <div ref={panelRef}>
    <AttendancePanel className="overflow-hidden !p-0 shadow-[0_4px_20px_-8px_rgba(16,61,77,0.12)] dark:shadow-none">
      <div className="border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/40 to-sky-50/30 px-4 py-3.5 dark:border-teal-900/35 dark:from-[#0c121a] dark:via-[#0c121a] dark:to-sky-950/10 sm:px-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
            Last two weeks · my {members.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {view === 'grid' ? 'Day outcome per cell · tap legend to highlight' : 'Daily net hours per member'} · tap for detail
          </p>
          <div className="ml-auto">
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>
        {view === 'grid' ? (
          <div ref={legendRef} onMouseDown={(e) => e.stopPropagation()} className="mt-2.5 flex flex-wrap gap-1.5">
            {LEGEND_KEYS.map((key) => {
              const meta = ATTENDANCE_OUTCOME_META[key];
              if (!meta) return null;
              return (
                <AttendanceLegendPill
                  key={key}
                  label={meta.label}
                  swatchClassName={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${LEGEND_SWATCH[key] || 'bg-slate-200'}`}
                  active={activeFilter === key}
                  onClick={() => setActiveFilter((cur) => (cur === key ? null : key))}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {view === 'chart' ? (
        <div className="px-4 py-4 sm:px-[18px]">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div
                className="grid items-end gap-1.5 border-b border-slate-100 pb-2 dark:border-teal-900/35"
                style={{ gridTemplateColumns: `minmax(148px,168px) repeat(${days.length}, minmax(28px, 1fr))` }}
              >
                <p className="font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-500">Member</p>
                {days.map((d) => (
                  <div
                    key={d.dateStr}
                    className={`text-center font-mono text-[8px] font-semibold uppercase ${
                      d.isToday ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500'
                    }`}
                  >
                    <div>{d.weekday}</div>
                    <div className="tabular-nums">{d.day}</div>
                  </div>
                ))}
              </div>

              <div className="mt-1 flex flex-col gap-1">
                {memberSeries.map(({ member, bars, totalSec }) => {
                  const rowHasMatch =
                    !activeFilter || bars.some((bar) => outcomeMatchesFilter(bar.outcome, activeFilter));
                  return (
                  <div
                    key={member.id}
                    className={`grid items-center gap-1.5 rounded-xl py-1.5 transition hover:bg-slate-50/80 dark:hover:bg-teal-950/15 ${
                      activeFilter && !rowHasMatch ? 'opacity-30' : ''
                    }`}
                    style={{ gridTemplateColumns: `minmax(148px,168px) repeat(${days.length}, minmax(28px, 1fr))` }}
                  >
                    <button
                      type="button"
                      onClick={() => onMemberClick?.(member.id)}
                      className="flex min-w-0 items-center gap-2 px-1 text-left"
                    >
                      <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-semibold text-slate-800 dark:text-slate-100">
                          {member.full_name?.trim() || 'Member'}
                        </p>
                        <p className="font-mono text-[9px] tabular-nums text-slate-500">{formatNetHoursShort(totalSec)}</p>
                      </div>
                    </button>
                    {bars.map((bar) => (
                      <MemberDayBar
                        key={`${member.id}-${bar.dateStr}`}
                        minutes={bar.minutes}
                        outcome={bar.outcome}
                        title={bar.tooltip}
                        isToday={bar.isToday}
                        maxMinutes={maxChartMinutes}
                        filterKey={activeFilter}
                      />
                    ))}
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto px-2 pb-3 pt-2 sm:px-3">
          <div className="min-w-[760px]">
            <div
              className="grid items-end gap-1.5 px-1"
              style={{ gridTemplateColumns: `minmax(148px,160px) repeat(${days.length}, minmax(30px, 1fr))` }}
            >
              <div />
              {days.map((d) => (
                <div
                  key={d.dateStr}
                  className={`text-center font-mono text-[9px] font-semibold uppercase tracking-wide ${
                    d.isToday ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500'
                  }`}
                >
                  {d.label}
                </div>
              ))}

              {(members || []).map((member) => {
                const memberRows = rowsByUser[member.id] || [];
                const leaveDates = leaveByUser?.get?.(member.id);
                const dayOutcomes = days.map((d) => {
                  const row = memberRows.find((r) => String(r.work_date).slice(0, 10) === d.dateStr);
                  return classifyAttendanceDayOutcome(row || { work_date: d.dateStr }, todayStr, nowMs, {
                    uid: member.id,
                    approvedLeaveDates: leaveDates,
                  });
                });
                const rowHasMatch =
                  !activeFilter || dayOutcomes.some((outcome) => outcomeMatchesFilter(outcome, activeFilter));
                return (
                  <div key={member.id} className="contents">
                    <button
                      type="button"
                      onClick={() => onMemberClick?.(member.id)}
                      className={`flex min-w-0 items-center gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-teal-950/20 ${
                        activeFilter && !rowHasMatch ? 'opacity-30' : ''
                      }`}
                    >
                      <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
                      <span className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                        {member.full_name?.trim() || 'Member'}
                      </span>
                    </button>
                    {days.map((d, dayIndex) => {
                      const outcome = dayOutcomes[dayIndex];
                      const meta = ATTENDANCE_OUTCOME_META[outcome] || ATTENDANCE_OUTCOME_META.none;
                      const matchesFilter = outcomeMatchesFilter(outcome, activeFilter);
                      const dimmed = Boolean(activeFilter) && !matchesFilter;
                      const highlighted = Boolean(activeFilter) && matchesFilter;
                      return (
                        <div
                          key={`${member.id}-${d.dateStr}`}
                          title={`${member.full_name} · ${d.dateStr} · ${meta.label}`}
                          className={`mx-auto h-[24px] w-full max-w-[36px] rounded-[5px] transition-all duration-200 hover:scale-110 hover:shadow-md ${meta.cell} ${
                            d.isToday ? 'ring-2 ring-teal-400/70 ring-offset-1 dark:ring-offset-[#0c121a]' : ''
                          } ${dimmed ? 'opacity-25' : ''} ${
                            highlighted ? 'ring-2 ring-teal-500/80 ring-offset-1 dark:ring-offset-[#0c121a]' : ''
                          }`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </AttendancePanel>
    </div>
  );
}
