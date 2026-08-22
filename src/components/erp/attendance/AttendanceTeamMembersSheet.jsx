'use client';

import { useEffect, useMemo } from 'react';
import { classifyAttendanceDayOutcome } from '../../../lib/erp-attendance-policy';
import { erpMemberTeamLabel } from '../../../lib/erp-roles';
import ErpUserAvatar from '../ErpUserAvatar';
import AttendanceMemberHistoryTable from './AttendanceMemberHistoryTable';

function memberTeamKey(member) {
  return member?.member_team?.trim() || 'Unassigned';
}

function memberPeriodSummary(memberId, attendanceRows, fromStr, toStr, todayStr, nowMs, leaveByUser) {
  let full = 0;
  let short = 0;
  let absent = 0;
  for (const row of attendanceRows || []) {
    if (row.user_id !== memberId) continue;
    const wd = String(row.work_date || '').slice(0, 10);
    if (wd < fromStr || wd > toStr) continue;
    const leaveDates = leaveByUser?.get?.(memberId);
    const outcome = classifyAttendanceDayOutcome(row, todayStr, nowMs, {
      uid: memberId,
      approvedLeaveDates: leaveDates,
    });
    if (outcome === 'full') full += 1;
    if (outcome === 'short' || outcome === 'half') short += 1;
    if (outcome === 'absent') absent += 1;
  }
  return { full, short, absent };
}

function SummaryChip({ label, value, tone = 'neutral' }) {
  if (!value) return null;
  const tones = {
    good: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200/70 dark:bg-teal-950/35 dark:text-teal-100',
    warn: 'bg-orange-50 text-orange-800 ring-1 ring-orange-200/70 dark:bg-orange-950/35 dark:text-orange-100',
    alert: 'bg-red-50 text-red-700 ring-1 ring-red-200/70 dark:bg-red-950/35 dark:text-red-100',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px font-mono text-[9px] font-semibold tabular-nums ${tones[tone] || tones.neutral}`}
    >
      <span className="opacity-70">{label}</span>
      {value}
    </span>
  );
}

function formatRangeLabel(fromStr, toStr) {
  const fmt = (s) => {
    const [y, m, d] = String(s || '').slice(0, 10).split('-');
    if (!y || !m || !d) return s;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(m) - 1] || m} ${Number(d)}, ${y}`;
  };
  return `${fmt(fromStr)} to ${fmt(toStr)}`;
}

export default function AttendanceTeamMembersSheet({
  open,
  teamKey,
  members = [],
  attendanceRows = [],
  fromStr,
  toStr,
  todayStr,
  nowMs,
  leaveByUser,
  expandedMemberId,
  onToggleMember,
  onClose,
  accentClass = 'from-[#103D4D] to-teal-600',
}) {
  const teamMembers = useMemo(
    () =>
      [...(members || [])]
        .filter((m) => memberTeamKey(m) === teamKey)
        .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''))),
    [members, teamKey],
  );

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !teamKey) return null;

  const teamLabel = erpMemberTeamLabel(teamKey) || teamKey;
  const rangeLabel = formatRangeLabel(fromStr, toStr);

  return (
    <div
      className="fixed inset-0 z-[500] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-team-sheet-title"
    >
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close panel" />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-teal-900/50 dark:bg-[#0a1018]">
        <div className="relative shrink-0 overflow-hidden border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-white px-4 py-4 dark:border-teal-900/45 dark:from-[#0d141c] dark:to-[#0a1018] dark:[background-image:none]">
          <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${accentClass}`} aria-hidden />
          <div className="flex items-start justify-between gap-3 pl-1">
            <div className="min-w-0">
              <h2 id="attendance-team-sheet-title" className="truncate text-lg font-bold text-slate-900 dark:text-white">
                {teamLabel}
              </h2>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                {teamMembers.length} member{teamMembers.length === 1 ? '' : 's'} · {rangeLabel}
              </p>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Tap a member to expand last 10 days</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
          {teamMembers.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12px] text-slate-500">No members in this team.</p>
          ) : (
            <div className="space-y-1.5">
              {teamMembers.map((member) => {
                const expanded = expandedMemberId === member.id;
                const summary = memberPeriodSummary(
                  member.id,
                  attendanceRows,
                  fromStr,
                  toStr,
                  todayStr,
                  nowMs,
                  leaveByUser,
                );
                return (
                  <div
                    key={member.id}
                    className={`overflow-hidden rounded-xl border transition ${
                      expanded
                        ? 'border-teal-300/80 bg-teal-50/30 shadow-sm dark:border-teal-700/50 dark:bg-teal-950/20'
                        : 'border-slate-100/90 bg-white dark:border-teal-900/35 dark:bg-[#0a1018]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleMember?.(member.id)}
                      aria-expanded={expanded}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50/80 dark:hover:bg-teal-950/15"
                    >
                      <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                          {member.full_name?.trim() || 'Member'}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <SummaryChip label="full" value={summary.full} tone="good" />
                          <SummaryChip label="short" value={summary.short} tone="warn" />
                          <SummaryChip label="abs" value={summary.absent} tone="alert" />
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </button>
                    {expanded ? (
                      <div className="border-t border-teal-200/50 bg-white/80 px-2 py-2.5 dark:border-teal-900/35 dark:bg-[#080d12]/80">
                        <p className="mb-1.5 px-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Last 10 days
                        </p>
                        <AttendanceMemberHistoryTable member={member} rows={attendanceRows} limit={10} compact />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
