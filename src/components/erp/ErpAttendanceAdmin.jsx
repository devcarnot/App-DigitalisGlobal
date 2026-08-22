'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';
import {
  localDateString,
  dateStringAddDays,
  attendanceRowForAdminDisplay,
  syncErpAttendanceDay,
} from '../../lib/erp-attendance';
import { useErpTableRealtime, useRefetchOnVisible } from '../../lib/erp-realtime-sync';
import AttendanceViewPageFrame from './attendance/AttendanceViewPageFrame';
import AttendanceOrgToday from './attendance/AttendanceOrgToday';
import AttendanceTeamComparison from './attendance/AttendanceTeamComparison';
import AttendanceTeamRoster from './attendance/AttendanceTeamRoster';
import AttendanceCorrectionAdminQueue from './attendance/AttendanceCorrectionAdminQueue';
import { useAdminAttendanceCorrections } from './attendance/useErpAttendanceCorrections';
import { useErpAttendanceMembers } from './attendance/useErpAttendanceMembers';
import { useErpAttendanceLeaveMap } from './attendance/useErpAttendanceLeave';
import { shiftPolicySubtitle } from '../../lib/erp-attendance-policy';
import ErpAttendanceMemberDetailSheet from './ErpAttendanceMemberDetailSheet';
import AttendanceEditTimesModal from './attendance/AttendanceEditTimesModal';
import AttendanceDayNavigator from './attendance/AttendanceDayNavigator';
import { AttendanceSegmentTabs } from './attendance/AttendancePageFrame';
import { ERP_DARK_LOADING_SHELL } from '../../lib/erp-dark-surfaces';

