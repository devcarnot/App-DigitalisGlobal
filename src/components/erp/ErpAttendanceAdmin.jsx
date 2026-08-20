'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';
import {
  localDateString,
  attendanceRowForAdminDisplay,
  syncErpAttendanceDay,
} from '../../lib/erp-attendance';
import { useErpTableRealtime, useRefetchOnVisible } from '../../lib/erp-realtime-sync';
import AttendancePageFrame from './attendance/AttendancePageFrame';
import AttendanceOrgToday, { AttendanceBacklogPanel } from './attendance/AttendanceOrgToday';
import AttendanceTeamComparison from './attendance/AttendanceTeamComparison';
import AttendanceTeamRoster from './attendance/AttendanceTeamRoster';
import AttendanceCorrectionAdminQueue from './attendance/AttendanceCorrectionAdminQueue';
import { useAdminAttendanceCorrections } from './attendance/useErpAttendanceCorrections';
import { useErpAttendanceMembers } from './attendance/useErpAttendanceMembers';
import { useErpAttendanceLeaveMap } from './attendance/useErpAttendanceLeave';
import { shiftPolicySubtitle } from '../../lib/erp-attendance-policy';
import ErpAttendanceMemberDetailSheet from './ErpAttendanceMemberDetailSheet';
import AttendanceEditTimesModal from './attendance/AttendanceEditTimesModal';
import { ERP_DARK_LOADING_SHELL } from '../../lib/erp-dark-surfaces';

function shortDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function attendanceRangeLabel(from, to) {
  return `${shortDateLabel(from)} to ${shortDateLabel(to)}`;
}

