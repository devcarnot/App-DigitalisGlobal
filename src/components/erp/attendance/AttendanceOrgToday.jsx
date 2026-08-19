'use client';

import { ATTENDANCE_ARRIVAL_META, formatAttendanceHm, summarizeOrgToday } from '../../../lib/erp-attendance-policy';
import { AttendancePanel } from './AttendancePageFrame';

export default function AttendanceOrgToday({ members, todayRows, todayStr, leaveByUser }) {
  const stats = summarizeOrgToday(members, todayRows, todayStr, leaveByUser);
  const workingPct = stats.onClock > 0 ? ((stats.onClock - stats.onBreak) / stats.onClock) * 100 : 0;
  const breakPct = stats.onClock > 0 ? (stats.onBreak / stats.onClock) * 100 : 0;
  const leavePct = stats.total > 0 ? (stats.onLeave / stats.total) * 100 : 0;
  const notInPct = stats.total > 0 ? (stats.notIn / stats.total) * 100 : 0;

  const chips = [
    { key: 'working', label: 'In office', count: stats.onClock - stats.onBreak, active: true, color: 'bg-[#103D4D]' },
    { key: 'break', label: 'On break', count: stats.onBreak, color: 'bg-violet-500' },
    { key: 'leave', label: 'On leave', count: stats.onLeave, color: 'bg-slate-400' },
    { key: 'not_in', label: 'Not in', count: stats.notIn, warn: true, color: 'bg-amber-400' },
  ];

  return (
    <AttendancePanel className="flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Org today</p>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          updated just now · {stats.total} members
        </span>
      </div>

      <div className="mt-3.5 flex flex-wrap items-end gap-3.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[28px] font-semibold tabular-nums">{stats.onClock}</span>
          <span className="text-[14px] text-slate-600">of {stats.total} on the clock</span>
        </div>
        <div className="min-w-[120px] flex-1 pb-1">
          <div className="flex h-2.5 overflow-hidden rounded-full gap-px">
            {workingPct > 0 ? <div style={{ width: `${workingPct}%` }} className="bg-[#103D4D]" /> : null}
            {breakPct > 0 ? <div style={{ width: `${breakPct}%` }} className="bg-violet-500" /> : null}
            {leavePct > 0 ? <div style={{ width: `${leavePct}%` }} className="bg-slate-400" /> : null}
            {notInPct > 0 ? <div style={{ width: `${notInPct}%` }} className="bg-amber-400" /> : null}
          </div>
          {stats.onBreak > 0 ? (
            <p className="mt-2 text-[11.5px] text-slate-500">{stats.onBreak} of them on a break right now</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div
            key={chip.key}
            className={`inline-flex h-11 items-center gap-2 rounded-[11px] border px-3.5 ${
              chip.active
                ? 'border-teal-200/80 bg-teal-50/80 dark:border-teal-800/40 dark:bg-teal-950/25'
                : chip.warn
                  ? 'border-amber-300/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20'
                  : 'border-slate-200 bg-white dark:border-teal-900/45 dark:bg-[#131b24]'
            }`}
          >
            <span className={`h-2 w-2 rounded-sm ${chip.color}`} />
            <span className={`text-[12.5px] ${chip.active || chip.warn ? 'font-semibold' : 'font-medium'}`}>
              {chip.label}
            </span>
            <span className="font-mono text-[14px] font-semibold tabular-nums">{chip.count}</span>
          </div>
        ))}
      </div>

      {stats.onClock > 0 ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 dark:border-teal-900/35">
          <span className="text-[11.5px] font-medium text-slate-500">Arrivals of the {stats.onClock}</span>
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
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-orange-700">
              <span className={`h-[5px] w-2.5 rounded-sm ${ATTENDANCE_ARRIVAL_META.late.band}`} />
              {stats.late} late
            </span>
          ) : null}
        </div>
      ) : null}
    </AttendancePanel>
  );
}

export function AttendanceBacklogPanel({ openItems = 0 }) {
  return (
    <AttendancePanel className="w-full lg:w-[300px] lg:flex-none">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold">Backlog</p>
        <p className="text-[11.5px] text-amber-700">blocks the lock</p>
      </div>
      <div className="mt-3 space-y-2 text-[12px] text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-6 font-mono text-[15px] font-semibold">{openItems}</span>
          Open items
          <span className="ml-auto text-[11px] text-slate-500">missing / open shifts</span>
        </div>
      </div>
      <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500 dark:border-teal-900/35">
        Corrections and disputes will route here when that workflow ships. For now, use the roster table below to edit
        times.
      </p>
    </AttendancePanel>
  );
}
