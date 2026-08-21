'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ATTENDANCE_ARRIVAL_META,
  ATTENDANCE_PRESENCE_META,
  classifyAttendanceArrival,
  classifyMemberPresence,
  formatAttendanceHm,
  rosterPresenceMatchesFilter,
} from '../../../lib/erp-attendance-policy';
import { attendanceLiveBreakSeconds, attendanceRowNetSeconds } from '../../../lib/erp-attendance';
import { erpMemberTeamLabel } from '../../../lib/erp-roles';
import ErpUserAvatar from '../ErpUserAvatar';
import { AttendanceFilterPill, AttendancePanel } from './AttendancePageFrame';
import TeamMemberRowMenu from './TeamMemberRowMenu';
import AttendanceMemberRecentPanel from './AttendanceMemberRecentPanel';

const GRID =
  'grid grid-cols-[36px_minmax(0,1.15fr)_minmax(168px,1.4fr)_140px_112px_84px_76px_40px] items-center gap-2.5';

const PRESENCE_ACCENT = {
  working: 'border-l-teal-500 bg-gradient-to-r from-teal-50/70 to-white dark:from-teal-950/25 dark:to-[#0a1018]',
  break: 'border-l-amber-400 bg-gradient-to-r from-amber-50/60 to-white dark:from-amber-950/20 dark:to-[#0a1018]',
  leave: 'border-l-slate-400 bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-900/30 dark:to-[#0a1018]',
  not_in: 'border-l-orange-400 bg-gradient-to-r from-orange-50/50 to-white dark:from-orange-950/15 dark:to-[#0a1018]',
  done: 'border-l-slate-300 bg-gradient-to-r from-slate-50/60 to-white dark:from-slate-900/20 dark:to-[#0a1018]',
};

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
        : 'border-slate-200/90 bg-gradient-to-b from-slate-50 to-white text-slate-700 shadow-sm dark:border-teal-900/45 dark:from-[#131b24] dark:to-[#0c121a] dark:text-slate-200';
  return (
    <span className={`inline-flex h-[24px] items-center rounded-full border px-2.5 text-[10.5px] font-semibold ${tone}`}>
      {meta.label}
    </span>
  );
}

