'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import {
  ERP_LEAVE_MEDICAL_QUOTA,
  ERP_LEAVE_REGULAR_QUOTA,
  LEAVE_TYPE_LABELS,
  leaveQuotaYear,
} from '../../lib/erp-leave';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpExportCsvButton from './ErpExportCsvButton';
import ErpLeaveMemberAdminSheet from './ErpLeaveMemberAdminSheet';

const INTERNAL_ROLES = ['admin', 'team_lead', 'team_member'];

function IconSearch({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

function IconClipboard({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 4h6l1 2h3a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h3l1-2z" strokeLinejoin="round" />
      <path d="M9 4a1 1 0 011-1h4a1 1 0 011 1" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3l1.8 5.5h5.7l-4.6 3.3 1.8 5.5L12 15.8 7.3 17.3l1.8-5.5L4.5 8.5h5.7L12 3z" strokeLinejoin="round" />
    </svg>
  );
}

function quotaBarWidth(used, quota) {
  if (!quota) return 0;
  return Math.min(100, Math.round((100 * used) / quota));
}

function roleBadgeClass(role) {
  const r = String(role || '');
  if (r === 'admin') return 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-900/20';
  if (r === 'team_lead') return 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-sm shadow-teal-900/20';
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80';
}

export default function ErpLeaveAdmin() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const year = new Date().getFullYear();

  const [members, setMembers] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [sheetMember, setSheetMember] = useState(null);

  const load = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setLeaves([]);
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
          setLeaves([]);
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
          setLeaves([]);
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

      const ids = profileRows.map((p) => p.id).filter(Boolean);
      if (ids.length === 0) {
        setLeaves([]);
        setLoading(false);
        return;
      }

      const allLeaves = [];
      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: chunk, error: lErr } = await supabase
          .from('erp_leave_requests')
          .select(
            'id, user_id, leave_type, start_date, end_date, day_count, status, reason, attachment_path, created_at, reviewed_at, reviewer_note, reviewed_by',
          )
          .in('user_id', slice)
          .order('created_at', { ascending: false })
          .limit(400);
        if (lErr) throw new Error(lErr.message);
        allLeaves.push(...(chunk || []));
      }
      setLeaves(allLeaves);
    } catch (e) {
      setError(e?.message || 'Could not load leave data');
      setMembers([]);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [uid, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || 'Member'])), [members]);

  const rowsSummaryAll = useMemo(() => {
    return members.map((m) => {
      let regA = 0;
      let medA = 0;
      let regP = 0;
      let medP = 0;
      for (const r of leaves) {
        if (r.user_id !== m.id) continue;
        if (leaveQuotaYear(r.start_date) !== year) continue;
        if (r.status === 'approved') {
          if (r.leave_type === 'regular') regA += r.day_count || 0;
          else medA += r.day_count || 0;
        } else if (r.status === 'pending') {
          if (r.leave_type === 'regular') regP += r.day_count || 0;
          else medP += r.day_count || 0;
        }
      }
      return {
        id: m.id,
        name: nameById[m.id],
        role: m.role,
        regA,
        medA,
        regP,
        medP,
      };
    });
  }, [members, leaves, year, nameById]);

  const rowsSummary = useMemo(
    () => filterListBySearch(rowsSummaryAll, memberSearch, (r) => [r.name, String(r.role || '').replace(/_/g, ' ')]),
    [rowsSummaryAll, memberSearch],
  );

  const leaveBalancesExportColumns = useMemo(
    () => [
      { header: 'Member', value: (r) => r.name },
      { header: 'Role', value: (r) => String(r.role || '').replace(/_/g, ' ') },
      { header: 'Regular used', value: (r) => r.regA + r.regP },
      { header: 'Regular quota', value: () => ERP_LEAVE_REGULAR_QUOTA },
      { header: 'Medical used', value: (r) => r.medA + r.medP },
      { header: 'Medical quota', value: () => ERP_LEAVE_MEDICAL_QUOTA },
      { header: 'Pending days', value: (r) => r.regP + r.medP },
    ],
    [],
  );

  const pendingList = useMemo(() => leaves.filter((r) => r.status === 'pending'), [leaves]);

  const approvedTimeline = useMemo(() => {
    return [...leaves]
      .filter((r) => r.status === 'approved')
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
      .slice(0, 24);
  }, [leaves]);

  const pendingFiltered = useMemo(
    () =>
      filterListBySearch(pendingList, memberSearch, (r) => [
        nameById[r.user_id],
        LEAVE_TYPE_LABELS[r.leave_type],
        r.reason,
        r.start_date,
        r.end_date,
      ]),
    [pendingList, memberSearch, nameById],
  );

  const pendingLeaveExportColumns = useMemo(
    () => [
      { header: 'Member', value: (r) => nameById[r.user_id] || '' },
      { header: 'Type', value: (r) => LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type },
      { header: 'Start date', value: (r) => r.start_date },
      { header: 'End date', value: (r) => r.end_date },
      { header: 'Days', value: (r) => r.day_count },
      { header: 'Reason', value: (r) => r.reason || '' },
    ],
    [nameById],
  );

  async function openAttachment(path) {
    if (!path) return;
    const { data, error: uErr } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (uErr || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function decide(id, status) {
    if (!uid) return;
    setBusyId(id);
    setError('');
    try {
      const { error: uErr } = await supabase
        .from('erp_leave_requests')
        .update({
          status,
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending');
      if (uErr) throw new Error(uErr.message);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not update request');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full max-w-[min(100%,96rem)] space-y-8 text-[13px] leading-snug text-slate-800">
      <div className="relative overflow-hidden rounded-3xl border border-cyan-200/40 bg-gradient-to-br from-[#103D4D]/[0.06] via-white to-violet-50/40 p-6 shadow-[0_20px_60px_-28px_rgba(16,61,77,0.35)] ring-1 ring-white/80 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-400/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-800/70">People & time off</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#103D4D] to-teal-600 text-white shadow-lg shadow-teal-900/25">
                <IconSpark className="h-5 w-5" />
              </span>
              Leave management
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              Balances, approvals, and a per-member panel with five tools: history, record leave, amend, cancel, and status changes — plus an audit log.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-cyan-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-bold text-[#103D4D] shadow-sm">
              {rowsSummaryAll.length} people in scope
            </span>
            <span className="inline-flex items-center rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-1.5 text-[11px] font-bold text-violet-900 shadow-sm">
              {pendingList.length} pending
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50/80 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-200/40 bg-gradient-to-b from-white to-cyan-50/30 py-20 shadow-inner">
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 shadow-md" />
          <p className="text-sm font-medium text-teal-800/70">Loading leave data…</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="group relative overflow-hidden rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50/95 via-white to-white p-4 shadow-md ring-1 ring-cyan-900/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-400/15 blur-2xl transition-opacity group-hover:opacity-100" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800/65">Quota year</p>
              <p className="mt-1 text-2xl font-bold tabular-nums bg-gradient-to-r from-[#103D4D] to-teal-600 bg-clip-text text-transparent">
                {year}
              </p>
              <p className="mt-2 text-[10px] font-medium text-slate-500">Counts use start date year.</p>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/90 via-white to-white p-4 shadow-md ring-1 ring-emerald-900/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/15 blur-2xl" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/65">Regular / person</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{ERP_LEAVE_REGULAR_QUOTA} days</p>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-sky-200/50 bg-gradient-to-br from-sky-50/90 via-white to-white p-4 shadow-md ring-1 ring-sky-900/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-900/65">Medical / person</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-800">{ERP_LEAVE_MEDICAL_QUOTA} days</p>
            </div>
            <div
              className={`group relative overflow-hidden rounded-2xl border p-4 shadow-md ring-1 transition-transform hover:-translate-y-0.5 hover:shadow-lg ${
                pendingList.length > 0
                  ? 'border-amber-300/70 bg-gradient-to-br from-amber-50 via-orange-50/80 to-white ring-amber-900/[0.06]'
                  : 'border-slate-200/60 bg-gradient-to-br from-slate-50/90 to-white ring-slate-900/[0.04]'
              }`}
            >
              <div
                className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl ${pendingList.length > 0 ? 'bg-amber-400/25' : 'bg-slate-300/20'}`}
                aria-hidden
              />
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-950/70">Awaiting you</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-amber-950">{pendingList.length}</span>
                <span className="text-xs font-medium text-amber-900/70">pending</span>
              </p>
            </div>
          </div>

          {members.length > 0 ? (
            <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} w-full max-w-none`}>
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50" />
              <label className="block">
                <span className="sr-only">Search people or leave</span>
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name, role, or leave details…"
                  className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
                  autoComplete="off"
                />
              </label>
            </div>
          ) : null}

          {approvedTimeline.length > 0 ? (
            <section className="overflow-hidden rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/20 p-4 shadow-lg ring-1 ring-emerald-900/[0.04] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-900/80">Approved leave — who was out</h2>
                <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 ring-1 ring-emerald-200/70">
                  Latest {approvedTimeline.length}
                </span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {approvedTimeline.map((r) => (
                  <li
                    key={r.id}
                    className="min-w-0 max-w-full rounded-2xl border border-emerald-200/60 bg-white/95 px-3 py-2 shadow-sm transition hover:border-teal-300 hover:shadow-md"
                  >
                    <p className="truncate text-[11px] font-bold text-slate-900">{nameById[r.user_id] || 'Member'}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-600">
                      {r.start_date} → {r.end_date}
                      <span className="text-slate-400"> · </span>
                      {r.day_count}d · {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-3xl border border-cyan-200/40 bg-white shadow-[0_16px_48px_-24px_rgba(16,61,77,0.35)] ring-1 ring-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/60 bg-gradient-to-r from-slate-50 via-cyan-50/35 to-teal-50/25 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#103D4D]/10 text-[#103D4D] shadow-inner ring-1 ring-[#103D4D]/12">
                  <IconClipboard className="h-4 w-4" />
                </span>
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700">Balances ({year})</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ErpExportCsvButton
                  filename={`leave-balances-${year}`}
                  rows={rowsSummary}
                  columns={leaveBalancesExportColumns}
                />
                <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70">
                  {rowsSummaryAll.length} people
                </span>
              </div>
            </div>
            <div className="overflow-x-auto bg-gradient-to-b from-slate-50/50 to-white">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-cyan-100/80 bg-white/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 tabular-nums">Regular used</th>
                    <th className="px-4 py-3 tabular-nums">Medical used</th>
                    <th className="px-4 py-3 tabular-nums">Pending (days)</th>
                    <th className="px-4 py-3 text-right">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSummary.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100/90 transition-colors hover:bg-cyan-50/50 ${
                        i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${roleBadgeClass(r.role)}`}
                        >
                          {String(r.role || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-800">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            {r.regA + r.regP}
                            <span className="text-slate-400"> / {ERP_LEAVE_REGULAR_QUOTA}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
                            style={{ width: `${quotaBarWidth(r.regA + r.regP, ERP_LEAVE_REGULAR_QUOTA)}%` }}
                          />
                        </div>
                        {r.regP > 0 ? (
                          <span className="mt-1 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            {r.regP} pend.
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-800">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            {r.medA + r.medP}
                            <span className="text-slate-400"> / {ERP_LEAVE_MEDICAL_QUOTA}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500"
                            style={{ width: `${quotaBarWidth(r.medA + r.medP, ERP_LEAVE_MEDICAL_QUOTA)}%` }}
                          />
                        </div>
                        {r.medP > 0 ? (
                          <span className="mt-1 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            {r.medP} pend.
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span
                          className={`inline-flex min-w-[2rem] items-center justify-center rounded-lg px-2 py-0.5 font-bold ${
                            r.regP + r.medP > 0 ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-200/80' : 'text-slate-500'
                          }`}
                        >
                          {r.regP + r.medP}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSheetMember(members.find((m) => m.id === r.id) || { id: r.id, full_name: r.name, role: r.role })
                          }
                          className="inline-flex items-center gap-1 rounded-xl border border-[#103D4D]/25 bg-gradient-to-r from-[#103D4D] to-teal-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md shadow-teal-900/15 transition hover:from-[#0d3442] hover:to-teal-800"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowsSummaryAll.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm font-medium text-slate-500">No team members in scope.</p>
              ) : rowsSummary.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm font-medium text-slate-500">No members match your search.</p>
              ) : null}
            </div>
          </section>

          {pendingList.length > 0 ? (
          <section className="relative overflow-hidden rounded-3xl border border-amber-200/55 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 p-1 shadow-[0_16px_40px_-20px_rgba(180,83,9,0.25)] ring-1 ring-amber-900/[0.06]">
            <div className="absolute -right-20 top-0 h-40 w-40 rounded-full bg-orange-400/15 blur-3xl" aria-hidden />
            <div className="relative rounded-[1.35rem] bg-white/70 px-4 py-5 backdrop-blur-sm sm:px-6 sm:py-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-amber-950">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-lg text-white shadow-md shadow-amber-900/20">
                    ✦
                  </span>
                  Pending leave requests
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <ErpExportCsvButton
                    filename={`pending-leave-${new Date().toISOString().slice(0, 10)}`}
                    rows={pendingFiltered}
                    columns={pendingLeaveExportColumns}
                  />
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-950 ring-1 ring-amber-400/40">
                    {pendingList.length} open
                  </span>
                </div>
              </div>

              {pendingFiltered.length === 0 ? (
                <p className="mt-6 text-center text-sm font-medium text-amber-900/70">No pending requests match your search.</p>
              ) : (
                <ul className="mt-5 space-y-3">
                  {pendingFiltered.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-col gap-4 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-white to-amber-50/50 p-4 shadow-md shadow-amber-900/[0.06] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{nameById[r.user_id] || 'Member'}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-600">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                            {LEAVE_TYPE_LABELS[r.leave_type]}
                          </span>{' '}
                          · {r.start_date} → {r.end_date} · {r.day_count} day{r.day_count === 1 ? '' : 's'}
                        </p>
                        {r.reason ? <p className="mt-2 text-[11px] leading-relaxed text-slate-500 line-clamp-3">{r.reason}</p> : null}
                        {r.attachment_path ? (
                          <button
                            type="button"
                            onClick={() => void openAttachment(r.attachment_path)}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 hover:text-teal-800"
                          >
                            View attachment
                          </button>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void decide(r.id, 'approved')}
                          className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-[11px] font-bold text-white shadow-md shadow-emerald-900/20 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => void decide(r.id, 'rejected')}
                          className="rounded-xl border-2 border-rose-200 bg-white px-4 py-2 text-[11px] font-bold text-rose-800 shadow-sm transition hover:bg-rose-50 disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          ) : null}
        </>
      )}

      <ErpLeaveMemberAdminSheet
        open={!!sheetMember}
        member={sheetMember}
        leaves={leaves}
        year={year}
        onClose={() => setSheetMember(null)}
        onSaved={load}
      />
    </div>
  );
}
