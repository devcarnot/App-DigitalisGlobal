'use client';

import { useRef, useState } from 'react';
import {
  ATTENDANCE_ARRIVAL_META,
  ATTENDANCE_PRESENCE_META,
  classifyAttendanceArrival,
  classifyMemberPresence,
  formatAttendanceHm,
} from '../../../lib/erp-attendance-policy';
import { attendanceLiveBreakSeconds, attendanceRowNetSeconds } from '../../../lib/erp-attendance';
import ErpUserAvatar from '../ErpUserAvatar';
import { AttendancePanel } from './AttendancePageFrame';
import TeamMemberRowMenu from './TeamMemberRowMenu';

function formatTimeCompact(iso) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function ArrivalBadge({ checkInIso, workDateStr }) {
  const band = classifyAttendanceArrival(checkInIso, workDateStr);
  const meta = ATTENDANCE_ARRIVAL_META[band];
  if (band === 'none') return <span className="text-[12px] text-slate-400">—</span>;
  const tone =
    band === 'late'
      ? 'border-orange-300/70 bg-orange-50 text-orange-800 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-200'
      : band === 'early'
        ? 'border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-800/40 dark:bg-sky-950/30 dark:text-sky-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200';
  return (
    <span className={`inline-flex h-[21px] items-center rounded-full border px-2 text-[10.5px] font-semibold ${tone}`}>
      {meta.label}
    </span>
  );
}

