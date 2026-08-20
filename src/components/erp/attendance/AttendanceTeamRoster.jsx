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
      ? 'border-orange-200/90 bg-gradient-to-b from-orange-50 to-orange-100/80 text-orange-900 shadow-sm dark:border-orange-800/40 dark:from-orange-950/40 dark:to-orange-950/20 dark:text-orange-200'
      : band === 'early'
        ? 'border-sky-200/90 bg-gradient-to-b from-sky-50 to-sky-100/70 text-sky-900 shadow-sm dark:border-sky-800/40 dark:from-sky-950/40 dark:to-sky-950/20 dark:text-sky-200'
        : 'border-slate-200/90 bg-slate-50 text-slate-700 shadow-sm dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200';
  return (
    <span className={`inline-flex h-[22px] items-center rounded-full border px-2.5 text-[10.5px] font-semibold ${tone}`}>
      {meta.label}
    </span>
  );
}

function SummaryPill({ label, count, tone }) {
  if (!count) return null;
  const styles = {
    working: 'border-teal-200/80 bg-teal-50/90 text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/35 dark:text-teal-100',
    break: 'border-amber-200/80 bg-amber-50/90 text-amber-900 dark:border-amber-900/45 dark:bg-amber-950/30 dark:text-amber-100',
    leave: 'border-slate-200/90 bg-slate-50 text-slate-600 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-300',
    notIn: 'border-orange-200/80 bg-orange-50/80 text-orange-900 dark:border-orange-900/40 dark:bg-orange-950/25 dark:text-orange-100',
  };
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${styles[tone] || styles.working}`}
    >
      <span className="font-mono text-[10px] tabular-nums opacity-80">{count}</span>
      {label}
    </span>
  );
}

function WorkloadCell({ memberId, workload, selected, onProjectsClick, onTasksClick, onOverdueClick }) {
  if (!workload) return <span className="text-[11px] text-slate-400">—</span>;
  const heavy = workload.openTasks >= 7;
  const pill =
    'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold whitespace-nowrap transition hover:shadow-sm';
  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${selected ? 'rounded-lg bg-teal-50/80 p-0.5 ring-1 ring-teal-200/70 dark:bg-teal-950/30 dark:ring-teal-800/50' : ''}`}
    >
      <button
        type="button"
        onClick={() => onProjectsClick?.(memberId)}
        className={`${pill} border-slate-200/90 bg-slate-50/90 text-slate-700 hover:border-teal-200 hover:bg-teal-50 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200 dark:hover:border-teal-700`}
      >
        <span className="font-mono tabular-nums">{workload.active}</span>
        <span>Projects</span>
      </button>
      <button
        type="button"
        onClick={() => onTasksClick?.(memberId)}
        className={`${pill} ${
          heavy
            ? 'border-rose-200/90 bg-rose-50/90 text-rose-800 hover:border-rose-300 dark:border-rose-900/45 dark:bg-rose-950/30 dark:text-rose-200'
            : 'border-slate-200/90 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 dark:border-teal-900/45 dark:bg-[#0a1018] dark:text-slate-300'
        }`}
      >
        <span className="font-mono tabular-nums">{workload.openTasks}</span>
        <span>Tasks</span>
      </button>
      {workload.overdue > 0 ? (
        <button
          type="button"
          onClick={() => onOverdueClick?.(memberId)}
          className={`${pill} border-red-200/90 bg-red-50/90 text-red-800 hover:border-red-300 dark:border-red-900/45 dark:bg-red-950/30 dark:text-red-200`}
        >
          <span className="font-mono tabular-nums">{workload.overdue}</span>
          <span>Overdue</span>
        </button>
      ) : null}
    </div>
  );
}

const GRID =
  'grid grid-cols-[28px_minmax(0,1.15fr)_minmax(168px,1.4fr)_132px_108px_76px_68px_40px] items-center gap-2.5';

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
    <AttendancePanel
      className={`overflow-hidden !p-0 ${compact ? '' : 'shadow-[0_4px_20px_-8px_rgba(16,61,77,0.15)] dark:shadow-none'}`}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/50 to-teal-50/20 px-4 py-3.5 dark:border-teal-900/35 dark:from-[#0c121a] dark:via-[#0c121a] dark:to-teal-950/15 sm:px-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Who is in</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <SummaryPill label="in office" count={summary.working} tone="working" />
            <SummaryPill label="on break" count={summary.break} tone="break" />
            <SummaryPill label="on leave" count={summary.leave} tone="leave" />
            <SummaryPill label="not in" count={summary.notIn} tone="notIn" />
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>
      </div>

      <div className="overflow-x-auto px-2 pb-2 pt-1 sm:px-3">
        <div className="min-w-[760px]">
          <div
            className={`${GRID} border-b border-slate-100 px-2 py-2.5 dark:border-teal-900/35`}
          >
            <div />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Member</p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Work</p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Status</p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Arrival</p>
            <p className="text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Net
            </p>
            <p className="text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Break
            </p>
            <div />
          </div>

          <div className="mt-1 flex flex-col gap-0.5">
            {roster.map(({ member, row, presence, presenceMeta, netSec, breakSec, workload }) => {
              const selected = selectedMemberId === member.id;
              return (
                <div
                  key={member.id}
                  className={`${GRID} rounded-xl px-2 py-2 transition-all ${
                    selected
                      ? 'bg-teal-50/90 ring-1 ring-teal-200/80 dark:bg-teal-950/25 dark:ring-teal-800/50'
                      : 'hover:bg-slate-50/90 dark:hover:bg-teal-950/15'
                  }`}
                >
                  <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
                  <button
                    type="button"
                    onClick={() => onMemberClick?.(member.id)}
                    className="min-w-0 truncate text-left text-[12.5px] font-semibold text-slate-800 transition hover:text-[#103D4D] dark:text-slate-100 dark:hover:text-teal-200"
                  >
                    {member.full_name?.trim() || 'Member'}
                  </button>
                  <WorkloadCell
                    memberId={member.id}
                    workload={workload}
                    selected={selected}
                    onProjectsClick={onProjectsClick}
                    onTasksClick={onTasksClick}
                    onOverdueClick={onOverdueClick}
                  />
                  <span
                    className={`inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-transparent px-1 py-0.5 text-[12px] font-medium ${presenceMeta.tone}`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-white dark:ring-[#0c121a] ${presenceMeta.dot}`} />
                    <span className="truncate">
                      {presenceMeta.label}
                      {row?.check_in_at && presence !== 'leave' ? ` · ${formatTimeCompact(row.check_in_at)}` : ''}
                    </span>
                  </span>
                  <div>
                    {row?.check_in_at && presence !== 'leave' ? (
                      <ArrivalBadge checkInIso={row.check_in_at} workDateStr={row.work_date} />
                    ) : (
                      <span className="text-[12px] text-slate-400 dark:text-slate-300">{presence === 'not_in' ? 'no check-in' : '—'}</span>
                    )}
                  </div>
                  <p className="text-right font-mono text-[12px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
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
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-400 transition hover:border-slate-200 hover:bg-white hover:text-[#103D4D] hover:shadow-sm dark:hover:border-teal-800/45 dark:hover:bg-[#131b24] dark:hover:text-teal-200"
                      aria-label={`Options for ${member.full_name}`}
                      aria-expanded={menuMemberId === member.id}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
