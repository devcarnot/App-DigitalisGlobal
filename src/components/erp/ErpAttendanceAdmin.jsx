'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';
import {
  canUndoAttendanceCheckout,
  datetimeLocalValueToIsoUtc,
  formatAttendanceDateTime,
  formatWorkDate,
  isoToDatetimeLocalValue,
  localDateString,
} from '../../lib/erp-attendance';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpNativeSelect, { ERP_FILTER_SELECT_CLASS } from './ErpNativeSelect';
import ErpDateInput, { ErpDateTimeInput } from './ErpDateInput';
import ErpUserAvatar from './ErpUserAvatar';
import {
  broadcastErpAttendanceChange,
  useErpTableRealtime,
  useRefetchOnVisible,
} from '../../lib/erp-realtime-sync';
import ErpAdminPageHero from './ErpAdminPageHero';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';
import ErpAttendanceMember from './ErpAttendanceMember';
import ErpExportCsvButton from './ErpExportCsvButton';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';
import {
  ERP_DARK_LOADING_SHELL,
  ERP_DARK_PILL_PRIMARY,
  ERP_DARK_SECTION_MAIN_PANEL,
  ERP_DARK_TABLE_FOOTER_BAR,
  ERP_DARK_TABLE_HEAD_ROW,
  ERP_DARK_TABLE_HEADER_BAR,
  ERP_DARK_TABLE_SCROLL_AREA,
} from '../../lib/erp-dark-surfaces';