function WorkloadCell({ memberId, workload, selected, onProjectsClick, onTasksClick, onOverdueClick }) {
  if (!workload) return <span className="text-[11px] text-slate-400">—</span>;
  const heavy = workload.openTasks >= 7;
  const base = selected
    ? 'rounded-md bg-teal-50/90 px-1.5 py-0.5 ring-1 ring-teal-200/80 dark:bg-teal-950/35 dark:ring-teal-800/50'
    : '';
  return (
    <div className={`text-[11px] leading-snug ${base}`}>
      <button
        type="button"
        onClick={() => onProjectsClick?.(memberId)}
        className={`block w-full text-left tabular-nums hover:underline ${
          heavy ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {workload.active} active
      </button>
      <button
        type="button"
        onClick={() => onTasksClick?.(memberId)}
        className={`block w-full text-left tabular-nums hover:underline ${
          heavy ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {workload.openTasks} tasks
      </button>
      {workload.overdue > 0 ? (
        <button
          type="button"
          onClick={() => onOverdueClick?.(memberId)}
          className="block w-full text-left tabular-nums text-amber-700 hover:underline dark:text-amber-300"
        >
          {workload.overdue} overdue
        </button>
      ) : null}
    </div>
  );
}

const GRID =
  'grid grid-cols-[26px_minmax(0,1.1fr)_88px_128px_104px_72px_64px_36px] items-center gap-2.5';

/**
 * Live roster table for team / admin "who is in".
 */
export default function AttendanceTeamRoster({
  members,
  todayRowsByUser,
  todayStr,
  nowMs,
  leaveByUser,
  workloadByUser,
  selectedMemberId,
  onMemberClick,
  onProjectsClick,
  onTasksClick,
  onOverdueClick,
  compact = false,
}) {
  const [menuMemberId, setMenuMemberId] = useState(null);
  const menuAnchorRef = useRef(null);

  const roster = (members || []).map((member) => {
    const row = todayRowsByUser[member.id] || null;
    const leaveDates = leaveByUser?.get?.(member.id);
    const presence = classifyMemberPresence(row, todayStr, { approvedLeaveDates: leaveDates });
    const presenceMeta = ATTENDANCE_PRESENCE_META[presence];
    const netSec =
      row?.check_in_at && !row.check_out_at
        ? attendanceRowNetSeconds(row, nowMs, { uid: member.id, workDate: todayStr })
        : 0;
    const breakSec =
      row?.break_started_at && !row.check_out_at
        ? attendanceLiveBreakSeconds(row, nowMs, { uid: member.id, workDate: todayStr })
        : Number(row?.break_seconds_total) || 0;
    const workload = workloadByUser?.get?.(member.id);

    return { member, row, presence, presenceMeta, netSec, breakSec, workload };
  });

  const summary = roster.reduce(
    (acc, r) => {
      if (r.presence === 'working') acc.working += 1;
      if (r.presence === 'break') acc.break += 1;
      if (r.presence === 'leave') acc.leave += 1;
      if (r.presence === 'not_in') acc.notIn += 1;
      return acc;
    },
    { working: 0, break: 0, leave: 0, notIn: 0 },
  );

  const menuMember = menuMemberId ? roster.find((r) => r.member.id === menuMemberId)?.member : null;

  return (
    <AttendancePanel className={compact ? '!pb-2' : ''}>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Who is in</p>
        <p className="text-[11.5px] text-slate-500">
          {summary.working} in office · {summary.break} on break · {summary.leave} on leave · {summary.notIn} not in
        </p>
        <span className="ml-auto text-[11.5px] text-slate-500">live</span>
      </div>

      <div className="mt-2.5 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${GRID} border-b border-slate-100 py-2 dark:border-teal-900/35`}>
            <div />
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Member</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Projects</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Status</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Arrival</p>
            <p className="text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Net</p>
            <p className="text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Break</p>
            <div />
          </div>
          {roster.map(({ member, row, presence, presenceMeta, netSec, breakSec, workload }) => (
            <div
              key={member.id}
              className={`${GRID} border-b border-slate-50 py-2.5 last:border-0 dark:border-teal-900/20`}
            >
              <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
              <button
                type="button"
                onClick={() => onMemberClick?.(member.id)}
                className="min-w-0 truncate text-left text-[12.5px] font-medium hover:text-[#103D4D] dark:hover:text-teal-200"
              >
                {member.full_name?.trim() || 'Member'}
              </button>
              <WorkloadCell
                memberId={member.id}
                workload={workload}
                selected={selectedMemberId === member.id}
                onProjectsClick={onProjectsClick}
                onTasksClick={onTasksClick}
                onOverdueClick={onOverdueClick}
              />
              <span className={`inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium ${presenceMeta.tone}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${presenceMeta.dot}`} />
                <span className="truncate">
                  {presenceMeta.label}
                  {row?.check_in_at && presence !== 'leave' ? ` · ${formatTimeCompact(row.check_in_at)}` : ''}
                </span>
              </span>
              <div>
                {row?.check_in_at && presence !== 'leave' ? (
                  <ArrivalBadge checkInIso={row.check_in_at} workDateStr={row.work_date} />
                ) : (
                  <span className="text-[12px] text-slate-400">{presence === 'not_in' ? 'no check-in' : '—'}</span>
                )}
              </div>
              <p className="text-right font-mono text-[12px] font-medium tabular-nums">
                {netSec > 0 ? formatAttendanceHm(netSec) : '—'}
              </p>
              <p className="text-right font-mono text-[12px] tabular-nums text-slate-500">
                {breakSec > 0 ? formatAttendanceHm(breakSec) : '0m'}
              </p>
              <div className="text-right">
                <button
                  ref={menuMemberId === member.id ? menuAnchorRef : undefined}
                  type="button"
                  onClick={() => setMenuMemberId((cur) => (cur === member.id ? null : member.id))}
                  className="text-[13px] font-semibold text-slate-300 hover:text-[#103D4D] dark:hover:text-teal-200"
                  aria-label={`Options for ${member.full_name}`}
                  aria-expanded={menuMemberId === member.id}
                >
                  ⋯
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {menuMember && menuMemberId ? (
        <TeamMemberRowMenu
          memberId={menuMember.id}
          memberName={menuMember.full_name?.trim() || 'Member'}
          workload={workloadByUser?.get?.(menuMember.id)}
          anchorRef={menuAnchorRef}
          onViewAttendance={() => onMemberClick?.(menuMember.id)}
          onClose={() => setMenuMemberId(null)}
        />
      ) : null}
    </AttendancePanel>
  );
}