export default function ErpAttendanceAdmin() {
  const { session, profile, erpCan, workspaceSettingsTick } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `attendance:admin:${uid}` : null;
  const canEditAttendance = erpCan('attendance_admin', 'edit') || isErpManagerRole(profile?.role);
  const isSuperAdmin = isErpGlobalAdmin(profile?.role);
  const { rows: pendingCorrections, reload: reloadCorrections } = useAdminAttendanceCorrections({
    enabled: canEditAttendance,
  });

  const [memberDetailId, setMemberDetailId] = useState(null);
  const [todayStr, setTodayStr] = useState(() => localDateString());
  const [clockTick, setClockTick] = useState(0);

  const { members, loading } = useErpAttendanceMembers({
    uid,
    profile,
    scope: 'all',
    cacheKey: CACHE_KEY,
  });
  const [attendanceFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return localDateString(d);
  });
  const [attendanceTo] = useState(() => localDateString(new Date()));
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [editRow, setEditRow] = useState(null);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const leaveByUser = useErpAttendanceLeaveMap(memberIds, attendanceFrom, attendanceTo);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { workDate } = await syncErpAttendanceDay(supabase);
        if (workDate) setTodayStr(workDate);
      } catch {
        setTodayStr(localDateString());
      }
    })();
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

  const openBacklogCount = useMemo(() => {
    let n = 0;
    for (const r of attendanceRows) {
      const wd = String(r.work_date).slice(0, 10);
      if (r.check_in_at && !r.check_out_at && wd < todayStr) n += 1;
    }
    return n;
  }, [attendanceRows, todayStr]);

  const fetchAttendance = useCallback(async () => {
    if (!uid || !profile) {
      setAttendanceRows([]);
      return;
    }
    const ids = members.map((m) => m.id).filter(Boolean);
    if (ids.length === 0) {
      setAttendanceRows([]);
      return;
    }
    try {
      if (isSuperAdmin) {
        try {
          await supabase.rpc('erp_attendance_admin_fix_implausible_checkouts_pk');
        } catch {
          /* migration may not be applied yet */
        }
      }
      const CHUNK = 80;
      const slices = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        slices.push(ids.slice(i, i + CHUNK));
      }
      const chunkResults = await Promise.all(
        slices.map((slice) =>
          supabase
            .from('erp_attendance_days')
            .select('id, user_id, work_date, check_in_at, check_out_at, break_seconds_total, break_started_at, break_type')
            .gte('work_date', attendanceFrom)
            .lte('work_date', attendanceTo)
            .in('user_id', slice)
            .order('work_date', { ascending: false }),
        ),
      );
      const all = [];
      for (const { data, error: aErr } of chunkResults) {
        if (aErr) throw new Error(aErr.message);
        all.push(...(data || []));
      }
      all.sort((a, b) => {
        const wd = String(b.work_date).localeCompare(String(a.work_date));
        if (wd !== 0) return wd;
        return String(b.check_in_at || '').localeCompare(String(a.check_in_at || ''));
      });
      setAttendanceRows(all);
    } catch {
      setAttendanceRows([]);
    }
  }, [uid, profile, members, attendanceFrom, attendanceTo, isSuperAdmin]);

  const adminAttendanceRows = useMemo(() => {
    if (!isSuperAdmin) return attendanceRows;
    return attendanceRows.map(attendanceRowForAdminDisplay);
  }, [attendanceRows, isSuperAdmin]);

  useEffect(() => {
    void fetchAttendance();
  }, [fetchAttendance]);

  useErpTableRealtime({
    enabled: Boolean(uid) && members.length > 0,
    channelName: `erp-attendance-admin-${uid}`,
    table: 'erp_attendance_days',
    onChange: fetchAttendance,
  });
  useRefetchOnVisible(fetchAttendance, Boolean(uid));

  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || 'Member'])), [members]);
  const profileById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const rangeLabel = useMemo(
    () => attendanceRangeLabel(attendanceFrom, attendanceTo),
    [attendanceFrom, attendanceTo],
  );

  const openEditAttendance = useCallback((r) => {
    setEditRow(r);
  }, []);

  const policySubtitle = useMemo(() => shiftPolicySubtitle(), [workspaceSettingsTick]);

  return (
    <AttendancePageFrame
      title="Attendance administration"
      subtitle={`All Teams · ${members.length} members · ${policySubtitle}`}
      meta="Super admin"
    >
      {loading && members.length === 0 ? (
        <div className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-200/40 bg-gradient-to-b from-white to-cyan-50/30 py-20 shadow-inner ${ERP_DARK_LOADING_SHELL}`}>
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 shadow-md dark:border-teal-800 dark:border-r-teal-400 dark:border-t-cyan-300" />
          <p className="text-sm font-medium text-teal-800/70 dark:text-teal-200">Loading team…</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3.5 lg:flex-row lg:items-stretch">
            <AttendanceOrgToday
              members={members}
              todayRows={todayRows}
              todayStr={todayStr}
              leaveByUser={leaveByUser}
            />
            <AttendanceBacklogPanel openItems={openBacklogCount} />
          </div>

          <AttendanceCorrectionAdminQueue
            pending={pendingCorrections}
            profileById={profileById}
            canReview={canEditAttendance}
            onReviewed={() => {
              void reloadCorrections();
              void fetchAttendance();
            }}
          />

          <AttendanceTeamComparison
            members={members}
            attendanceRows={adminAttendanceRows}
            fromStr={attendanceFrom}
            toStr={attendanceTo}
            todayStr={todayStr}
            nowMs={nowMs}
            leaveByUser={leaveByUser}
          />

          <AttendanceTeamRoster
            members={members}
            todayRowsByUser={todayRowsByUser}
            todayStr={todayStr}
            nowMs={nowMs}
            leaveByUser={leaveByUser}
            onMemberClick={setMemberDetailId}
          />
        </>
      )}

      <AttendanceEditTimesModal
        row={editRow}
        memberName={editRow ? nameById[editRow.user_id] || 'Member' : 'Member'}
        onClose={() => setEditRow(null)}
        onSaved={() => void fetchAttendance()}
      />

      <ErpAttendanceMemberDetailSheet
        open={Boolean(memberDetailId)}
        member={memberDetailId ? profileById[memberDetailId] : null}
        rows={adminAttendanceRows}
        rangeFrom={attendanceFrom}
        rangeTo={attendanceTo}
        rangeLabel={rangeLabel}
        onClose={() => setMemberDetailId(null)}
        canEdit={canEditAttendance}
        onEditRow={canEditAttendance ? openEditAttendance : undefined}
      />
    </AttendancePageFrame>
  );
}