const VIEW_HISTORY_DAYS = 90;
const ADMIN_TAB_STORAGE_KEY = 'erp-attendance-admin-tab';

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
  const [memberDetailTab, setMemberDetailTab] = useState('overview');
  const [todayStr, setTodayStr] = useState(() => localDateString());
  const [viewDateStr, setViewDateStr] = useState(() => localDateString());
  const [clockTick, setClockTick] = useState(0);

  const { members, loading } = useErpAttendanceMembers({
    uid,
    profile,
    scope: 'all',
    cacheKey: CACHE_KEY,
  });
  const [comparisonFrom, setComparisonFrom] = useState(() => dateStringAddDays(localDateString(), -13));
  const [comparisonTo, setComparisonTo] = useState(() => localDateString());
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [editRow, setEditRow] = useState(null);
  const [presenceFilter, setPresenceFilter] = useState(null);
  const [adminTab, setAdminTab] = useState(() => {
    if (typeof window === 'undefined') return 'daily';
    return window.localStorage.getItem(ADMIN_TAB_STORAGE_KEY) === 'teams' ? 'teams' : 'daily';
  });
  const presenceFilterRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_TAB_STORAGE_KEY, adminTab);
  }, [adminTab]);

  useEffect(() => {
    if (!presenceFilter) return undefined;
    function onDocMouseDown(e) {
      if (presenceFilterRef.current?.contains(e.target)) return;
      setPresenceFilter(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [presenceFilter]);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const minViewDate = useMemo(() => dateStringAddDays(todayStr, -(VIEW_HISTORY_DAYS - 1)), [todayStr]);

  const fetchFrom = useMemo(() => {
    let from = comparisonFrom;
    if (viewDateStr < from) from = viewDateStr;
    if (from < minViewDate) from = minViewDate;
    return from;
  }, [comparisonFrom, viewDateStr, minViewDate]);

  const fetchTo = todayStr;

  const leaveByUser = useErpAttendanceLeaveMap(memberIds, fetchFrom, fetchTo);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { workDate } = await syncErpAttendanceDay(supabase);
        if (workDate) {
          setTodayStr(workDate);
          setViewDateStr((prev) => (prev === todayStr || prev === localDateString() ? workDate : prev));
        }
      } catch {
        setTodayStr(localDateString());
      }
    })();
  }, []);

  const isLiveView = viewDateStr === todayStr;

  useEffect(() => {
    setPresenceFilter(null);
  }, [viewDateStr]);

  useEffect(() => {
    setComparisonTo((prev) => {
      if (!prev || prev > todayStr) return todayStr;
      return prev;
    });
    setComparisonFrom((prev) => {
      if (!prev || prev < minViewDate) return minViewDate;
      if (prev > todayStr) return dateStringAddDays(todayStr, -13);
      return prev;
    });
  }, [todayStr, minViewDate]);

  const nowMs = useMemo(() => Date.now(), [clockTick]);

  const viewRows = useMemo(
    () => attendanceRows.filter((r) => String(r.work_date).slice(0, 10) === viewDateStr),
    [attendanceRows, viewDateStr],
  );

  const viewRowsByUser = useMemo(
    () => Object.fromEntries(viewRows.map((r) => [r.user_id, r])),
    [viewRows],
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
            .gte('work_date', fetchFrom)
            .lte('work_date', fetchTo)
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
  }, [uid, profile, members, fetchFrom, fetchTo, isSuperAdmin]);

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
    () => attendanceRangeLabel(comparisonFrom, comparisonTo),
    [comparisonFrom, comparisonTo],
  );

  const handleComparisonRangeChange = useCallback(({ from, to }) => {
    setComparisonFrom(from);
    setComparisonTo(to);
  }, []);

  const openEditAttendance = useCallback((r) => {
    setEditRow(r);
  }, []);

  const policySubtitle = useMemo(() => shiftPolicySubtitle(), [workspaceSettingsTick]);

  return (
    <AttendanceViewPageFrame
      eyebrow="Administration"
      title="Attendance overview"
      subtitle={`All teams · ${members.length} members · ${policySubtitle}`}
      userProfile={profile}
      userEmail={session?.user?.email}
      userRoleLabel="Super admin"
      innerTitle="Organization"
      dense
      innerBadge={
        <div className="flex flex-wrap items-center gap-2">
          <AttendanceSegmentTabs
            value={adminTab}
            onChange={setAdminTab}
            tabs={[
              { id: 'daily', label: 'Daily attendance' },
              { id: 'teams', label: 'Team attendance' },
            ]}
          />
          <span className="inline-flex h-7 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 text-[10.5px] font-semibold text-slate-700 shadow-sm dark:border-teal-800/55 dark:bg-[#131b24] dark:text-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />
            All teams
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {members.length}
            </span>
          </span>
          {adminTab === 'daily' ? (
            <AttendanceDayNavigator
              value={viewDateStr}
              todayStr={todayStr}
              minDate={minViewDate}
              onChange={setViewDateStr}
            />
          ) : null}
        </div>
      }
    >
      {loading && members.length === 0 ? (
        <div className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-200/40 bg-gradient-to-b from-white to-cyan-50/30 py-20 shadow-inner ${ERP_DARK_LOADING_SHELL}`}>
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 shadow-md dark:border-teal-800 dark:border-r-teal-400 dark:border-t-cyan-300" />
          <p className="text-sm font-medium text-teal-800/70 dark:text-teal-200">Loading team…</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col" style={{ height: 'calc(100dvh - 11.5rem)' }}>
          {adminTab === 'daily' ? (
            <div ref={presenceFilterRef} className="flex min-h-0 flex-1 flex-col gap-2">
              <AttendanceOrgToday
                compact
                backlogCount={openBacklogCount}
                members={members}
                dayRows={viewRows}
                viewDateStr={viewDateStr}
                todayStr={todayStr}
                leaveByUser={leaveByUser}
                isLiveView={isLiveView}
                presenceFilter={presenceFilter}
                onPresenceFilterChange={setPresenceFilter}
              />

              <AttendanceCorrectionAdminQueue
                compact
                pending={pendingCorrections}
                profileById={profileById}
                canReview={canEditAttendance}
                onReviewed={() => {
                  void reloadCorrections();
                  void fetchAttendance();
                }}
              />

              <AttendanceTeamRoster
                compact
                fillHeight
                hideMemberHistory
                members={members}
                todayRowsByUser={viewRowsByUser}
                todayStr={viewDateStr}
                liveTodayStr={todayStr}
                nowMs={nowMs}
                leaveByUser={leaveByUser}
                isLiveView={isLiveView}
                allAttendanceRows={adminAttendanceRows}
                selectedMemberId={memberDetailId}
                canEditRows={canEditAttendance}
                presenceFilter={presenceFilter}
                onPresenceFilterChange={setPresenceFilter}
                onEditRow={canEditAttendance ? openEditAttendance : undefined}
                onViewMemberHistory={(id) => {
                  setMemberDetailId(id);
                  setMemberDetailTab('history');
                }}
                onMemberClick={(id) => {
                  setMemberDetailId(id);
                  setMemberDetailTab('overview');
                }}
              />
            </div>
          ) : (
            <AttendanceTeamComparison
              compact
              fillHeight
              members={members}
              attendanceRows={adminAttendanceRows}
              fromStr={comparisonFrom}
              toStr={comparisonTo}
              todayStr={todayStr}
              minDate={minViewDate}
              nowMs={nowMs}
              leaveByUser={leaveByUser}
              onRangeChange={handleComparisonRangeChange}
            />
          )}
        </div>
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
        rangeFrom={comparisonFrom}
        rangeTo={comparisonTo}
        rangeLabel={rangeLabel}
        initialTab={memberDetailTab}
        onClose={() => {
          setMemberDetailId(null);
          setMemberDetailTab('overview');
        }}
        canEdit={canEditAttendance}
        onEditRow={canEditAttendance ? openEditAttendance : undefined}
      />
    </AttendanceViewPageFrame>
  );
}