const INTERNAL_ROLES = ['admin', 'team_lead', 'team_member'];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function IconSearch({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

function AllMembersIcon() {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/25 to-cyan-600/30 text-teal-700 ring-2 ring-white dark:from-teal-900/50 dark:to-cyan-950/60 dark:text-teal-200 dark:ring-slate-700/90"
      aria-hidden
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path strokeLinecap="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    </span>
  );
}

function memberSelectLeading(profileById, { value }) {
  if (!value) return <AllMembersIcon />;
  const profile = profileById[value];
  if (!profile) return <AllMembersIcon />;
  return <ErpUserAvatar profile={profile} size="sm" alt={profile.full_name?.trim() || 'Member'} />;
}

function durationMsBetween(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return 0;
  const a = new Date(checkInIso).getTime();
  const b = new Date(checkOutIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return b - a;
}

function formatHmFromMs(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${m}m`;
}

function formatHmFromSeconds(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${m}m`;
}

function formatHoursTotal(ms) {
  if (!ms || ms <= 0) return '0h';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function shortDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function attendanceRangeLabel(from, to) {
  return `${shortDateLabel(from)} – ${shortDateLabel(to)}`;
}

function setDateRangeDays(setFrom, setTo, dayCount) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (Math.max(1, dayCount) - 1));
  setFrom(localDateString(from));
  setTo(localDateString(to));
}

const ATTENDANCE_DATE_FIELD_CLASS = 'w-full min-w-[11rem] sm:max-w-[12rem]';

export default function ErpAttendanceAdmin() {
  const { session, profile, erpCan } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `attendance:admin:${uid}` : null;
  const canEditAttendance = erpCan('attendance_admin', 'edit') || isErpManagerRole(profile?.role);
  const canCreateAttendance = erpCan('attendance_admin', 'create') || isErpManagerRole(profile?.role);
  const scopeHint = isErpGlobalAdmin(profile?.role)
    ? 'Whole workspace'
    : isErpManagerRole(profile?.role)
      ? 'Your project team'
      : 'Team';

  const [members, setMembers] = useState(() => pickErpCache(CACHE_KEY, (c) => c.members ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  /** '' = all members; otherwise filter log + analytics to one person. */
  const [memberFilterId, setMemberFilterId] = useState('');
  const [attendanceFrom, setAttendanceFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return localDateString(d);
  });
  const [attendanceTo, setAttendanceTo] = useState(() => localDateString(new Date()));
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editRow, setEditRow] = useState(null);
  const [editCheckInLocal, setEditCheckInLocal] = useState('');
  const [editCheckOutLocal, setEditCheckOutLocal] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addWorkDate, setAddWorkDate] = useState(() => localDateString(new Date()));
  const [addCheckInLocal, setAddCheckInLocal] = useState('');
  const [addCheckOutLocal, setAddCheckOutLocal] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [undoBusyId, setUndoBusyId] = useState(null);
  const [undoConfirmId, setUndoConfirmId] = useState(null);

  const loadMembers = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setLoading(false);
      return;
    }
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setMembers(Array.isArray(cached?.members) ? cached.members : []);
    }, setLoading);
    setError('');
    try {
      let profileRows = [];
      if (isErpGlobalAdmin(profile.role)) {
        const { data, error: pErr } = await supabase
          .from('erp_profiles')
          .select('id, full_name, role, avatar_path')
          .in('role', INTERNAL_ROLES)
          .order('full_name', { ascending: true });
        if (pErr) throw new Error(pErr.message);
        profileRows = data || [];
      } else {
        const { data: myM, error: mErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', uid);
        if (mErr) throw new Error(mErr.message);
        const pids = [...new Set((myM || []).map((r) => r.project_id).filter(Boolean))];
        if (pids.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }
        const { data: peers, error: p2Err } = await supabase
          .from('erp_project_members')
          .select('user_id')
          .in('project_id', pids);
        if (p2Err) throw new Error(p2Err.message);
        const uids = [...new Set((peers || []).map((r) => r.user_id).filter(Boolean))];
        if (uids.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }
        const { data, error: pErr } = await supabase
          .from('erp_profiles')
          .select('id, full_name, role, avatar_path')
          .in('id', uids)
          .in('role', INTERNAL_ROLES)
          .order('full_name', { ascending: true });
        if (pErr) throw new Error(pErr.message);
        profileRows = data || [];
      }
      writeErpDataCache(CACHE_KEY, { members: profileRows });
      setMembers(profileRows);
    } catch (e) {
      setError(e?.message || 'Could not load team');
      if (!hasErpDataCache(CACHE_KEY)) setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, uid, profile]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

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
    setAttendanceLoading(true);
    try {
      const CHUNK = 80;
      const slices = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        slices.push(ids.slice(i, i + CHUNK));
      }
      const chunkResults = await Promise.all(
        slices.map((slice) =>
          supabase
            .from('erp_attendance_days')
            .select('id, user_id, work_date, check_in_at, check_out_at, break_seconds_total')
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
    } finally {
      setAttendanceLoading(false);
    }
  }, [uid, profile, members, attendanceFrom, attendanceTo]);

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

  const attendanceByFilters = useMemo(() => {
    let list = attendanceRows;
    if (memberFilterId) list = list.filter((r) => r.user_id === memberFilterId);
    return list;
  }, [attendanceRows, memberFilterId]);

  const attendanceFiltered = useMemo(
    () =>
      filterListBySearch(attendanceByFilters, memberSearch, (r) => [
        nameById[r.user_id],
        String(r.work_date || ''),
        String(r.check_in_at || ''),
        String(r.check_out_at || ''),
      ]),
    [attendanceByFilters, memberSearch, nameById],
  );

  const filteredMemberLabel = memberFilterId ? nameById[memberFilterId] || 'Member' : null;

  useEffect(() => {
    setPage(1);
  }, [memberSearch, memberFilterId, attendanceFrom, attendanceTo, pageSize, attendanceRows.length]);

  const totalRows = attendanceFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = totalRows === 0 ? 0 : (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, totalRows);
  const attendancePage = useMemo(
    () => attendanceFiltered.slice(pageStart, pageEnd),
    [attendanceFiltered, pageStart, pageEnd],
  );

  const stats = useMemo(() => {
    const uniqueMembers = new Set();
    let missingOut = 0;
    let completed = 0;
    let totalMs = 0;
    for (const r of attendanceFiltered) {
      if (r.user_id) uniqueMembers.add(r.user_id);
      if (!r.check_out_at) missingOut += 1;
      else {
        completed += 1;
        const grossMs = durationMsBetween(r.check_in_at, r.check_out_at);
        const breakMs = Math.max(0, (Number(r.break_seconds_total) || 0) * 1000);
        const netMs = Math.max(0, grossMs - breakMs);
        totalMs += netMs;
      }
    }
    return {
      rows: attendanceFiltered.length,
      members: uniqueMembers.size,
      missingOut,
      completed,
      totalHours: formatHoursTotal(totalMs),
      avgHours: completed > 0 ? formatHoursTotal(Math.round(totalMs / completed)) : '—',
    };
  }, [attendanceFiltered]);

  const attendanceExportColumns = useMemo(
    () => [
      { header: 'Member', value: (r) => nameById[r.user_id] || 'Member' },
      { header: 'Work date', value: (r) => formatWorkDate(r.work_date) },
      { header: 'Check-in', value: (r) => formatAttendanceDateTime(r.check_in_at) },
      {
        header: 'Check-out',
        value: (r) => (r.check_out_at ? formatAttendanceDateTime(r.check_out_at) : ''),
      },
      {
        header: 'Working (net)',
        value: (r) => {
          if (!r.check_in_at || !r.check_out_at) return '';
          const grossMs = durationMsBetween(r.check_in_at, r.check_out_at);
          const breakMs = Math.max(0, (Number(r.break_seconds_total) || 0) * 1000);
          const netMs = Math.max(0, grossMs - breakMs);
          return formatHmFromMs(netMs);
        },
      },
      {
        header: 'Breaks',
        value: (r) =>
          Number(r.break_seconds_total) > 0 ? formatHmFromSeconds(Number(r.break_seconds_total)) : '',
      },
    ],
    [nameById],
  );

  useEffect(() => {
    if (!addOpen || members.length === 0) return;
    setAddUserId((prev) => prev || members[0].id);
  }, [addOpen, members]);

  const openEditAttendance = useCallback((r) => {
    setEditRow(r);
    setEditCheckInLocal(isoToDatetimeLocalValue(r.check_in_at));
    setEditCheckOutLocal(r.check_out_at ? isoToDatetimeLocalValue(r.check_out_at) : '');
    setEditError('');
  }, []);

  const saveEditAttendance = useCallback(async () => {
    if (!editRow?.id) return;
    const inIso = datetimeLocalValueToIsoUtc(editCheckInLocal);
    if (!inIso) {
      setEditError('Check-in date and time are required.');
      return;
    }
    const outIso = editCheckOutLocal.trim() ? datetimeLocalValueToIsoUtc(editCheckOutLocal) : null;
    setEditBusy(true);
    setEditError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_admin_set_times', {
        p_id: editRow.id,
        p_check_in_at: inIso,
        p_check_out_at: outIso,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setEditRow(null);
      await fetchAttendance();
      broadcastErpAttendanceChange(editRow.user_id);
    } catch (e) {
      setEditError(e?.message || 'Could not save changes');
    } finally {
      setEditBusy(false);
    }
  }, [editRow, editCheckInLocal, editCheckOutLocal, fetchAttendance]);

  const toggleAddAttendance = useCallback(() => {
    setAddOpen((v) => {
      const next = !v;
      if (next) {
        const wd = localDateString(new Date());
        setAddWorkDate(wd);
        setAddCheckInLocal(`${wd}T09:00`);
        setAddCheckOutLocal('');
        setAddError('');
      }
      return next;
    });
  }, []);

  const saveAddAttendance = useCallback(async () => {
    if (!addUserId || !addWorkDate) {
      setAddError('Choose a member and work date.');
      return;
    }
    const inIso = datetimeLocalValueToIsoUtc(addCheckInLocal);
    if (!inIso) {
      setAddError('Check-in date and time are required.');
      return;
    }
    const outIso = addCheckOutLocal.trim() ? datetimeLocalValueToIsoUtc(addCheckOutLocal) : null;
    setAddBusy(true);
    setAddError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_admin_upsert_day', {
        p_user_id: addUserId,
        p_work_date: addWorkDate,
        p_check_in_at: inIso,
        p_check_out_at: outIso,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setAddOpen(false);
      await fetchAttendance();
      broadcastErpAttendanceChange(addUserId);
    } catch (e) {
      setAddError(e?.message || 'Could not save');
    } finally {
      setAddBusy(false);
    }
  }, [addUserId, addWorkDate, addCheckInLocal, addCheckOutLocal, fetchAttendance]);

  const undoCheckout = useCallback(
    async (row) => {
      if (!row?.id || !canEditAttendance) return;
      if (!canUndoAttendanceCheckout(row.check_out_at)) {
        setError('Undo checkout is only available within 2 hours of check-out.');
        return;
      }
      if (undoConfirmId !== row.id) {
        setUndoConfirmId(row.id);
        return;
      }
      setUndoBusyId(row.id);
      setUndoConfirmId(null);
      try {
        const { error: undoErr } = await supabase.rpc('erp_attendance_admin_undo_checkout_pk', {
          p_id: row.id,
        });
        if (undoErr) throw new Error(undoErr.message);
        await fetchAttendance();
        broadcastErpAttendanceChange(row.user_id);
      } catch (e) {
        setError(e?.message || 'Could not undo check-out');
      } finally {
        setUndoBusyId(null);
      }
    },
    [canEditAttendance, fetchAttendance, undoConfirmId],
  );

  const presetBtnClass =
    'rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

  const statCards = [
    {
      label: 'Rows in range',
      value: stats.rows.toLocaleString(),
      hint: filteredMemberLabel
        ? `${filteredMemberLabel} · ${rangeLabel}`
        : `${stats.members} member${stats.members === 1 ? '' : 's'} · ${rangeLabel}`,
      tone:
        'from-teal-500/15 to-cyan-500/10 text-teal-900 ring-teal-300/50 dark:from-teal-950/55 dark:to-cyan-950/35 dark:text-teal-200 dark:ring-teal-700/45',
    },
    {
      label: 'Completed days',
      value: stats.completed.toLocaleString(),
      hint: `${stats.totalHours} logged`,
      tone:
        'from-emerald-500/15 to-teal-500/10 text-emerald-900 ring-emerald-300/50 dark:from-emerald-950/50 dark:to-teal-950/35 dark:text-emerald-200 dark:ring-emerald-700/45',
    },
    {
      label: 'Missing check-out',
      value: stats.missingOut.toLocaleString(),
      hint: stats.missingOut === 0 ? 'All clean' : 'Needs attention',
      tone:
        stats.missingOut > 0
          ? 'from-amber-500/20 to-rose-500/10 text-amber-900 ring-amber-300/60 dark:from-amber-950/40 dark:to-rose-950/35 dark:text-amber-200 dark:ring-amber-800/45'
          : 'from-slate-500/10 to-slate-500/5 text-slate-700 ring-slate-300/60 dark:from-slate-900/55 dark:to-slate-950/55 dark:text-slate-300 dark:ring-slate-600',
    },
    {
      label: 'Average day',
      value: stats.avgHours,
      hint: `Across ${stats.completed} day${stats.completed === 1 ? '' : 's'}`,
      tone:
        'from-violet-500/15 to-fuchsia-500/10 text-violet-900 ring-violet-300/50 dark:from-violet-950/50 dark:to-fuchsia-950/35 dark:text-violet-200 dark:ring-violet-800/45',
    },
  ];

  return (
    <div className="w-full max-w-none space-y-8 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      <ErpAdminPageHero eyebrow="People & time" title="Attendance" accent="teal" />
      <p className="-mt-4 text-sm text-slate-600 dark:text-slate-400">
        {scopeHint} — view check-ins, undo accidental check-outs (within 2 hours), and correct times.
      </p>

      <ErpAttendanceMember embedded onTimesUpdated={() => void fetchAttendance()} />

      {error ? (
        <p className="rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50/80 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm dark:border-rose-900/45 dark:bg-gradient-to-r dark:from-rose-950/55 dark:to-slate-900/92 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading && members.length === 0 ? (
        <div className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-200/40 bg-gradient-to-b from-white to-cyan-50/30 py-20 shadow-inner ${ERP_DARK_LOADING_SHELL}`}>
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 shadow-md dark:border-teal-800 dark:border-r-teal-400 dark:border-t-cyan-300" />
          <p className="text-sm font-medium text-teal-800/70 dark:text-teal-200">Loading team…</p>
        </div>
      ) : (
        <>
          <section
            className={`overflow-hidden rounded-3xl border border-teal-200/45 bg-white shadow-[0_16px_48px_-24px_rgba(16,61,77,0.35)] ring-1 ring-white/80 ${ERP_DARK_SECTION_MAIN_PANEL}`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b border-teal-100/90 bg-gradient-to-r from-teal-50/90 via-white to-cyan-50/25 px-4 py-3 sm:px-5 ${ERP_DARK_TABLE_HEADER_BAR}`}
            >
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#103D4D] dark:text-teal-200">Team check-in / check-out</h2>
                <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  Pick dates and a member — analytics and the table use the same filters.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {attendanceLoading ? (
                  <span className="text-[11px] font-medium text-teal-800/70 dark:text-teal-300">Loading…</span>
                ) : (
                  <>
                    <ErpExportCsvButton
                      filename={
                        memberFilterId
                          ? `attendance-${filteredMemberLabel || 'member'}-${attendanceFrom}-to-${attendanceTo}`
                          : `attendance-${attendanceFrom}-to-${attendanceTo}`
                      }
                      rows={attendanceFiltered}
                      columns={attendanceExportColumns}
                    />
                    <span
                      className={`rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#103D4D] shadow-sm ring-1 ring-teal-200/70 ${ERP_DARK_PILL_PRIMARY}`}
                    >
                      {attendanceFiltered.length} row{attendanceFiltered.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-3 border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-5 dark:border-teal-900/40 dark:bg-[#0a1420]/90">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    From
                  </label>
                  <ErpDateInput
                    value={attendanceFrom}
                    max={attendanceTo}
                    onChange={(e) => setAttendanceFrom(e.target.value)}
                    className={ATTENDANCE_DATE_FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    To
                  </label>
                  <ErpDateInput
                    value={attendanceTo}
                    min={attendanceFrom}
                    onChange={(e) => setAttendanceTo(e.target.value)}
                    className={ATTENDANCE_DATE_FIELD_CLASS}
                  />
                </div>
                <div className="min-w-[10rem] flex-1 sm:min-w-[12rem] sm:max-w-xs">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Member
                  </label>
                  <ErpNativeSelect
                    value={memberFilterId}
                    onChange={(e) => setMemberFilterId(e.target.value)}
                    className={ERP_FILTER_SELECT_CLASS}
                    renderLeading={(ctx) => memberSelectLeading(profileById, ctx)}
                    aria-label="Filter by member"
                  >
                    <option value="">All members</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name?.trim() || 'Member'}
                      </option>
                    ))}
                  </ErpNativeSelect>
                </div>
                {canCreateAttendance ? (
                  <button
                    type="button"
                    onClick={toggleAddAttendance}
                    disabled={members.length === 0}
                    className="rounded-xl border border-teal-300/80 bg-gradient-to-r from-teal-600 to-cyan-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:from-teal-700 hover:to-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {addOpen ? 'Close' : 'Record missing attendance'}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quick range</span>
                <button type="button" className={presetBtnClass} onClick={() => setDateRangeDays(setAttendanceFrom, setAttendanceTo, 7)}>
                  Last 7 days
                </button>
                <button type="button" className={presetBtnClass} onClick={() => setDateRangeDays(setAttendanceFrom, setAttendanceTo, 14)}>
                  Last 14 days
                </button>
                <button type="button" className={presetBtnClass} onClick={() => setDateRangeDays(setAttendanceFrom, setAttendanceTo, 30)}>
                  Last 30 days
                </button>
                <button
                  type="button"
                  className={presetBtnClass}
                  onClick={() => {
                    const to = new Date();
                    const from = new Date(to.getFullYear(), to.getMonth(), 1);
                    setAttendanceFrom(localDateString(from));
                    setAttendanceTo(localDateString(to));
                  }}
                >
                  This month
                </button>
                <button
                  type="button"
                  className={presetBtnClass}
                  onClick={() => {
                    const to = new Date();
                    const from = new Date(to.getFullYear(), 0, 1);
                    setAttendanceFrom(localDateString(from));
                    setAttendanceTo(localDateString(to));
                  }}
                >
                  Year to date
                </button>
              </div>
            </div>

            {members.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-3 border-b border-slate-100/80 px-4 py-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4 dark:border-teal-900/35">
                  {statCards.map((card) => (
                    <div
                      key={card.label}
                      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.tone} px-4 py-3.5 shadow-[0_10px_30px_-20px_rgba(15,61,77,0.35)] ring-1 backdrop-blur-sm`}
                    >
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{card.label}</p>
                        <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{card.value}</p>
                        <p className="mt-0.5 text-[11px] font-medium opacity-75">{card.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredMemberLabel ? (
                  <div className="flex items-center gap-3 border-b border-slate-100/80 px-4 py-3 sm:px-5 dark:border-teal-900/35">
                    <ErpUserAvatar profile={profileById[memberFilterId]} size="sm" alt={filteredMemberLabel} />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{filteredMemberLabel}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Showing only this member for {rangeLabel}. Use &quot;All members&quot; to see everyone.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="border-b border-slate-100/80 px-4 py-3 sm:px-5 dark:border-teal-900/35">
                  <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} max-w-2xl`}>
                    <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50 dark:text-teal-400/65" />
                    <label className="block">
                      <span className="sr-only">Search log</span>
                      <input
                        type="search"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search within filtered rows (name, date, times)…"
                        className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                </div>
              </>
            ) : null}
            {addOpen ? (
              <div className="border-b border-teal-100/90 bg-teal-50/40 px-4 py-4 sm:px-5 dark:border-teal-900/45 dark:bg-[#081820]/95">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#103D4D] dark:text-teal-200">
                  Record or replace a day
                </h3>
                <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  Use when someone forgot to check in. If that member already has a row for the work date, saving updates check-in/out.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Member
                    </label>
                    <ErpNativeSelect
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      wrapperClassName="min-w-[12rem]"
                      className={ERP_FILTER_SELECT_CLASS}
                      renderLeading={(ctx) => memberSelectLeading(profileById, ctx)}
                      aria-label="Member for attendance record"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name?.trim() || 'Member'}
                        </option>
                      ))}
                    </ErpNativeSelect>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Work date
                    </label>
                    <ErpDateInput
                      value={addWorkDate}
                      onChange={(e) => setAddWorkDate(e.target.value)}
                      className={ATTENDANCE_DATE_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Check-in
                    </label>
                    <ErpDateTimeInput
                      value={addCheckInLocal}
                      onChange={(e) => setAddCheckInLocal(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Check-out <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <ErpDateTimeInput
                      value={addCheckOutLocal}
                      onChange={(e) => setAddCheckOutLocal(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveAddAttendance()}
                    disabled={addBusy || members.length === 0}
                    className="rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {addError ? (
                  <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300">{addError}</p>
                ) : null}
              </div>
            ) : null}
            <div className={`overflow-x-auto bg-gradient-to-b from-slate-50/40 to-white ${ERP_DARK_TABLE_SCROLL_AREA}`}>
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr
                    className={`border-b border-slate-200/90 bg-white/95 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${ERP_DARK_TABLE_HEAD_ROW}`}
                  >
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Work date</th>
                    <th className="px-4 py-3">Check-in</th>
                    <th className="px-4 py-3">Check-out</th>
                    <th className="px-4 py-3 tabular-nums">Working / breaks</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendancePage.map((r, i) => {
                    const name = nameById[r.user_id] || 'Member';
                    const missingOut = !r.check_out_at;
                    const grossMs = durationMsBetween(r.check_in_at, r.check_out_at);
                    const breakSec = Number(r.break_seconds_total) || 0;
                    const breakMs = Math.max(0, breakSec * 1000);
                    const netMs = Math.max(0, grossMs - breakMs);
                    const netLabel = r.check_in_at && r.check_out_at ? formatHmFromMs(netMs) : '—';
                    const breakLabel =
                      r.check_in_at && r.check_out_at && breakSec > 0 ? formatHmFromSeconds(breakSec) : '';
                    return (
                      <tr
                        key={r.id}
                        className={`group border-b border-slate-100/80 transition-colors hover:bg-teal-50/50 dark:border-slate-700/60 dark:hover:bg-white/[0.04] ${
                          i % 2 === 0 ? 'bg-white dark:bg-[#0c141c]' : 'bg-slate-50/40 dark:bg-[#080d12]'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ErpUserAvatar profile={profileById[r.user_id]} size="sm" alt={name} />
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          <span className="inline-flex items-center rounded-lg bg-slate-100/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:ring-slate-600">
                            {formatWorkDate(r.work_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                          {formatAttendanceDateTime(r.check_in_at)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {missingOut ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-900/50">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Missing
                            </span>
                          ) : (
                            <span className="text-slate-800 dark:text-slate-200">{formatAttendanceDateTime(r.check_out_at)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {missingOut ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div className="inline-flex flex-col items-start gap-1">
                              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-900 ring-1 ring-emerald-200/70 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900/50">
                                {netLabel}
                              </span>
                              {breakLabel ? (
                                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                  Breaks {breakLabel}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {canEditAttendance && r.check_out_at && canUndoAttendanceCheckout(r.check_out_at) ? (
                              <button
                                type="button"
                                disabled={undoBusyId === r.id}
                                onClick={() => void undoCheckout(r)}
                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold shadow-sm transition disabled:opacity-50 ${
                                  undoConfirmId === r.id
                                    ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-100'
                                    : 'border-amber-200/90 bg-white text-amber-800 hover:bg-amber-50 dark:border-amber-800/50 dark:bg-slate-800 dark:text-amber-200 dark:hover:bg-amber-950/40'
                                }`}
                              >
                                {undoBusyId === r.id
                                  ? 'Undoing…'
                                  : undoConfirmId === r.id
                                    ? 'Confirm undo'
                                    : 'Undo checkout'}
                              </button>
                            ) : null}
                            {canEditAttendance ? (
                              <button
                                type="button"
                                onClick={() => openEditAttendance(r)}
                                className="rounded-lg border border-teal-200/90 bg-white px-2.5 py-1 text-[11px] font-bold text-[#103D4D] shadow-sm transition hover:-translate-y-px hover:border-teal-300 hover:bg-teal-50 hover:shadow dark:border-teal-700/50 dark:bg-slate-800 dark:text-teal-200 dark:hover:bg-teal-950/50"
                              >
                                Edit
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {members.length > 0 && attendanceFiltered.length === 0 && !attendanceLoading ? (
                <p className="px-6 py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                  {attendanceRows.length === 0
                    ? 'No check-in rows in this date range.'
                    : memberFilterId && attendanceByFilters.length === 0
                      ? 'No rows for this member in the selected dates.'
                      : 'No rows match your search.'}
                </p>
              ) : null}
            </div>

            {attendanceFiltered.length > 0 ? (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-gradient-to-r from-slate-50/60 via-white to-teal-50/30 px-4 py-3 sm:px-5 ${ERP_DARK_TABLE_FOOTER_BAR}`}
              >
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {pageStart + 1}
                    <span className="text-slate-400">–</span>
                    {pageEnd}
                  </span>
                  <span className="text-slate-400">of</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{totalRows}</span>
                  <span className="hidden text-slate-300 sm:inline dark:text-slate-600">·</span>
                  <label className="hidden items-center gap-2 sm:inline-flex">
                    <span className="font-medium text-slate-500 dark:text-slate-500">Rows per page</span>
                    <ErpNativeSelect
                      value={String(pageSize)}
                      onChange={(e) => setPageSize(Number(e.target.value) || 25)}
                      zoneSize="xs"
                      wrapperClassName="inline-block w-[4.25rem]"
                      className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-6 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      aria-label="Rows per page"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </ErpNativeSelect>
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="First page"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="Previous page"
                  >
                    ‹ Prev
                  </button>
                  <span className="rounded-lg erp-brand-fill px-3 py-1 text-[11px] font-bold tabular-nums text-white shadow-sm">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="Last page"
                  >
                    »
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}

      {editRow ? (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => !editBusy && setEditRow(null)}
          />
          <div
            className={`relative z-[701] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-3xl`}
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">Edit check-in / check-out</h2>
            <p className="mt-1 text-sm text-slate-600">
              {nameById[editRow.user_id] || 'Member'} · {formatWorkDate(editRow.work_date)}
            </p>
            <p className="mt-2 text-[12px] text-slate-500">
              Times use your browser&apos;s local timezone. Leave check-out empty if they forgot to check out. Undo checkout
              (table action) works only within 2 hours of check-out.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-in</label>
                <ErpDateTimeInput
                  value={editCheckInLocal}
                  onChange={(e) => setEditCheckInLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Check-out <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <ErpDateTimeInput
                  value={editCheckOutLocal}
                  onChange={(e) => setEditCheckOutLocal(e.target.value)}
                />
              </div>
            </div>
            {editError ? <p className="mt-3 text-sm font-medium text-rose-700">{editError}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => !editBusy && setEditRow(null)}
                disabled={editBusy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEditAttendance()}
                disabled={editBusy}
                className="rounded-xl erp-brand-fill px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
