'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import {
  datetimeLocalValueToIsoUtc,
  formatAttendanceDateTime,
  formatDurationBetween,
  formatWorkDate,
  isoToDatetimeLocalValue,
  localDateString,
} from '../../lib/erp-attendance';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpAttendanceMember from './ErpAttendanceMember';
import ErpExportCsvButton from './ErpExportCsvButton';

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

function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic pastel gradient per member name, so each avatar has its own tint.
const AVATAR_GRADIENTS = [
  'from-teal-400 to-cyan-600',
  'from-violet-400 to-fuchsia-600',
  'from-amber-400 to-rose-500',
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-lime-400 to-emerald-600',
  'from-orange-400 to-red-500',
];
function gradientFor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function MemberAvatar({ name }) {
  return (
    <span
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(
        name,
      )} text-[11px] font-bold text-white shadow-sm ring-2 ring-white`}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

function durationMsBetween(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return 0;
  const a = new Date(checkInIso).getTime();
  const b = new Date(checkOutIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return b - a;
}

function formatHoursTotal(ms) {
  if (!ms || ms <= 0) return '0h';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function ErpAttendanceAdmin() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
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

  const loadMembers = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      let profileRows = [];
      if (isErpGlobalAdmin(profile.role)) {
        const { data, error: pErr } = await supabase
          .from('erp_profiles')
          .select('id, full_name, role')
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
          .select('id, full_name, role')
          .in('id', uids)
          .in('role', INTERNAL_ROLES)
          .order('full_name', { ascending: true });
        if (pErr) throw new Error(pErr.message);
        profileRows = data || [];
      }
      setMembers(profileRows);
    } catch (e) {
      setError(e?.message || 'Could not load team');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [uid, profile]);

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
            .select('id, user_id, work_date, check_in_at, check_out_at')
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

  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || 'Member'])), [members]);

  const attendanceFiltered = useMemo(
    () =>
      filterListBySearch(attendanceRows, memberSearch, (r) => [
        nameById[r.user_id],
        String(r.work_date || ''),
        String(r.check_in_at || ''),
        String(r.check_out_at || ''),
      ]),
    [attendanceRows, memberSearch, nameById],
  );

  useEffect(() => {
    setPage(1);
  }, [memberSearch, attendanceFrom, attendanceTo, pageSize, attendanceRows.length]);

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
        totalMs += durationMsBetween(r.check_in_at, r.check_out_at);
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
      { header: 'Duration', value: (r) => formatDurationBetween(r.check_in_at, r.check_out_at) },
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
    } catch (e) {
      setAddError(e?.message || 'Could not save');
    } finally {
      setAddBusy(false);
    }
  }, [addUserId, addWorkDate, addCheckInLocal, addCheckOutLocal, fetchAttendance]);

  const statCards = [
    {
      label: 'Rows in range',
      value: stats.rows.toLocaleString(),
      hint: `${stats.members} member${stats.members === 1 ? '' : 's'} tracked`,
      tone: 'from-teal-500/15 to-cyan-500/10 text-teal-900 ring-teal-300/50',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M3 10h18M9 4v16" />
        </svg>
      ),
    },
    {
      label: 'Completed days',
      value: stats.completed.toLocaleString(),
      hint: `${stats.totalHours} logged`,
      tone: 'from-emerald-500/15 to-teal-500/10 text-emerald-900 ring-emerald-300/50',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M5 12l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: 'Missing check-out',
      value: stats.missingOut.toLocaleString(),
      hint: stats.missingOut === 0 ? 'All clean' : 'Needs attention',
      tone:
        stats.missingOut > 0
          ? 'from-amber-500/20 to-rose-500/10 text-amber-900 ring-amber-300/60'
          : 'from-slate-500/10 to-slate-500/5 text-slate-700 ring-slate-300/60',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: 'Average day',
      value: stats.avgHours,
      hint: `Across ${stats.completed} day${stats.completed === 1 ? '' : 's'}`,
      tone: 'from-violet-500/15 to-fuchsia-500/10 text-violet-900 ring-violet-300/50',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 18l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 8h7v7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full max-w-none space-y-8 text-[13px] leading-snug text-slate-800">
      <ErpAdminPageHero eyebrow="People & time" title="Attendance" accent="teal" />

      <ErpAttendanceMember embedded onTimesUpdated={() => void fetchAttendance()} />

      {error ? (
        <p className="rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50/80 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-200/40 bg-gradient-to-b from-white to-cyan-50/30 py-20 shadow-inner">
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 shadow-md" />
          <p className="text-sm font-medium text-teal-800/70">Loading team…</p>
        </div>
      ) : (
        <>
          {members.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.tone} px-4 py-3.5 shadow-[0_10px_30px_-20px_rgba(15,61,77,0.35)] ring-1 backdrop-blur-sm`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{card.label}</p>
                        <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{card.value}</p>
                        <p className="mt-0.5 text-[11px] font-medium opacity-75">{card.hint}</p>
                      </div>
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/70 shadow-sm ring-1 ring-white">
                        {card.icon}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} max-w-2xl`}>
                <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50" />
                <label className="block">
                  <span className="sr-only">Search people</span>
                  <input
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name — filters the check-in log…"
                    className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
                    autoComplete="off"
                  />
                </label>
              </div>
            </>
          ) : null}

          <section className="overflow-hidden rounded-3xl border border-teal-200/45 bg-white shadow-[0_16px_48px_-24px_rgba(16,61,77,0.35)] ring-1 ring-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100/90 bg-gradient-to-r from-teal-50/90 via-white to-cyan-50/25 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#103D4D]">Team check-in / check-out</h2>
                <p className="mt-0.5 text-[11px] text-slate-600">Filter by work date range. Rows respect the search box above.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {attendanceLoading ? (
                  <span className="text-[11px] font-medium text-teal-800/70">Loading…</span>
                ) : (
                  <>
                    <ErpExportCsvButton
                      filename={`attendance-${attendanceFrom}-to-${attendanceTo}`}
                      rows={attendanceFiltered}
                      columns={attendanceExportColumns}
                    />
                    <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#103D4D] shadow-sm ring-1 ring-teal-200/70">
                      {attendanceFiltered.length} row{attendanceFiltered.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-5">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
                <input
                  type="date"
                  value={attendanceFrom}
                  onChange={(e) => setAttendanceFrom(e.target.value)}
                  className="rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
                <input
                  type="date"
                  value={attendanceTo}
                  onChange={(e) => setAttendanceTo(e.target.value)}
                  className="rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 13);
                  setAttendanceFrom(localDateString(d));
                  setAttendanceTo(localDateString(new Date()));
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Last 14 days
              </button>
              <button
                type="button"
                onClick={toggleAddAttendance}
                disabled={members.length === 0}
                className="rounded-xl border border-teal-300/80 bg-gradient-to-r from-teal-600 to-cyan-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:from-teal-700 hover:to-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {addOpen ? 'Close' : 'Record missing attendance'}
              </button>
            </div>
            {addOpen ? (
              <div className="border-b border-teal-100/90 bg-teal-50/40 px-4 py-4 sm:px-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#103D4D]">Record or replace a day</h3>
                <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600">
                  Use when someone forgot to check in. If that member already has a row for the work date, saving updates check-in/out.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Member</label>
                    <select
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      className="min-w-[12rem] rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name?.trim() || 'Member'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Work date</label>
                    <input
                      type="date"
                      value={addWorkDate}
                      onChange={(e) => setAddWorkDate(e.target.value)}
                      className="rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-in</label>
                    <input
                      type="datetime-local"
                      value={addCheckInLocal}
                      onChange={(e) => setAddCheckInLocal(e.target.value)}
                      className="rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Check-out <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={addCheckOutLocal}
                      onChange={(e) => setAddCheckOutLocal(e.target.value)}
                      className="rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveAddAttendance()}
                    disabled={addBusy || members.length === 0}
                    className="rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 hover:from-[#0d3545] hover:to-teal-800"
                  >
                    {addBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {addError ? (
                  <p className="mt-3 text-sm font-medium text-rose-700">{addError}</p>
                ) : null}
              </div>
            ) : null}
            <div className="overflow-x-auto bg-gradient-to-b from-slate-50/40 to-white">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200/90 bg-white/95 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Work date</th>
                    <th className="px-4 py-3">Check-in</th>
                    <th className="px-4 py-3">Check-out</th>
                    <th className="px-4 py-3 tabular-nums">Duration</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendancePage.map((r, i) => {
                    const name = nameById[r.user_id] || 'Member';
                    const missingOut = !r.check_out_at;
                    const duration = formatDurationBetween(r.check_in_at, r.check_out_at);
                    return (
                      <tr
                        key={r.id}
                        className={`group border-b border-slate-100/80 transition-colors hover:bg-teal-50/50 ${
                          i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <MemberAvatar name={name} />
                            <span className="font-semibold text-slate-900">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="inline-flex items-center rounded-lg bg-slate-100/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                            {formatWorkDate(r.work_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-800">
                          {formatAttendanceDateTime(r.check_in_at)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {missingOut ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Missing
                            </span>
                          ) : (
                            <span className="text-slate-800">{formatAttendanceDateTime(r.check_out_at)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {missingOut ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-900 ring-1 ring-emerald-200/70">
                              {duration}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditAttendance(r)}
                            className="rounded-lg border border-teal-200/90 bg-white px-2.5 py-1 text-[11px] font-bold text-[#103D4D] shadow-sm transition hover:-translate-y-px hover:border-teal-300 hover:bg-teal-50 hover:shadow"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {members.length > 0 && attendanceFiltered.length === 0 && !attendanceLoading ? (
                <p className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                  {attendanceRows.length === 0
                    ? 'No check-in rows in this date range.'
                    : 'No rows match your search.'}
                </p>
              ) : null}
            </div>

            {attendanceFiltered.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-gradient-to-r from-slate-50/60 via-white to-teal-50/30 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">
                    {pageStart + 1}
                    <span className="text-slate-400">–</span>
                    {pageEnd}
                  </span>
                  <span className="text-slate-400">of</span>
                  <span className="font-semibold text-slate-700">{totalRows}</span>
                  <span className="hidden text-slate-300 sm:inline">·</span>
                  <label className="hidden items-center gap-2 sm:inline-flex">
                    <span className="font-medium text-slate-500">Rows per page</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value) || 25)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="First page"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    ‹ Prev
                  </button>
                  <span className="rounded-lg bg-gradient-to-r from-[#103D4D] to-teal-700 px-3 py-1 text-[11px] font-bold tabular-nums text-white shadow-sm">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => !editBusy && setEditRow(null)}
          />
          <div
            className="relative z-[701] w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">Edit check-in / check-out</h2>
            <p className="mt-1 text-sm text-slate-600">
              {nameById[editRow.user_id] || 'Member'} · {formatWorkDate(editRow.work_date)}
            </p>
            <p className="mt-2 text-[12px] text-slate-500">
              Times use your browser&apos;s local timezone. Leave check-out empty if they forgot to check out (or to clear a wrong checkout).
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-in</label>
                <input
                  type="datetime-local"
                  value={editCheckInLocal}
                  onChange={(e) => setEditCheckInLocal(e.target.value)}
                  className="w-full max-w-sm rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Check-out <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={editCheckOutLocal}
                  onChange={(e) => setEditCheckOutLocal(e.target.value)}
                  className="w-full max-w-sm rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
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
                className="rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 hover:from-[#0d3545] hover:to-teal-800"
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
