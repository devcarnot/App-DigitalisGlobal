'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { leaveQuotaYear } from '../../lib/erp-remote-work';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpExportCsvButton from './ErpExportCsvButton';

const INTERNAL_ROLES = ['admin', 'team_lead', 'team_member'];

function IconSearch({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function ErpRemoteWorkAdmin() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const year = new Date().getFullYear();

  const [members, setMembers] = useState([]);
  const [remoteRows, setRemoteRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setRemoteRows([]);
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
          setRemoteRows([]);
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
          setRemoteRows([]);
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
        setRemoteRows([]);
        setLoading(false);
        return;
      }

      const all = [];
      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: chunk, error: rErr } = await supabase
          .from('erp_remote_work_requests')
          .select(
            'id, user_id, start_date, end_date, day_count, status, reason, created_at, reviewed_at, reviewed_by',
          )
          .in('user_id', slice)
          .order('created_at', { ascending: false })
          .limit(400);
        if (rErr) throw new Error(rErr.message);
        all.push(...(chunk || []));
      }
      setRemoteRows(all);
    } catch (e) {
      setError(e?.message || 'Could not load remote work data');
      setMembers([]);
      setRemoteRows([]);
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
      let approved = 0;
      let pending = 0;
      for (const r of remoteRows) {
        if (r.user_id !== m.id) continue;
        if (leaveQuotaYear(r.start_date) !== year) continue;
        if (r.status === 'approved') approved += r.day_count || 0;
        else if (r.status === 'pending') pending += r.day_count || 0;
      }
      return {
        id: m.id,
        name: nameById[m.id],
        role: m.role,
        approved,
        pending,
      };
    });
  }, [members, remoteRows, year, nameById]);

  const rowsSummary = useMemo(
    () => filterListBySearch(rowsSummaryAll, memberSearch, (r) => [r.name, String(r.role || '').replace(/_/g, ' ')]),
    [rowsSummaryAll, memberSearch],
  );

  const pendingList = useMemo(() => remoteRows.filter((r) => r.status === 'pending'), [remoteRows]);

  const pendingFiltered = useMemo(
    () =>
      filterListBySearch(pendingList, memberSearch, (r) => [
        nameById[r.user_id],
        r.reason,
        r.start_date,
        r.end_date,
      ]),
    [pendingList, memberSearch, nameById],
  );

  const summaryExportColumns = useMemo(
    () => [
      { header: 'Member', value: (r) => r.name },
      { header: 'Role', value: (r) => String(r.role || '').replace(/_/g, ' ') },
      { header: `Approved remote days (${year})`, value: (r) => String(r.approved) },
      { header: `Pending remote days (${year})`, value: (r) => String(r.pending) },
    ],
    [year],
  );

  async function decide(id, status) {
    if (!uid) return;
    setBusyId(id);
    setError('');
    try {
      const { error: uErr } = await supabase
        .from('erp_remote_work_requests')
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
      <div className="relative overflow-hidden rounded-3xl border border-sky-200/45 bg-gradient-to-br from-sky-50/70 via-white to-cyan-50/30 p-6 shadow-[0_20px_60px_-28px_rgba(14,116,144,0.25)] ring-1 ring-white/80 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-900/70">People · Workplace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Remote work management</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            Review pending requests and compare approved vs pending remote days for team members this calendar year ({year}).
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-sky-200/40 bg-gradient-to-b from-white to-sky-50/25 py-20">
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-sky-200 border-t-[#103D4D] border-r-cyan-500" />
          <p className="text-sm font-medium text-sky-900/70">Loading remote work…</p>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-3xl border border-cyan-200/40 bg-white shadow-lg ring-1 ring-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/60 bg-gradient-to-r from-slate-50 via-sky-50/35 to-teal-50/25 px-4 py-3 sm:px-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700">Balances ({year})</h2>
              <div className="flex flex-wrap items-center gap-2">
                <ErpExportCsvButton filename={`remote-work-balances-${year}`} rows={rowsSummary} columns={summaryExportColumns} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-cyan-100/80 bg-white/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 tabular-nums">Approved days</th>
                    <th className="px-4 py-3 tabular-nums">Pending days</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSummary.map((r, i) => (
                    <tr key={r.id} className={`border-b border-slate-100/90 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">{String(r.role || '').replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-sky-900">{r.approved}</td>
                      <td className="px-4 py-3 tabular-nums text-amber-900">{r.pending}</td>
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

          <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} w-full max-w-none`}>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50" />
            <label className="block">
              <span className="sr-only">Search pending requests</span>
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search pending queue…"
                className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
                autoComplete="off"
              />
            </label>
          </div>

          {pendingList.length > 0 ? (
            <section className="relative overflow-hidden rounded-3xl border border-amber-200/55 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 p-1 shadow-lg ring-1 ring-amber-900/[0.06]">
              <div className="relative rounded-[1.35rem] bg-white/75 px-4 py-5 backdrop-blur-sm sm:px-6">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-amber-950">
                  Pending remote work requests
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px]">{pendingList.length}</span>
                </h2>
                {pendingFiltered.length === 0 ? (
                  <p className="mt-6 text-center text-sm font-medium text-amber-900/70">No pending requests match your search.</p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {pendingFiltered.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-col gap-4 rounded-2xl border border-amber-200/60 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900">{nameById[r.user_id] || 'Member'}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-600">
                            {r.start_date} → {r.end_date} · {r.day_count} day{r.day_count === 1 ? '' : 's'}
                          </p>
                          {r.reason ? (
                            <p className="mt-2 text-[11px] leading-relaxed text-slate-500 line-clamp-3">{r.reason}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void decide(r.id, 'approved')}
                            className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-[11px] font-bold text-white shadow-md disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void decide(r.id, 'rejected')}
                            className="rounded-xl border-2 border-rose-200 bg-white px-4 py-2 text-[11px] font-bold text-rose-800 shadow-sm disabled:opacity-40"
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
          ) : (
            <p className="text-center text-sm text-slate-500">No pending remote work requests.</p>
          )}
        </>
      )}
    </div>
  );
}