function togglePresenceFilter(current, key) {
  return current === key ? null : key;
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
        className={`${pill} border-slate-200/90 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200 dark:hover:border-teal-700`}
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

function memberMatchesSearch(member, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const teamLabel = erpMemberTeamLabel(member.member_team) || member.member_team || '';
  const haystack = [member.full_name, member.email, teamLabel, member.id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function StatusPill({ presence, presenceMeta, row }) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold shadow-sm ${presenceMeta.tone} ${
        presence === 'working'
          ? 'border-teal-200/80 bg-teal-50/90 dark:border-teal-800/50 dark:bg-teal-950/30'
          : presence === 'not_in'
            ? 'border-orange-200/80 bg-orange-50/80 dark:border-orange-900/40 dark:bg-orange-950/20'
            : presence === 'break'
              ? 'border-violet-200/80 bg-violet-50/90 dark:border-violet-900/45 dark:bg-violet-950/25'
              : 'border-slate-200/80 bg-white/90 dark:border-teal-900/45 dark:bg-[#131b24]'
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-white dark:ring-[#0c121a] ${presenceMeta.dot}`} />
      <span className="truncate">
        {presenceMeta.label}
        {row?.check_in_at && presence !== 'leave' ? ` · ${formatTimeCompact(row.check_in_at)}` : ''}
      </span>
    </span>
  );
}

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
  isLiveView = true,
  liveTodayStr,
  allAttendanceRows = [],
  onViewMemberHistory,
  onEditRow,
  canEditRows = false,
  presenceFilter: controlledPresenceFilter,
  onPresenceFilterChange,
}) {
  const effectiveLiveToday = liveTodayStr || todayStr;
  const [menuMemberId, setMenuMemberId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [internalPresenceFilter, setInternalPresenceFilter] = useState(null);
  const menuAnchorRef = useRef(null);
  const pillsRef = useRef(null);
  const panelRef = useRef(null);

  const presenceFilter =
    controlledPresenceFilter !== undefined ? controlledPresenceFilter : internalPresenceFilter;
  const setPresenceFilter = onPresenceFilterChange ?? setInternalPresenceFilter;

  useEffect(() => {
    if (!presenceFilter || onPresenceFilterChange) return undefined;
    function onDocMouseDown(e) {
      if (pillsRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setPresenceFilter(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [presenceFilter, setPresenceFilter, onPresenceFilterChange]);

  const roster = useMemo(
    () =>
      (members || []).map((member) => {
        const row = todayRowsByUser[member.id] || null;
        const leaveDates = leaveByUser?.get?.(member.id);
        const presence = classifyMemberPresence(row, todayStr, { approvedLeaveDates: leaveDates });
        const presenceMeta = ATTENDANCE_PRESENCE_META[presence];
        const netSec = row?.check_in_at
          ? attendanceRowNetSeconds(row, nowMs, {
              uid: member.id,
              workDate: todayStr,
              todayStr: effectiveLiveToday,
            })
          : 0;
        const breakSec =
          isLiveView && row?.break_started_at && !row.check_out_at
            ? attendanceLiveBreakSeconds(row, nowMs, { uid: member.id, workDate: todayStr })
            : Number(row?.break_seconds_total) || 0;
        const workload = workloadByUser?.get?.(member.id);

        return { member, row, presence, presenceMeta, netSec, breakSec, workload };
      }),
    [members, todayRowsByUser, leaveByUser, todayStr, nowMs, effectiveLiveToday, isLiveView, workloadByUser],
  );

  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return roster;
    return roster.filter(({ member }) => memberMatchesSearch(member, q));
  }, [roster, searchQuery]);

  const summary = filteredRoster.reduce(
    (acc, r) => {
      if (isLiveView) {
        if (r.presence === 'working') acc.working += 1;
        if (r.presence === 'break') acc.break += 1;
      } else if (r.presence === 'working' || r.presence === 'done' || r.presence === 'break') {
        acc.working += 1;
      }
      if (r.presence === 'leave') acc.leave += 1;
      if (r.presence === 'not_in') acc.notIn += 1;
      return acc;
    },
    { working: 0, break: 0, leave: 0, notIn: 0 },
  );

  const menuMember = menuMemberId ? roster.find((r) => r.member.id === menuMemberId)?.member : null;

  const historyMember = useMemo(() => {
    if (filteredRoster.length === 1) return filteredRoster[0].member;
    if (selectedMemberId) {
      const hit = filteredRoster.find((r) => r.member.id === selectedMemberId);
      if (hit) return hit.member;
    }
    return null;
  }, [filteredRoster, selectedMemberId]);

  return (
    <div ref={panelRef}>
    <AttendancePanel
      className={`overflow-hidden !p-0 ${compact ? '' : 'shadow-[0_8px_30px_-14px_rgba(16,61,77,0.22)] dark:shadow-none'}`}
    >
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/80 to-teal-50/30 px-4 py-3.5 dark:border-teal-900/35 dark:from-[#0c121a] dark:via-[#0c121a] dark:to-teal-950/20 sm:px-[18px]">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-teal-100/30 to-transparent dark:from-teal-950/20"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-bold tracking-tight text-[#103D4D] dark:text-white">
            {isLiveView ? 'Who is in' : 'Who was in'}
          </p>
          <div
            ref={pillsRef}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex flex-wrap items-center gap-1.5"
          >
            <AttendanceFilterPill
              label={isLiveView ? 'in office' : 'checked in'}
              count={summary.working}
              tone="working"
              active={presenceFilter === 'working'}
              onClick={() => setPresenceFilter(togglePresenceFilter(presenceFilter, 'working'))}
            />
            {isLiveView ? (
              <AttendanceFilterPill
                label="on break"
                count={summary.break}
                tone="break"
                active={presenceFilter === 'break'}
                onClick={() => setPresenceFilter(togglePresenceFilter(presenceFilter, 'break'))}
              />
            ) : null}
            <AttendanceFilterPill
              label="on leave"
              count={summary.leave}
              tone="leave"
              active={presenceFilter === 'leave'}
              onClick={() => setPresenceFilter(togglePresenceFilter(presenceFilter, 'leave'))}
            />
            <AttendanceFilterPill
              label="not in"
              count={summary.notIn}
              tone="notIn"
              active={presenceFilter === 'notIn'}
              onClick={() => setPresenceFilter(togglePresenceFilter(presenceFilter, 'notIn'))}
            />
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <label className="relative min-w-[10rem] max-w-[240px] flex-1">
              <span className="sr-only">Search members</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search members…"
                className="h-8 w-full rounded-full border border-slate-200/90 bg-white/90 pl-8 pr-3 text-[12px] text-slate-800 shadow-sm backdrop-blur-sm placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200/80 dark:border-teal-900/45 dark:bg-[#131b24]/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600 dark:focus:ring-teal-900/40"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
                ⌕
              </span>
            </label>
            {isLiveView ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm dark:border-emerald-900/45 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-400">
                Past day
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-gradient-to-b from-slate-50/40 to-white px-3 pb-3 pt-2 dark:from-[#080d12] dark:to-[#0c121a] sm:px-4">
        <div className="min-w-[780px] space-y-1.5">
          <div className={`${GRID} rounded-xl bg-gradient-to-r from-[#103D4D] via-[#145068] to-teal-700 px-2.5 py-2.5 shadow-sm`}>
            <div />
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">Member</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">Work</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">Status</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">Arrival</p>
            <p className="text-right text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">Net</p>
            <p className="text-right text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">Break</p>
            <div />
          </div>

          {filteredRoster.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-slate-500">
              {searchQuery.trim() ? `No members match “${searchQuery.trim()}”.` : 'No members to show.'}
            </p>
          ) : (
            filteredRoster.map(({ member, row, presence, presenceMeta, netSec, breakSec, workload }) => {
              const selected = selectedMemberId === member.id;
              const accent = PRESENCE_ACCENT[presence] || PRESENCE_ACCENT.not_in;
              const matchesFilter = rosterPresenceMatchesFilter(presence, presenceFilter, { isLiveView });
              const dimmed = Boolean(presenceFilter) && !matchesFilter;
              const highlighted = Boolean(presenceFilter) && matchesFilter;
              return (
                <div
                  key={member.id}
                  className={`${GRID} rounded-xl border border-slate-100/90 border-l-[4px] px-2.5 py-2.5 shadow-[0_1px_0_rgba(16,61,77,0.04)] transition-all duration-200 ${accent} ${
                    dimmed ? 'opacity-30 saturate-50' : ''
                  } ${
                    highlighted
                      ? 'relative z-[1] scale-[1.005] ring-2 ring-teal-400/70 ring-offset-1 dark:ring-offset-[#0c121a]'
                      : selected
                        ? 'ring-2 ring-teal-400/60 ring-offset-1 dark:ring-offset-[#0c121a]'
                        : 'hover:-translate-y-px hover:border-teal-200/70 hover:shadow-[0_10px_28px_-18px_rgba(16,61,77,0.35)] dark:hover:border-teal-800/55'
                  }`}
                >
                  <div className="flex justify-center">
                    <div className="rounded-full ring-2 ring-white shadow-sm dark:ring-[#0c121a]">
                      <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onMemberClick?.(member.id)}
                    className="min-w-0 truncate text-left text-[13px] font-semibold text-slate-800 transition hover:text-[#103D4D] dark:text-slate-100 dark:hover:text-teal-200"
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
                  <StatusPill presence={presence} presenceMeta={presenceMeta} row={row} />
                  <div>
                    {row?.check_in_at && presence !== 'leave' ? (
                      <ArrivalBadge checkInIso={row.check_in_at} workDateStr={row.work_date} />
                    ) : (
                      <span className="text-[12px] text-slate-400 dark:text-slate-300">
                        {presence === 'not_in' ? 'no check-in' : '—'}
                      </span>
                    )}
                  </div>
                  <p className="text-right">
                    <span
                      className={`inline-flex min-w-[3rem] justify-center rounded-lg px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums ${
                        netSec > 0
                          ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-200/70 dark:bg-teal-950/35 dark:text-teal-100 dark:ring-teal-800/45'
                          : 'text-slate-400'
                      }`}
                    >
                      {netSec > 0 ? formatAttendanceHm(netSec) : '—'}
                    </span>
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
            })
          )}
        </div>

        {historyMember ? (
          <AttendanceMemberRecentPanel
            member={historyMember}
            rows={allAttendanceRows}
            limit={10}
            canEdit={canEditRows}
            onEditRow={onEditRow}
            onViewAll={onViewMemberHistory}
          />
        ) : null}
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
    </div>
  );
}
