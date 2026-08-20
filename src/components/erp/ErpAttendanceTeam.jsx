'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { dateStringAddDays, localDateString, syncErpAttendanceDay } from '../../lib/erp-attendance';
import {
  erpMemberTeamLabel,
  erpTeamLeadManagedTeamIds,
  erpTeamLeadManagedTeamsLabel,
} from '../../lib/erp-roles';
import { shiftPolicySubtitle } from '../../lib/erp-attendance-policy';
import { useErpTableRealtime, useRefetchOnVisible } from '../../lib/erp-realtime-sync';
import { useErpSession } from './useErpSession';
import ErpAttendanceMemberDetailSheet from './ErpAttendanceMemberDetailSheet';
import AttendanceEditTimesModal from './attendance/AttendanceEditTimesModal';
import TeamViewPageFrame from './attendance/TeamViewPageFrame';
import AttendanceTeamRoster from './attendance/AttendanceTeamRoster';
import AttendanceFortnightGrid from './attendance/AttendanceFortnightGrid';
import { AttendancePanel } from './attendance/AttendancePageFrame';
import { useErpAttendanceMembers } from './attendance/useErpAttendanceMembers';
import { useErpAttendanceLeaveMap } from './attendance/useErpAttendanceLeave';
import { useAdminAttendanceCorrections } from './attendance/useErpAttendanceCorrections';
import { useTeamMemberWorkload } from './attendance/useTeamMemberWorkload';
import TeamNeedsMePanel from './attendance/TeamNeedsMePanel';

const FORTNIGHT_DAYS = 14;

export default function ErpAttendanceTeam({ managerEmail }) {
  const { session, profile, workspaceSettingsTick } = useErpSession();
  const uid = session?.user?.id;
  const [todayStr, setTodayStr] = useState(() => localDateString());
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberDetailId, setMemberDetailId] = useState(null);
  const [memberDetailTab, setMemberDetailTab] = useState('overview');
  const [memberDetailTaskFilter, setMemberDetailTaskFilter] = useState('all');
  const [editRow, setEditRow] = useState(null);
  const [clockTick, setClockTick] = useState(0);
  const [teamFilterId, setTeamFilterId] = useState('');

  const { members: allMembers, loading: membersLoading } = useErpAttendanceMembers({
    uid,
    profile,
    scope: 'team',
    cacheKey: uid ? `attendance:team:${uid}` : null,
  });

  const managedTeamIds = useMemo(() => erpTeamLeadManagedTeamIds(profile), [profile]);

  useEffect(() => {
    if (managedTeamIds.length === 1) setTeamFilterId(managedTeamIds[0]);
    else if (managedTeamIds.length > 1 && !teamFilterId) setTeamFilterId('');
  }, [managedTeamIds, teamFilterId]);

  const members = useMemo(() => {
    if (!teamFilterId) return allMembers;
    return allMembers.filter((m) => String(m.member_team || '').trim() === teamFilterId);
  }, [allMembers, teamFilterId]);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const fromStr = useMemo(() => dateStringAddDays(todayStr, -(FORTNIGHT_DAYS - 1)), [todayStr]);
  const leaveByUser = useErpAttendanceLeaveMap(memberIds, fromStr, todayStr);
  const { byUserId: workloadByUser } = useTeamMemberWorkload(memberIds);
  const { rows: pendingCorrections, reload: reloadCorrections } = useAdminAttendanceCorrections({
    enabled: Boolean(uid),
  });

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
    if (teamFilterId) return erpMemberTeamLabel(teamFilterId);
    const fromLead = erpTeamLeadManagedTeamsLabel(profile);
    if (fromLead && fromLead !== 'My team') return fromLead;
    const teams = [...new Set(allMembers.map((m) => m.member_team?.trim()).filter(Boolean))];
    if (teams.length === 1) return erpMemberTeamLabel(teams[0]);
    if (teams.length > 1) return 'All teams';
    return 'My team';
  }, [allMembers, profile, teamFilterId]);

  const teamSelector =
    managedTeamIds.length > 1 ? (
      <label className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200/90 px-2 text-[11.5px] font-medium dark:border-teal-800/55">
        <span className="sr-only">Filter team</span>
        <select
          value={teamFilterId}
          onChange={(e) => setTeamFilterId(e.target.value)}
          className="cursor-pointer bg-transparent text-slate-700 outline-none dark:text-slate-200"
        >
          <option value="">All teams · {allMembers.length}</option>
          {managedTeamIds.map((id) => (
            <option key={id} value={id}>
              {erpMemberTeamLabel(id)} · {allMembers.filter((m) => m.member_team === id).length}
            </option>
          ))}
        </select>
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </label>
    ) : null;

  const openItems = useMemo(() => {
    let n = 0;
    for (const r of attendanceRows) {
      if (!r.check_out_at && String(r.work_date).slice(0, 10) < todayStr) n += 1;
      if (!r.check_in_at) continue;
    }
    return n;
  }, [attendanceRows, todayStr]);

  const policySubtitle = useMemo(() => shiftPolicySubtitle(), [workspaceSettingsTick]);

  function openMemberDetail(memberId, { tab = 'overview', taskFilter = 'all' } = {}) {
    setMemberDetailId(memberId);
    setMemberDetailTab(tab);
    setMemberDetailTaskFilter(taskFilter);
  }

  return (
    <TeamViewPageFrame
      memberCount={members.length}
      teamLabel={teamLabel}
      teamSelector={teamSelector}
      policySubtitle={policySubtitle}
      managerProfile={profile}
      managerEmail={managerEmail || session?.user?.email}
    >
      {membersLoading || (loading && members.length === 0) ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : members.length === 0 ? (
        <AttendancePanel>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No team members found. Ask a super admin to assign your managed teams, or add members with matching designations.
          </p>
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
                workloadByUser={workloadByUser}
                selectedMemberId={memberDetailId}
                onMemberClick={(id) => openMemberDetail(id, { tab: 'overview' })}
                onProjectsClick={(id) => openMemberDetail(id, { tab: 'projects' })}
                onTasksClick={(id) => openMemberDetail(id, { tab: 'tasks' })}
                onOverdueClick={(id) => openMemberDetail(id, { tab: 'tasks', taskFilter: 'overdue' })}
              />
            </div>
            <TeamNeedsMePanel
              pendingCorrections={pendingCorrections}
              profileById={profileById}
              memberIds={memberIds}
              todayRowsByUser={todayRowsByUser}
              todayStr={todayStr}
              openShiftCount={openItems}
              workloadByUser={workloadByUser}
              onReviewed={reloadCorrections}
              onMemberClick={(id) => openMemberDetail(id, { tab: 'overview' })}
            />
          </div>

          <AttendanceFortnightGrid
            members={members}
            rows={attendanceRows}
            todayStr={todayStr}
            nowMs={nowMs}
            leaveByUser={leaveByUser}
            onMemberClick={(id) => openMemberDetail(id, { tab: 'overview' })}
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
        workload={memberDetailId ? workloadByUser.get(memberDetailId) : null}
        initialTab={memberDetailTab}
        taskFilter={memberDetailTaskFilter}
        rangeFrom={fromStr}
        rangeTo={todayStr}
        rangeLabel={`${fromStr} to ${todayStr}`}
        onClose={() => setMemberDetailId(null)}
        canEdit
        onEditRow={(r) => setEditRow(r)}
      />
    </TeamViewPageFrame>
  );
}
