'use client';

import { useMemo } from 'react';
import {
  ATTENDANCE_OUTCOME_META,
  classifyAttendanceDayOutcome,
} from '../../../lib/erp-attendance-policy';
import { dateStringAddDays } from '../../../lib/erp-attendance';
import { AttendancePanel } from './AttendancePageFrame';

/** Fortnight grid: members × days with outcome colors. */
export default function AttendanceFortnightGrid({
  members,
  rows,
  todayStr,
  nowMs,
  leaveByUser,
  dayCount = 14,
  onMemberClick,
}) {
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
        label: dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
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

  return (
    <AttendancePanel>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Fortnight · every member every day</p>
        <p className="text-[11.5px] text-slate-500">
          {days[0]?.dateStr} – {todayStr} · tap a member for detail
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className="grid items-end gap-1"
            style={{ gridTemplateColumns: `140px repeat(${days.length}, minmax(28px, 1fr))` }}
          >
            <div />
            {days.map((d) => (
              <div key={d.dateStr} className="text-center font-mono text-[9.5px] text-slate-500">
                {d.label}
              </div>
            ))}
            {(members || []).map((member) => {
              const memberRows = rowsByUser[member.id] || [];
              const leaveDates = leaveByUser?.get?.(member.id);
              return (
                <div key={member.id} className="contents">
                  <button
                    type="button"
                    onClick={() => onMemberClick?.(member.id)}
                    className="truncate pr-2 text-left text-[12px] font-medium hover:text-[#103D4D] dark:hover:text-teal-200"
                  >
                    {member.full_name?.trim() || 'Member'}
                  </button>
                  {days.map((d) => {
                    const row = memberRows.find((r) => String(r.work_date).slice(0, 10) === d.dateStr);
                    const outcome = classifyAttendanceDayOutcome(row || { work_date: d.dateStr }, todayStr, nowMs, {
                      uid: member.id,
                      approvedLeaveDates: leaveDates,
                    });
                    const meta = ATTENDANCE_OUTCOME_META[outcome] || ATTENDANCE_OUTCOME_META.none;
                    return (
                      <div
                        key={`${member.id}-${d.dateStr}`}
                        title={`${member.full_name} · ${d.dateStr} · ${meta.label}`}
                        className={`mx-auto h-[22px] w-full max-w-[34px] rounded-[4px] ${meta.cell}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AttendancePanel>
  );
}
