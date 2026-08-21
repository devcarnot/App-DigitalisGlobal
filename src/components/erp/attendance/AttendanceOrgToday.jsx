'use client';

import { ATTENDANCE_ARRIVAL_META, summarizeOrgDay } from '../../../lib/erp-attendance-policy';
import { AttendanceFilterPill, AttendancePanel } from './AttendancePageFrame';
import { AttendanceSectionHeader } from './AttendanceViewPageFrame';

function togglePresenceFilter(current, key) {
  return current === key ? null : key;
}

function formatViewDayLabel(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AttendanceOrgToday({
  members,
  dayRows,
  viewDateStr,
  todayStr,
  leaveByUser,
  isLiveView,
  presenceFilter,
  onPresenceFilterChange,
}) {
  const isLive = isLiveView ?? viewDateStr === todayStr;
  const stats = summarizeOrgDay(members, dayRows, viewDateStr, leaveByUser, { isLive });
  const workingCount = isLive ? stats.onClock - stats.onBreak : stats.onClock;
  const workingPct = stats.onClock > 0 ? (workingCount / stats.onClock) * 100 : 0;
  const breakPct = stats.onClock > 0 ? (stats.onBreak / stats.onClock) * 100 : 0;
  const leavePct = stats.total > 0 ? (stats.onLeave / stats.total) * 100 : 0;
  const notInPct = stats.total > 0 ? (stats.notIn / stats.total) * 100 : 0;
  const canFilter = Boolean(onPresenceFilterChange);

  return (
    <AttendancePanel flush className="flex-1">
      <AttendanceSectionHeader
        title={isLive ? 'Org today' : `Org · ${formatViewDayLabel(viewDateStr)}`}
        subtitle={
          isLive
            ? `${stats.total} members · live presence`
            : `${stats.total} members · day snapshot`
        }
      >
        {isLive ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-400">
            Past day
          </span>
        )}
      </AttendanceSectionHeader>

      <div className="px-4 py-4 sm:px-[18px]">
        <div className="flex flex-wrap items-end gap-3.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-bold tabular-nums text-[#103D4D] dark:text-white">
              {stats.onClock}
            </span>
            <span className="text-[14px] text-slate-600 dark:text-slate-300">
              of {stats.total} {isLive ? 'on the clock' : 'checked in'}
            </span>
          </div>
          <div className="min-w-[120px] flex-1 pb-1">
            <div className="flex h-2.5 overflow-hidden rounded-full gap-px">
              {workingPct > 0 ? <div style={{ width: `${workingPct}%` }} className="bg-[#103D4D]" /> : null}
              {breakPct > 0 ? <div style={{ width: `${breakPct}%` }} className="bg-violet-500" /> : null}
              {leavePct > 0 ? <div style={{ width: `${leavePct}%` }} className="bg-slate-400" /> : null}
              {notInPct > 0 ? <div style={{ width: `${notInPct}%` }} className="bg-amber-400" /> : null}
            </div>
            {isLive && stats.onBreak > 0 ? (
              <p className="mt-2 text-[11.5px] text-slate-500">{stats.onBreak} of them on a break right now</p>
            ) : null}
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <AttendanceFilterPill
            label={isLive ? 'in office' : 'checked in'}
            count={workingCount}
            tone="working"
            active={presenceFilter === 'working'}
            onClick={
              canFilter
                ? () => onPresenceFilterChange(togglePresenceFilter(presenceFilter, 'working'))
                : undefined
            }
          />
          {isLive ? (
            <AttendanceFilterPill
              label="on break"
              count={stats.onBreak}
              tone="break"
              active={presenceFilter === 'break'}
              onClick={
                canFilter
                  ? () => onPresenceFilterChange(togglePresenceFilter(presenceFilter, 'break'))
                  : undefined
              }
            />
          ) : null}
          <AttendanceFilterPill
            label="on leave"
            count={stats.onLeave}
            tone="leave"
            active={presenceFilter === 'leave'}
            onClick={
              canFilter
                ? () => onPresenceFilterChange(togglePresenceFilter(presenceFilter, 'leave'))
                : undefined
            }
          />
          <AttendanceFilterPill
            label="not in"
            count={stats.notIn}
            tone="notIn"
            active={presenceFilter === 'notIn'}
            onClick={
              canFilter
                ? () => onPresenceFilterChange(togglePresenceFilter(presenceFilter, 'notIn'))
                : undefined
            }
          />
        </div>

        {stats.onClock > 0 ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 dark:border-teal-900/35">
            <span className="text-[11.5px] font-medium text-slate-500">
              Arrivals of the {stats.onClock}
            </span>
            {stats.early > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
                <span className={`h-[5px] w-2.5 rounded-sm ${ATTENDANCE_ARRIVAL_META.early.band}`} />
                {stats.early} early
              </span>
            ) : null}
            {stats.onTime > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
                <span className={`h-[5px] w-2.5 rounded-sm ${ATTENDANCE_ARRIVAL_META.on_time.band}`} />
                {stats.onTime} on time
              </span>
            ) : null}
            {stats.late > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-700 dark:text-red-400">
                <span className={`h-[5px] w-2.5 rounded-sm ${ATTENDANCE_ARRIVAL_META.late.band}`} />
                {stats.late} late
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </AttendancePanel>
  );
}

export function AttendanceBacklogPanel({ openItems = 0 }) {
  return (
    <AttendancePanel flush className="w-full lg:w-[300px] lg:flex-none">
      <AttendanceSectionHeader title="Backlog" subtitle="blocks the period lock" />
      <div className="px-4 py-4 sm:px-[18px]">
        <div className="relative overflow-hidden rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-orange-50/40 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/10">
          <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
          <div className="px-3.5 py-3 pl-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[22px] font-bold tabular-nums text-amber-900 dark:text-amber-100">
                {openItems}
              </span>
              <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">open items</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">missing punches / open shifts</p>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-slate-500">
          Use the roster below to edit times, or review correction requests when members submit them.
        </p>
      </div>
    </AttendancePanel>
  );
}
