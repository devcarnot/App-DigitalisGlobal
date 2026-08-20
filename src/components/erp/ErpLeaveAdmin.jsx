'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import {
  ERP_LEAVE_ANNUAL_QUOTA,
  ERP_LEAVE_CASUAL_QUOTA,
  ERP_LEAVE_CASUAL_SICK_POOL,
  ERP_LEAVE_SICK_QUOTA,
  LEAVE_TYPE_LABELS,
  leaveQuotaYear,
  summarizeMemberLeaveYear,
} from '../../lib/erp-leave';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpExportCsvButton from './ErpExportCsvButton';
import ErpLeaveMemberAdminSheet from './ErpLeaveMemberAdminSheet';
import ErpLeaveDetailModal from './ErpLeaveDetailModal';
import ErpLeaveOrNoticeModal from './ErpLeaveOrNoticeModal';
import ErpLeavePendingQueueModal from './ErpLeavePendingQueueModal';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';
import {
  ERP_DARK_CARD_AMBER_BORDER,
  ERP_DARK_CHIP_EMERALD,
  ERP_DARK_HERO_SHELL,
  ERP_DARK_INNER_FROSTED,
  ERP_DARK_LOADING_SHELL,
  ERP_DARK_PILL_PRIMARY,
  ERP_DARK_SECTION_AMBER_ALERT,
  ERP_DARK_SECTION_EMERALD_PANEL,
  ERP_DARK_SECTION_MAIN_PANEL,
  ERP_DARK_SOLID_CARD,
  ERP_DARK_STAT_AMBER_HOT,
  ERP_DARK_STAT_CYAN,
  ERP_DARK_STAT_EMERALD,
  ERP_DARK_STAT_SKY,
  ERP_DARK_STAT_SLATE_SOFT,
  ERP_DARK_TABLE_HEAD_ROW,
  ERP_DARK_TABLE_HEADER_BAR,
  ERP_DARK_TABLE_SCROLL_AREA,
} from '../../lib/erp-dark-surfaces';

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
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600';
}

