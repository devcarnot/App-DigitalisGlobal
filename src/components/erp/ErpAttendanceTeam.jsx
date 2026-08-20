'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { dateStringAddDays, localDateString, syncErpAttendanceDay } from '../../lib/erp-attendance';
import { erpMemberTeamLabel } from '../../lib/erp-roles';
import { shiftPolicySubtitle } from '../../lib/erp-attendance-policy';
import { useErpTableRealtime, useRefetchOnVisible } from '../../lib/erp-realtime-sync';
import { useErpSession } from './useErpSession';
import ErpAttendanceMemberDetailSheet from './ErpAttendanceMemberDetailSheet';
import AttendanceEditTimesModal from './attendance/AttendanceEditTimesModal';
import AttendancePageFrame from './attendance/AttendancePageFrame';
import AttendanceTeamRoster from './attendance/AttendanceTeamRoster';
import AttendanceFortnightGrid from './attendance/AttendanceFortnightGrid';
import { AttendancePanel } from './attendance/AttendancePageFrame';
import { useErpAttendanceMembers } from './attendance/useErpAttendanceMembers';
import { useErpAttendanceLeaveMap } from './attendance/useErpAttendanceLeave';

const FORTNIGHT_DAYS = 14;

export default function ErpAttendanceTeam() {
  const { session, profile, workspaceSettingsTick } = useErpSession();
  const uid = session?.user?.id;
  const [todayStr, setTodayStr] = useState(() => localDateString());
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberDetailId, setMemberDetailId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [clockTick, setClockTick] = useState(0);

  const { members, loading: membersLoading } = useErpAttendanceMembers({
    uid,
    profile,
    scope: 'team',
    cacheKey: uid ? `attendance:team:${uid}` : null,
  });

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const fromStr = useMemo(() => dateStringAddDays(todayStr, -(FORTNIGHT_DAYS - 1)), [todayStr]);
  const leaveByUser = useErpAttendanceLeaveMap(memberIds, fromStr, todayStr);

  const refreshToday = useCallback(async () => {
    try {
      const { workDate } = await syncErpAttendanceDay(supabase);
      if (workDate) setTodayStr(workDate);
    } catch {
      setTodayStr(localDateString());
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!uid || memberIds.length === 0) {
      setAttendanceRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await refreshToday();
      const CHUNK = 80;
      const slices = [];
      for (let i = 0; i < memberIds.length; i += CHUNK) slices.push(memberIds.slice(i, i + CHUNK));
      const results = await Promise.all(
        slices.map((slice) =>
          supabase
            .from('erp_attendance_days')
            .select(
              'id, user_id, work_date, check_in_at, check_out_at, break_started_at, break_seconds_total, break_type',
            )
            .gte('work_date', fromStr)
            .lte('work_date', todayStr)
            .in('user_id', slice),
        ),
      );
      const all = [];
      for (const { data, error } of results) {
        if (error) throw error;
        all.push(...(data || []));
      }
      setAttendanceRows(all);
    } catch {
      setAttendanceRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid, memberIds, fromStr, todayStr, refreshToday]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useErpTableRealtime({
    enabled: Boolean(uid) && memberIds.length > 0,
    channelName: `erp-attendance-team-${uid}`,
    table: 'erp_attendance_days',
    onChange: loadAttendance,
  });
  useRefetchOnVisible(loadAttendance, Boolean(uid));

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const nowMs = useMemo(() => Date.now(), [clockTick]);

  const todayRows = useMemo(
    () => attendanceRows.filter((r) => String(r.work_date).slice(0, 10) === todayStr),
    [attendanceRows, todayStr],
  );

  const todayRowsByUser = useMemo(
    () => Object.fromEntries(todayRows.map((r) => [r.user_id, r])),
    [todayRows],
  );

  const profileById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const teamLabel = useMemo(() => {
    const teams = [...new Set(members.map((m) => m.member_team?.trim()).filter(Boolean))];
    if (teams.length === 1) return erpMemberTeamLabel(teams[0]);
    if (teams.length > 1) return 'My projects';
    return 'My team';
  }, [members]);

  const openItems = useMemo(() => {
    let n = 0;
    for (const r of attendanceRows) {
      if (!r.check_out_at && String(r.work_date).slice(0, 10) < todayStr) n += 1;
      if (!r.check_in_at) continue;
    }
    return n;
  }, [attendanceRows, todayStr]);

  const policySubtitle = useMemo(() => shiftPolicySubtitle(), [workspaceSettingsTick]);

  return (
    <AttendancePageFrame
      title="My team"
      subtitle={`${teamLabel} · ${members.length} member${members.length === 1 ? '' : 's'} · ${policySubtitle}`}
      meta="Manager view"
    >
      {membersLoading || (loading && members.length === 0) ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : members.length === 0 ? (
        <AttendancePanel>
          <p className="text-sm text-slate-600">No team members found on your shared projects.</p>
        </AttendancePanel>
      ) : (
        <div className="space-y-3.5">
          <div className="flex flex-col gap-3.5 lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1">
              <AttendanceTeamRoster
                members={members}
                todayRowsByUser={todayRowsByUser}
                todayStr={todayStr}
                nowMs={nowMs}
                leaveByUser={leaveByUser}
                onMemberClick={setMemberDetailId}
              />
            </div>
            <AttendancePanel className="w-full lg:w-[296px] lg:flex-none">
              <p className="text-[13px] font-semibold">Needs me</p>
              <div className="mt-3 space-y-2">
                {openItems > 0 ? (
                  <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-teal-900/45">
                    <p className="text-[12px] font-semibold">{openItems} open shift{openItems === 1 ? '' : 's'}</p>
                    <p className="mt-1 text-[11.5px] text-slate-500">Missing check-out on past days in this fortnight.</p>
                  </div>
                ) : (
                  <p className="text-[11.5px] text-slate-500">No urgent items in the current fortnight window.</p>
                )}
              </div>
              <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] text-slate-500 dark:border-teal-900/35">
                Correction requests and disputes will appear here when that workflow is enabled.
              </p>
            </AttendancePanel>
          </div>

          <AttendanceFortnightGrid
            members={members}
            rows={attendanceRows}
            todayStr={todayStr}
            nowMs={nowMs}
            leaveByUser={leaveByUser}
            onMemberClick={setMemberDetailId}
          />
        </div>
      )}

      <AttendanceEditTimesModal
        row={editRow}
        memberName={editRow ? profileById[editRow.user_id]?.full_name?.trim() || 'Member' : 'Member'}
        onClose={() => setEditRow(null)}
        onSaved={() => void loadAttendance()}
      />

      <ErpAttendanceMemberDetailSheet
        open={Boolean(memberDetailId)}
        member={memberDetailId ? profileById[memberDetailId] : null}
        rows={attendanceRows.filter((r) => r.user_id === memberDetailId)}
        rangeFrom={fromStr}
        rangeTo={todayStr}
        rangeLabel={`${fromStr} to ${todayStr}`}
        onClose={() => setMemberDetailId(null)}
        canEdit
        onEditRow={(r) => setEditRow(r)}
      />
    </AttendancePageFrame>
  );
}
