'use client';

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

function formatTimeCompact(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function ArrivalBadge({ checkInIso }) {
  const band = classifyAttendanceArrival(checkInIso);
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

/**
 * Live roster table for team / admin "who is in".
 */
export default function AttendanceTeamRoster({
  members,
  todayRowsByUser,
  todayStr,
  nowMs,
  leaveByUser,
  onMemberClick,
  compact = false,
}) {
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

    return { member, row, presence, presenceMeta, netSec, breakSec };
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
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[26px_minmax(0,1.3fr)_128px_104px_92px_76px_72px] items-center gap-3 border-b border-slate-100 py-2 dark:border-teal-900/35">
            <div />
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Member</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Status</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Arrival</p>
            <p className="text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Net now</p>
            <p className="text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500">Break</p>
            <div />
          </div>
          {roster.map(({ member, row, presence, presenceMeta, netSec, breakSec }) => (
            <div
              key={member.id}
              className="grid grid-cols-[26px_minmax(0,1.3fr)_128px_104px_92px_76px_72px] items-center gap-3 border-b border-slate-50 py-2.5 last:border-0 dark:border-teal-900/20"
            >
              <ErpUserAvatar profile={member} size="sm" alt={member.full_name || 'Member'} />
              <button
                type="button"
                onClick={() => onMemberClick?.(member.id)}
                className="truncate text-left text-[12.5px] font-medium hover:text-[#103D4D] dark:hover:text-teal-200"
              >
                {member.full_name?.trim() || 'Member'}
              </button>
              <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${presenceMeta.tone}`}>
                <span className={`h-2 w-2 rounded-full ${presenceMeta.dot}`} />
                {presenceMeta.label}
                {row?.check_in_at && presence !== 'leave' ? ` · ${formatTimeCompact(row.check_in_at)}` : ''}
              </span>
              <div>
                {row?.check_in_at && presence !== 'leave' ? (
                  <ArrivalBadge checkInIso={row.check_in_at} />
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
                {onMemberClick ? (
                  <button
                    type="button"
                    onClick={() => onMemberClick(member.id)}
                    className="text-[13px] font-semibold text-slate-300 hover:text-[#103D4D] dark:hover:text-teal-200"
                    aria-label={`View ${member.full_name}`}
                  >
                    ⋯
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AttendancePanel>
  );
}