export default function ErpLeaveAdmin() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `leave:admin:${uid}` : null;
  const year = new Date().getFullYear();

  const [members, setMembers] = useState(() => pickErpCache(CACHE_KEY, (c) => c.members ?? [], []));
  const [leaves, setLeaves] = useState(() => pickErpCache(CACHE_KEY, (c) => c.leaves ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [sheetMember, setSheetMember] = useState(null);
  // Leave-detail popup ("click anyone to see all data + 3-dots change response").
  const [selectedLeaveId, setSelectedLeaveId] = useState(null);
  const [awaitingInfoOpen, setAwaitingInfoOpen] = useState(false);
  const [pendingQueueOpen, setPendingQueueOpen] = useState(false);
  // Approved / Rejected tab on the "who was out" widget.
  // Rejected only shows for Super Admin; for others the widget always shows
  // approved entries.
  const [historyTab, setHistoryTab] = useState(/** @type {'approved' | 'rejected'} */ ('approved'));

  const load = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setLeaves([]);
      setLoading(false);
      return;
    }
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setMembers(Array.isArray(cached?.members) ? cached.members : []);
      setLeaves(Array.isArray(cached?.leaves) ? cached.leaves : []);
    }, setLoading);
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
      writeErpDataCache(CACHE_KEY, { members: profileRows, leaves: allLeaves });
      setLeaves(allLeaves);
    } catch (e) {
      setError(e?.message || 'Could not load leave data');
      if (!hasErpDataCache(CACHE_KEY)) {
        setMembers([]);
        setLeaves([]);
      }
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, uid, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || 'Member'])), [members]);

  const rowsSummaryAll = useMemo(() => {
    return members.map((m) => {
      const memberLeaves = leaves.filter((r) => r.user_id === m.id);
      const s = summarizeMemberLeaveYear(memberLeaves, year);
      return {
        id: m.id,
        name: nameById[m.id],
        role: m.role,
        ...s,
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
      { header: 'Casual used', value: (r) => r.casualA },
      { header: 'Casual quota', value: () => ERP_LEAVE_CASUAL_QUOTA },
      { header: 'Sick used', value: (r) => r.sickA },
      { header: 'Sick quota', value: () => ERP_LEAVE_SICK_QUOTA },
      { header: 'Annual used', value: (r) => r.annualUsed },
      { header: 'Annual quota', value: () => ERP_LEAVE_ANNUAL_QUOTA },
      { header: 'Pending days', value: (r) => r.casualP + r.sickP },
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

  // Recently rejected: only shown to Super Admin (tab on the history widget).
  const rejectedTimeline = useMemo(() => {
    return [...leaves]
      .filter((r) => r.status === 'rejected')
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
      .slice(0, 24);
  }, [leaves]);

  // Reset to the approved tab when the viewer doesn't have rejected access,
  // or when the rejected list is empty after a refresh.
  useEffect(() => {
    if (!isErpGlobalAdmin(profile?.role) && historyTab !== 'approved') {
      setHistoryTab('approved');
    }
  }, [profile?.role, historyTab]);

  // Currently-open leave-detail row (kept in sync with `leaves` so an
  // approve / reject inside the dialog re-renders the same modal).
  const selectedLeave = useMemo(
    () => (selectedLeaveId ? leaves.find((r) => r.id === selectedLeaveId) || null : null),
    [leaves, selectedLeaveId],
  );

  const handleChangeStatusFromModal = async (next) => {
    if (!selectedLeaveId) return;
    await decide(selectedLeaveId, next);
  };

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

  function openPendingQueueOrEmptyInfo() {
    if (pendingList.length > 0) setPendingQueueOpen(true);
    else setAwaitingInfoOpen(true);
  }

  async function openAttachment(path) {
    if (!path) return;
    const { data, error: uErr } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (uErr || !data?.signedUrl) return;
    await downloadFromSignedUrlWithFallback(data.signedUrl, basenameFromStoragePath(path));
  }

  async function decide(id, status, options = {}) {
    if (!uid) return;
    const note = typeof options.reviewerNote === 'string' ? options.reviewerNote.trim() : '';
    const isSuper = isErpGlobalAdmin(profile?.role);
    setBusyId(id);
    setError('');
    try {
      if (isSuper) {
        const payload = { status };
        if (note !== '') payload.reviewer_note = note;
        const res = await erpAuthorizedFetch(`/api/erp/admin/leave-requests/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not update request');
      } else {
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
      }
      await load();
    } catch (e) {
      setError(e?.message || 'Could not update request');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full max-w-[min(100%,96rem)] space-y-8 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      <div
        className={`relative overflow-hidden rounded-3xl border border-cyan-200/40 bg-gradient-to-br from-[#103D4D]/[0.06] via-white to-violet-50/40 p-6 shadow-[0_20px_60px_-28px_rgba(16,61,77,0.35)] ring-1 ring-white/80 sm:p-8 ${ERP_DARK_HERO_SHELL}`}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-600/12"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-800/70 dark:text-teal-300">
              People & time off
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl erp-brand-fill text-white shadow-lg shadow-teal-900/25">
                <IconSpark className="h-5 w-5" />
              </span>
              Leave management
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
              Balances, approvals, and a per-member panel with five tools: history, record leave, amend, cancel, and status changes: plus an audit log.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50/80 px-4 py-3 text-sm font-medium text-rose-800 shadow-sm dark:border-rose-900/50 dark:bg-gradient-to-r dark:from-rose-950/60 dark:to-slate-900/95 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading && members.length === 0 && leaves.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-200/40 bg-gradient-to-b from-white to-cyan-50/30 py-20 shadow-inner ${ERP_DARK_LOADING_SHELL}`}
        >
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 shadow-md dark:border-teal-800 dark:border-r-teal-500 dark:border-t-cyan-300" />
          <p className="text-sm font-medium text-teal-800/70 dark:text-teal-200/90">Loading leave data…</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className={`group relative overflow-hidden rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50/95 via-white to-white p-4 shadow-md ring-1 ring-cyan-900/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg ${ERP_DARK_STAT_CYAN}`}
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-400/15 blur-2xl transition-opacity group-hover:opacity-100 dark:bg-cyan-500/10" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800/65 dark:text-teal-300/90">Quota year</p>
              <p className="mt-1 text-2xl font-bold tabular-nums erp-brand-text">
                {year}
              </p>
              <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">Counts use start date year.</p>
            </div>
            <div
              className={`group relative overflow-hidden rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/90 via-white to-white p-4 shadow-md ring-1 ring-emerald-900/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg ${ERP_DARK_STAT_EMERALD}`}
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/15 blur-2xl dark:bg-emerald-500/12" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/65 dark:text-emerald-300/85">Annual / person</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{ERP_LEAVE_ANNUAL_QUOTA} days</p>
            </div>
            <div
              className={`group relative overflow-hidden rounded-2xl border border-sky-200/50 bg-gradient-to-br from-sky-50/90 via-white to-white p-4 shadow-md ring-1 ring-sky-900/[0.04] transition-transform hover:-translate-y-0.5 hover:shadow-lg ${ERP_DARK_STAT_SKY}`}
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl dark:bg-sky-500/12" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-900/65 dark:text-sky-300/85">Casual + sick / person</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-800 dark:text-sky-200">
                {ERP_LEAVE_CASUAL_SICK_POOL}
                <span className="ml-1 text-sm font-semibold text-sky-700/80 dark:text-sky-300/80">
                  ({ERP_LEAVE_CASUAL_QUOTA}+{ERP_LEAVE_SICK_QUOTA})
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPendingQueueOrEmptyInfo()}
              className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left shadow-md ring-1 transition-transform hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 ${
                pendingList.length > 0
                  ? `border-amber-300/70 bg-gradient-to-br from-amber-50 via-orange-50/80 to-white ring-amber-900/[0.06] ${ERP_DARK_STAT_AMBER_HOT}`
                  : `border-slate-200/60 bg-gradient-to-br from-slate-50/90 to-white ring-slate-900/[0.04] ${ERP_DARK_STAT_SLATE_SOFT}`
              }`}
            >
              <div
                className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl ${pendingList.length > 0 ? 'bg-amber-400/25 dark:bg-amber-500/15' : 'bg-slate-300/20 dark:bg-slate-600/15'}`}
                aria-hidden
              />
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-950/70 dark:text-amber-200/95">Awaiting you</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-amber-950 dark:text-amber-100">{pendingList.length}</span>
                <span className="text-xs font-medium text-amber-900/70 dark:text-amber-300/85">pending</span>
              </p>
            </button>
          </div>

          {members.length > 0 ? (
            <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} w-full max-w-none`}>
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50 dark:text-teal-400/60" />
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

          {approvedTimeline.length > 0 || (isErpGlobalAdmin(profile?.role) && rejectedTimeline.length > 0) ? (
            <LeaveHistoryWidget
              tab={historyTab}
              onTabChange={setHistoryTab}
              approved={approvedTimeline}
              rejected={rejectedTimeline}
              showRejectedTab={isErpGlobalAdmin(profile?.role)}
              nameById={nameById}
              onSelect={setSelectedLeaveId}
            />
          ) : null}

          <section
            className={`overflow-hidden rounded-3xl border border-cyan-200/40 bg-white shadow-[0_16px_48px_-24px_rgba(16,61,77,0.35)] ring-1 ring-white/80 ${ERP_DARK_SECTION_MAIN_PANEL}`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/60 bg-gradient-to-r from-slate-50 via-cyan-50/35 to-teal-50/25 px-4 py-3 sm:px-5 ${ERP_DARK_TABLE_HEADER_BAR}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#103D4D]/10 text-[#103D4D] shadow-inner ring-1 ring-[#103D4D]/12 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-700/50">
                  <IconClipboard className="h-4 w-4" />
                </span>
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-200">Balances ({year})</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ErpExportCsvButton
                  filename={`leave-balances-${year}`}
                  rows={rowsSummary}
                  columns={leaveBalancesExportColumns}
                />
                <span
                  className={`rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70 ${ERP_DARK_PILL_PRIMARY}`}
                >
                  {rowsSummaryAll.length} people
                </span>
              </div>
            </div>
            <div className={`overflow-x-auto bg-gradient-to-b from-slate-50/50 to-white ${ERP_DARK_TABLE_SCROLL_AREA}`}>
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead>
                  <tr
                    className={`border-b border-cyan-100/80 bg-white/90 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${ERP_DARK_TABLE_HEAD_ROW}`}
                  >
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 tabular-nums">Casual used</th>
                    <th className="px-4 py-3 tabular-nums">Sick used</th>
                    <th className="px-4 py-3 tabular-nums">Annual (pool)</th>
                    <th className="px-4 py-3 tabular-nums">Pending (days)</th>
                    <th className="px-4 py-3 text-right">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSummary.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100/90 transition-colors hover:bg-cyan-50/50 dark:border-slate-700/70 dark:hover:bg-white/[0.04] ${
                        i % 2 === 0 ? 'bg-white dark:bg-[#0c141c]' : 'bg-slate-50/40 dark:bg-[#080d12]'
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{r.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${roleBadgeClass(r.role)}`}
                        >
                          {String(r.role || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            {r.casualA}
                            <span className="text-slate-400 dark:text-slate-500"> / {ERP_LEAVE_CASUAL_QUOTA}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/80">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
                            style={{ width: `${quotaBarWidth(r.casualA, ERP_LEAVE_CASUAL_QUOTA)}%` }}
                          />
                        </div>
                        {r.casualP > 0 ? (
                          <span className="mt-1 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                            {r.casualP} pend.
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            {r.sickA}
                            <span className="text-slate-400 dark:text-slate-500"> / {ERP_LEAVE_SICK_QUOTA}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/80">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500"
                            style={{ width: `${quotaBarWidth(r.sickA, ERP_LEAVE_SICK_QUOTA)}%` }}
                          />
                        </div>
                        {r.sickP > 0 ? (
                          <span className="mt-1 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                            {r.sickP} pend.
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            {r.annualUsed}
                            <span className="text-slate-400 dark:text-slate-500"> / {ERP_LEAVE_ANNUAL_QUOTA}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/80">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                            style={{ width: `${quotaBarWidth(r.annualUsed, ERP_LEAVE_ANNUAL_QUOTA)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span
                          className={`inline-flex min-w-[2rem] items-center justify-center rounded-lg px-2 py-0.5 font-bold ${
                            r.casualP + r.sickP > 0
                              ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-900/60'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {r.casualP + r.sickP}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSheetMember(members.find((m) => m.id === r.id) || { id: r.id, full_name: r.name, role: r.role })
                          }
                          className="inline-flex items-center gap-1 rounded-xl border border-[#103D4D]/25 erp-brand-fill px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md shadow-teal-900/15 transition"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowsSummaryAll.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                  No team members in scope.
                </p>
              ) : rowsSummary.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                  No members match your search.
                </p>
              ) : null}
            </div>
          </section>

          {pendingList.length > 0 ? (
            <section
              className={`relative overflow-hidden rounded-3xl border border-amber-200/55 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 p-1 shadow-[0_16px_40px_-20px_rgba(180,83,9,0.25)] ring-1 ring-amber-900/[0.06] ${ERP_DARK_SECTION_AMBER_ALERT}`}
            >
              <div
                className="absolute -right-20 top-0 h-40 w-40 rounded-full bg-orange-400/15 blur-3xl dark:bg-orange-600/12"
                aria-hidden
              />
              <div
                className={`relative rounded-[1.35rem] bg-white/70 px-4 py-5 backdrop-blur-sm sm:px-6 sm:py-6 ${ERP_DARK_INNER_FROSTED}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-amber-950 dark:text-amber-100">
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
                    <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-950 ring-1 ring-amber-400/40 dark:bg-amber-950/55 dark:text-amber-100 dark:ring-amber-800/50">
                      {pendingList.length} open
                    </span>
                  </div>
                </div>

                {pendingFiltered.length === 0 ? (
                  <p className="mt-6 text-center text-sm font-medium text-amber-900/70 dark:text-amber-200/85">
                    No pending requests match your search.
                  </p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {pendingFiltered.map((r) => (
                      <li
                        key={r.id}
                        className={`flex flex-col gap-4 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-white to-amber-50/50 p-4 shadow-md shadow-amber-900/[0.06] sm:flex-row sm:items-center sm:justify-between ${ERP_DARK_CARD_AMBER_BORDER}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedLeaveId(r.id)}
                          title="View details"
                          className="min-w-0 flex-1 cursor-pointer rounded-xl text-left transition hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 dark:hover:bg-white/[0.04]"
                        >
                          <p className="font-bold text-slate-900 dark:text-white">{nameById[r.user_id] || 'Member'}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {LEAVE_TYPE_LABELS[r.leave_type]}
                            </span>{' '}
                            · {r.start_date} → {r.end_date} · {r.day_count} day{r.day_count === 1 ? '' : 's'}
                          </p>
                          {r.reason ? (
                            <p className="mt-2 text-[11px] leading-relaxed text-slate-500 line-clamp-3 dark:text-slate-400">
                              {r.reason}
                            </p>
                          ) : null}
                          {r.attachment_path ? (
                            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 dark:text-teal-300">
                              View attachment
                            </span>
                          ) : null}
                        </button>
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
                            className="rounded-xl border-2 border-rose-200 bg-white px-4 py-2 text-[11px] font-bold text-rose-800 shadow-sm transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900/55 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/75"
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

      <ErpLeaveDetailModal
        open={!!selectedLeave}
        request={selectedLeave}
        memberName={selectedLeave ? nameById[selectedLeave.user_id] || 'Member' : ''}
        reviewerName={selectedLeave ? nameById[selectedLeave.reviewed_by] || '' : ''}
        viewerRole={profile?.role}
        onClose={() => setSelectedLeaveId(null)}
        onChangeStatus={handleChangeStatusFromModal}
        onOpenAttachment={(path) => void openAttachment(path)}
        busy={busyId === selectedLeaveId}
      />
      <ErpLeavePendingQueueModal
        open={pendingQueueOpen}
        onClose={() => setPendingQueueOpen(false)}
        rows={pendingList}
        nameById={nameById}
        onPickRow={(id) => {
          setSelectedLeaveId(id);
          setPendingQueueOpen(false);
        }}
      />

      <ErpLeaveOrNoticeModal
        open={awaitingInfoOpen}
        onClose={() => setAwaitingInfoOpen(false)}
        request={null}
        memberName=""
        reviewerName=""
        viewerRole={profile?.role}
        fallbackNotice={{
          title: 'No pending leave',
          body: 'There are no pending leave requests awaiting your review right now. When a teammate submits leave, it will appear in the list below.',
        }}
      />
    </div>
  );
}

/**
 * "Approved / Rejected" history widget: replaces the old loud
 * "Rejected leave (Super Admin)" panel by tucking rejected entries
 * behind a tab in the same surface as the approved timeline.
 *
 * Clicking any chip opens the existing leave-detail popup (which
 * carries the kebab "Change response" menu for re-approving or
 * re-opening to pending), so admins still get one-tap access to the
 * actions they used to have on dedicated buttons.
 */
function LeaveHistoryWidget({
  tab,
  onTabChange,
  approved,
  rejected,
  showRejectedTab,
  nameById,
  onSelect,
}) {
  const activeTab = !showRejectedTab && tab !== 'approved' ? 'approved' : tab;
  const items = activeTab === 'rejected' ? rejected : approved;

  const tabs = [
    {
      id: 'approved',
      label: 'Approved',
      count: approved.length,
      activeCls:
        'bg-white text-emerald-800 ring-emerald-200 dark:bg-[#0f1820] dark:text-emerald-200 dark:ring-emerald-800/55',
      inactiveCls:
        'text-emerald-900/70 hover:bg-white/70 dark:text-emerald-200/70 dark:hover:bg-white/[0.04]',
    },
  ];
  if (showRejectedTab) {
    tabs.push({
      id: 'rejected',
      label: 'Rejected',
      count: rejected.length,
      activeCls:
        'bg-white text-rose-800 ring-rose-200 dark:bg-[#0f1820] dark:text-rose-200 dark:ring-rose-800/55',
      inactiveCls:
        'text-rose-900/70 hover:bg-white/70 dark:text-rose-200/70 dark:hover:bg-white/[0.04]',
    });
  }

  const isRejected = activeTab === 'rejected';
  const surfaceCls = isRejected
    ? 'border-rose-200/55 bg-gradient-to-br from-rose-50/60 via-white to-slate-50/40 ring-rose-900/[0.04] dark:border-rose-900/40'
    : 'border-emerald-200/55 bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/20 ring-emerald-900/[0.04]';
  const titleCls = isRejected
    ? 'text-rose-900/85 dark:text-rose-200/90'
    : 'text-emerald-900/85 dark:text-emerald-200/90';
  const cardBorder = isRejected
    ? 'border-rose-200/65 hover:border-rose-300 focus-visible:ring-rose-400/70 dark:hover:border-rose-700/55'
    : 'border-emerald-200/65 hover:border-teal-300 focus-visible:ring-teal-400/70 dark:hover:border-teal-700/50';
  const countBadge = isRejected
    ? 'bg-white/90 text-rose-900 ring-rose-200/70 dark:bg-rose-950/55 dark:text-rose-100 dark:ring-rose-800/55'
    : 'bg-white/90 text-emerald-900 ring-emerald-200/70 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-800/55';

  return (
    <section
      className={`overflow-hidden rounded-3xl border p-4 shadow-lg ring-1 sm:p-5 ${surfaceCls} ${ERP_DARK_SECTION_EMERALD_PANEL}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-xs font-bold uppercase tracking-[0.15em] ${titleCls}`}>
          Leave history: who was out
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${countBadge} ${ERP_DARK_CHIP_EMERALD}`}
        >
          {items.length} {isRejected ? 'rejected' : 'approved'}
        </span>
      </div>

      {/* Tab strip: sits inside the section above the chip list. */}
      <div
        role="tablist"
        aria-label="Leave history tabs"
        className="mt-3 inline-flex rounded-full border border-slate-200/70 bg-slate-100/80 p-1 shadow-inner dark:border-teal-900/45 dark:bg-[#0a1218]"
      >
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition focus:outline-none focus-visible:ring-2 ${
                active ? `shadow-sm ring-1 ${t.activeCls}` : t.inactiveCls
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
                  active
                    ? 'bg-slate-900/[0.08] text-current dark:bg-white/[0.08]'
                    : 'bg-white/70 text-current ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:ring-teal-900/45'
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-[12px] font-medium text-slate-500 dark:text-slate-400">
          No {isRejected ? 'rejected' : 'approved'} requests yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((r) => (
            <li key={r.id} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                title="View details"
                className={`block w-full rounded-2xl border bg-white/95 px-3 py-2 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus-visible:ring-2 ${cardBorder} ${ERP_DARK_SOLID_CARD}`}
              >
                <p className="truncate text-[11px] font-bold text-slate-900 dark:text-white">
                  {nameById[r.user_id] || 'Member'}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  {r.start_date} → {r.end_date}
                  <span className="text-slate-400 dark:text-slate-500"> · </span>
                  {r.day_count}d · {LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
