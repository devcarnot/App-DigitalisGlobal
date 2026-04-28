'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { erpMemberTeamLabel, isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import { ErpAvatarWithOnline } from '../erp/ErpOnlineIndicator';
import ErpUserAvatar from '../erp/ErpUserAvatar';
import ErpCreatableSelect from '../erp/ErpCreatableSelect';
import { useErpSession } from '../erp/useErpSession';
import ErpAddMemberModal from './ErpAddMemberModal';
import ErpMemberActivitySection from './ErpMemberActivitySection';
import { ERP_LIST_SEARCH_INPUT_CLASS, filterListBySearch } from '../../lib/erp-list-search';
import { ERP_DARK_SECTION_MAIN_PANEL } from '../../lib/erp-dark-surfaces';

const CHUNK = 80;

/** User must type this (case-insensitive) to enable permanent workspace removal. */
const REMOVE_CONFIRM_PHRASE = 'remove';

async function fetchInChunks(table, column, ids, select) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from(table).select(select).in(column, slice);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

function isMissingBoardColumnError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    (msg.includes('board_column') && (msg.includes('does not exist') || msg.includes('schema cache'))) || code === '42703'
  );
}

/** Normalize `erp_projects.board_column`. */
function normalizeBoardColumn(raw) {
  const v = String(raw || 'todo').toLowerCase();
  if (v === 'todo' || v === 'in_progress' || v === 'review' || v === 'completed') return v;
  return 'todo';
}

/** Each project row: id, deadline_date, board_column (column optional if migration missing). */
async function fetchProjectsMetaInChunks(projectIds) {
  const out = [];
  for (let i = 0; i < projectIds.length; i += CHUNK) {
    const slice = projectIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('erp_projects').select('id, deadline_date, board_column').in('id', slice);
    if (error && isMissingBoardColumnError(error)) {
      const { data: d2, error: e2 } = await supabase.from('erp_projects').select('id, deadline_date').in('id', slice);
      if (e2) throw new Error(e2.message);
      for (const p of d2 || []) {
        out.push({ ...p, board_column: 'todo' });
      }
    } else if (error) {
      throw new Error(error.message);
    } else {
      for (const p of data || []) {
        out.push({ ...p, board_column: p.board_column ?? 'todo' });
      }
    }
  }
  return out;
}

function globalRoleLabel(role) {
  if (!role) return 'Member';
  if (role === 'team_lead') return 'Team lead';
  if (role === 'team_member') return 'Team member';
  return String(role).replace(/_/g, ' ');
}

/** Open workload: active project slots vs total project memberships (each project = one main). */
function workloadRatio(active, total) {
  if (total <= 0) return 0;
  return active / total;
}

/** Bar color / load label from how many projects they’re on (not open %). */
function burdenLevelByProjectCount(projectCount) {
  const n = Number(projectCount) || 0;
  if (n <= 2) return 'low';
  if (n <= 4) return 'medium';
  return 'high';
}

function burdenBarClass(level) {
  if (level === 'low') return 'from-emerald-400 to-teal-500';
  if (level === 'medium') return 'from-amber-400 to-orange-400';
  return 'from-rose-500 to-red-600';
}

function burdenTrackClass(level) {
  if (level === 'low') return 'bg-emerald-100/90 ring-emerald-200/80';
  if (level === 'medium') return 'bg-amber-100/90 ring-amber-200/80';
  return 'bg-rose-100/90 ring-rose-200/80';
}

function burdenLabel(level) {
  if (level === 'low') return { text: 'Light load', sub: '1–2 projects — capacity headroom' };
  if (level === 'medium') return { text: 'Moderate load', sub: '3–4 projects — watch deadlines' };
  return { text: 'Heavy load', sub: '5+ projects — high concurrent load' };
}

/** Member workload lists internal ICs (team members). Admins, team leads, and clients are omitted — clients appear under Clients. */
function includeInMemberWorkload(prof) {
  const r = prof?.role;
  if (r === 'admin' || r === 'team_lead' || r === 'client') return false;
  return true;
}

export default function ErpMemberWorkload() {
  const { profile, session } = useErpSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [teamOptions, setTeamOptions] = useState([
    { id: 'developer', label: 'Developer' },
    { id: 'graphic_designer', label: 'Graphic designer' },
    { id: 'marketing', label: 'Marketing team' },
  ]);
  const [designationMenuUserId, setDesignationMenuUserId] = useState(null);
  const [savingDesignationUserId, setSavingDesignationUserId] = useState(null);
  const [designationErr, setDesignationErr] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [removeConfirmRow, setRemoveConfirmRow] = useState(null);
  const [removeConfirmTyped, setRemoveConfirmTyped] = useState('');
  const [removeConfirmErr, setRemoveConfirmErr] = useState('');
  const menuShellRef = useRef(null);

  const removeTypedOk =
    removeConfirmTyped.trim().toLowerCase() === REMOVE_CONFIRM_PHRASE.toLowerCase();

  const canEditDesignation = isErpManagerRole(profile?.role);
  /** Full workspace admin — can remove users (API also allows team leads; we restrict here to admins only). */
  const canRemoveWorkspaceMember = isErpGlobalAdmin(profile?.role);

  const displayRows = useMemo(
    () =>
      filterListBySearch(rows, search, (r) => [
        r.name,
        globalRoleLabel(r.globalRole),
        r.member_team ? erpMemberTeamLabel(r.member_team) : '',
      ]),
    [rows, search],
  );

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('erp_member_team_options')
      .select('id, label')
      .order('label', { ascending: true })
      .then(({ data, error: optErr }) => {
        if (cancelled) return;
        if (optErr || !Array.isArray(data) || data.length === 0) return;
        const mapped = data
          .filter((row) => row?.id && row?.label)
          .map((row) => ({ id: String(row.id), label: String(row.label) }));
        if (mapped.length) setTeamOptions(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!designationMenuUserId) return;
    function onDocMouseDown(e) {
      const el = menuShellRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setDesignationMenuUserId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [designationMenuUserId]);

  async function onDesignationChange(userId, value) {
    const memberTeam = value === '' ? null : value;
    setDesignationErr('');
    setSavingDesignationUserId(userId);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/member-team', {
        method: 'PATCH',
        body: JSON.stringify({ userId, memberTeam }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setRows((prev) =>
        prev.map((row) =>
          row.userId === userId
            ? {
                ...row,
                member_team: memberTeam,
                avatarProfile: {
                  ...row.avatarProfile,
                  member_team: memberTeam,
                },
              }
            : row,
        ),
      );
      setDesignationMenuUserId(null);
    } catch (e) {
      setDesignationErr(e?.message || 'Could not save designation');
    } finally {
      setSavingDesignationUserId(null);
    }
  }

  function closeRemoveConfirmModal() {
    setRemoveConfirmRow(null);
    setRemoveConfirmTyped('');
    setRemoveConfirmErr('');
  }

  function openRemoveConfirmModal(row) {
    const userId = row?.userId;
    if (!userId || userId === session?.user?.id) return;
    setRemoveConfirmRow(row);
    setRemoveConfirmTyped('');
    setRemoveConfirmErr('');
    setDesignationMenuUserId(null);
  }

  useEffect(() => {
    if (!removeConfirmRow) return;
    function onKey(e) {
      if (e.key === 'Escape') closeRemoveConfirmModal();
    }
    document.addEventListener('keydown', onKey);
    const t = window.requestAnimationFrame(() => {
      document.getElementById('remove-confirm-input')?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(t);
    };
  }, [removeConfirmRow]);

  async function executeConfirmedRemove() {
    const row = removeConfirmRow;
    const userId = row?.userId;
    if (!userId || userId === session?.user?.id || !removeTypedOk) return;
    setRemoveConfirmErr('');
    setDesignationErr('');
    setRemovingUserId(userId);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove user');
      setRows((prev) => prev.filter((x) => x.userId !== userId));
      setDesignationMenuUserId(null);
      closeRemoveConfirmModal();
    } catch (e) {
      setRemoveConfirmErr(e?.message || 'Could not remove member');
    } finally {
      setRemovingUserId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) {
        setRows([]);
        return;
      }

      const { data: profRow } = await supabase.from('erp_profiles').select('role').eq('id', uid).maybeSingle();
      const workspaceRole = profRow?.role;

      if (!isErpGlobalAdmin(workspaceRole)) {
        await erpAuthorizedFetch('/api/erp/me/sync-project-memberships', { method: 'POST' }).catch(() => {});
      }

      let projectIds = [];
      if (isErpGlobalAdmin(workspaceRole)) {
        const { data: allProjs, error: apErr } = await supabase.from('erp_projects').select('id').order('name', { ascending: true }).limit(500);
        if (apErr) throw new Error(apErr.message);
        projectIds = (allProjs || []).map((p) => p.id).filter(Boolean);
      } else {
        const { data: myMems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', uid)
          .limit(500);
        if (memErr) throw new Error(memErr.message);
        projectIds = [...new Set((myMems || []).map((r) => r.project_id).filter(Boolean))];
      }

      if (projectIds.length === 0) {
        setRows([]);
        return;
      }

      const [memberRows, projectMetaRows] = await Promise.all([
        fetchInChunks('erp_project_members', 'project_id', projectIds, 'user_id, role, project_id'),
        fetchProjectsMetaInChunks(projectIds),
      ]);

      const projectMetaById = new Map();
      for (const p of projectMetaRows || []) {
        if (p?.id) projectMetaById.set(p.id, p);
      }

      const memberProjectSet = {};
      for (const m of memberRows || []) {
        if (!m.user_id) continue;
        if (!memberProjectSet[m.user_id]) memberProjectSet[m.user_id] = new Set();
        memberProjectSet[m.user_id].add(m.project_id);
      }

      const allUserIds = new Set(Object.keys(memberProjectSet));

      const idList = [...allUserIds];
      let profiles = [];
      if (idList.length > 0) {
        for (let i = 0; i < idList.length; i += CHUNK) {
          const slice = idList.slice(i, i + CHUNK);
          const { data: profs, error: pErr } = await supabase
            .from('erp_profiles')
            .select('id, full_name, role, last_active_at, last_sign_out_at, avatar_path, member_team')
            .in('id', slice);
          if (pErr) throw new Error(pErr.message);
          profiles.push(...(profs || []));
        }
      }
      const profileById = {};
      for (const p of profiles) {
        profileById[p.id] = p;
      }

      const eligibleIds = new Set(
        [...allUserIds].filter((id) => includeInMemberWorkload(profileById[id]))
      );

      const today = startOfLocalDay(new Date());
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const byUser = {};
      for (const id of eligibleIds) {
        const pids = memberProjectSet[id] ? [...memberProjectSet[id]] : [];
        let total = 0;
        let active = 0;
        let completed = 0;
        let overdue = 0;
        let dueSoon = 0;

        for (const pid of pids) {
          total += 1;
          const meta = projectMetaById.get(pid);
          const col = normalizeBoardColumn(meta?.board_column);
          if (col === 'completed') {
            completed += 1;
          } else {
            active += 1;
            const dl = meta?.deadline_date;
            if (dl) {
              const d = parseDateOnlyLocal(dl);
              if (d) {
                const day = startOfLocalDay(d);
                if (day.getTime() < today.getTime()) overdue += 1;
                else if (day.getTime() <= weekEnd.getTime()) dueSoon += 1;
              }
            }
          }
        }

        byUser[id] = {
          userId: id,
          total,
          active,
          completed,
          cancelled: 0,
          overdue,
          dueSoon,
          projects: pids.length,
        };
      }

      const list = Object.values(byUser).map((u) => {
        const nonCancelled = u.total;
        const ratio = workloadRatio(u.active, nonCancelled);
        const level = nonCancelled === 0 ? 'none' : burdenLevelByProjectCount(u.total);
        const pct = nonCancelled > 0 ? Math.round(ratio * 100) : 0;
        const prof = profileById[u.userId];
        return {
          ...u,
          name: prof?.full_name || 'User',
          globalRole: prof?.role || 'team_member',
          member_team: prof?.member_team ?? null,
          lastActiveAt: prof?.last_active_at ?? null,
          lastSignOutAt: prof?.last_sign_out_at ?? null,
          avatarProfile: prof
            ? {
                full_name: prof.full_name,
                role: prof.role,
                avatar_path: prof.avatar_path,
                member_team: prof.member_team ?? null,
              }
            : { full_name: 'User', role: 'team_member', avatar_path: null, member_team: null },
          nonCancelled,
          ratio,
          level,
          pct,
        };
      });

      list.sort((a, b) => {
        if (a.nonCancelled === 0 && b.nonCancelled > 0) return 1;
        if (b.nonCancelled === 0 && a.nonCancelled > 0) return -1;
        if (b.total !== a.total) return b.total - a.total;
        if (a.ratio !== b.ratio) return b.ratio - a.ratio;
        return b.active - a.active;
      });

      setRows(list);
    } catch (e) {
      setError(e?.message || 'Could not load member workload');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    let heavy = 0;
    let medium = 0;
    let light = 0;
    for (const r of displayRows) {
      if (r.nonCancelled === 0) continue;
      if (r.level === 'high') heavy += 1;
      else if (r.level === 'medium') medium += 1;
      else if (r.level === 'low') light += 1;
    }
    return { heavy, medium, light, total: displayRows.length };
  }, [displayRows]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-11 w-11 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 animate-spin shadow-md" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/80 px-4 py-3 shadow-sm">
        {error}
      </p>
    );
  }

  const addMemberClass =
    'inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-shadow hover:shadow-lg';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {rows.length > 0 ? (
          <label className="block w-full min-w-0 max-w-md flex-1">
            <span className="sr-only">Search members</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or role…"
              className={ERP_LIST_SEARCH_INPUT_CLASS}
              autoComplete="off"
            />
          </label>
        ) : (
          <span className="hidden min-h-[42px] flex-1 sm:block" aria-hidden />
        )}
        <button type="button" onClick={() => setAddMemberOpen(true)} className={addMemberClass}>
          Add member
        </button>
      </div>

      <ErpAddMemberModal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} onSuccess={() => load()} />

      {designationErr ? (
        <p className="rounded-xl border border-rose-200/90 bg-rose-50/90 px-3 py-2 text-xs font-medium text-rose-800">{designationErr}</p>
      ) : null}

      {displayRows.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-rose-900/85 px-3 py-1.5 font-bold text-rose-100 shadow-md ring-1 ring-rose-400/30">
            <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]" aria-hidden />
            Heavy: {summary.heavy}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-amber-900/80 px-3 py-1.5 font-bold text-amber-100 shadow-md ring-1 ring-amber-400/35">
            <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.6)]" aria-hidden />
            Moderate: {summary.medium}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-emerald-900/80 px-3 py-1.5 font-bold text-emerald-100 shadow-md ring-1 ring-emerald-400/30">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" aria-hidden />
            Light: {summary.light}
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cyan-300/50 bg-gradient-to-br from-slate-900/[0.04] via-white/85 to-cyan-50/40 py-12 text-center text-sm font-medium text-teal-900/70 backdrop-blur-sm shadow-inner dark:border-teal-800/55 dark:from-[#0c161e] dark:via-[#0a1418] dark:to-[#081018] dark:text-teal-200/80">
          No projects or members in scope yet.
        </p>
      ) : displayRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cyan-300/50 bg-gradient-to-br from-slate-900/[0.04] via-white/85 to-cyan-50/40 py-12 text-center text-sm font-medium text-teal-900/70 backdrop-blur-sm shadow-inner dark:border-teal-800/55 dark:from-[#0c161e] dark:via-[#0a1418] dark:to-[#081018] dark:text-teal-200/80">
          No members match your search.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {displayRows.map((r) => {
            const bl =
              r.nonCancelled === 0
                ? { text: 'No projects', sub: 'Add this person to a project to see workload.' }
                : burdenLabel(r.level);
            const track = r.nonCancelled === 0 ? 'bg-slate-100 ring-slate-200/80' : burdenTrackClass(r.level);
            const fill = r.nonCancelled === 0 ? 'from-slate-300 to-slate-400' : burdenBarClass(r.level);
            const widthPct = r.nonCancelled > 0 ? Math.min(100, Math.round(r.ratio * 100)) : 0;

            const menuOpen = designationMenuUserId === r.userId;

            return (
              <li
                key={r.userId}
                className={
                  'relative flex flex-col gap-4 overflow-visible rounded-2xl border border-cyan-200/45 bg-white/90 p-5 shadow-[0_12px_40px_-14px_rgba(16,61,77,0.18)] ring-1 ring-cyan-900/[0.06] backdrop-blur-sm transition-shadow hover:shadow-[0_16px_48px_-12px_rgba(16,61,77,0.22)] dark:border-teal-900/45 ' +
                  ERP_DARK_SECTION_MAIN_PANEL +
                  (menuOpen ? ' z-50' : '')
                }
              >
                <div className="flex items-start gap-3 pt-1">
                  <ErpAvatarWithOnline presenceUserId={r.userId} lastActiveAt={r.lastActiveAt} size="lg">
                    <ErpUserAvatar
                      profile={r.avatarProfile}
                      size="lg"
                      className="!h-12 !w-12 !text-sm shadow-lg ring-2 ring-white/40"
                      imgClassName="shadow-lg ring-2 ring-white/40"
                      alt={r.name || 'Member'}
                    />
                  </ErpAvatarWithOnline>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate dark:text-slate-100">{r.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 capitalize dark:text-slate-400">
                      {r.member_team ? erpMemberTeamLabel(r.member_team) : globalRoleLabel(r.globalRole)}
                    </p>
                  </div>
                  {canEditDesignation || canRemoveWorkspaceMember ? (
                    <div
                      className="relative shrink-0"
                      ref={menuOpen ? menuShellRef : undefined}
                    >
                      <button
                        type="button"
                        className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 dark:hover:bg-teal-950/70 dark:hover:text-slate-200"
                        aria-expanded={menuOpen}
                        aria-haspopup="dialog"
                        aria-label={`Designation and role options for ${r.name}`}
                        onClick={() =>
                          setDesignationMenuUserId((cur) => {
                            const next = cur === r.userId ? null : r.userId;
                            if (next) setDesignationErr('');
                            return next;
                          })
                        }
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <circle cx="12" cy="5" r="1.75" />
                          <circle cx="12" cy="12" r="1.75" />
                          <circle cx="12" cy="19" r="1.75" />
                        </svg>
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 top-full z-[60] mt-1 w-[min(calc(100vw-2rem),16rem)] rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl ring-1 ring-slate-900/[0.06] dark:border-teal-800/50 dark:bg-[#121f28] dark:ring-teal-900/40">
                          {canEditDesignation ? (
                            <>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Designation
                              </p>
                              <ErpCreatableSelect
                                valueId={r.member_team || ''}
                                options={[{ id: '', label: 'Not set' }, ...teamOptions]}
                                disabled={savingDesignationUserId === r.userId || removingUserId === r.userId}
                                onChange={(next) => void onDesignationChange(r.userId, next)}
                                placeholder="Not set"
                                canCreate={Boolean(profile && ['admin', 'team_lead'].includes(profile.role))}
                                createLabel="Add new role"
                                onCreate={async ({ id, label }) => {
                                  const { error: insErr } = await supabase.from('erp_member_team_options').insert({ id, label });
                                  if (insErr) throw new Error(insErr.message);
                                  setTeamOptions((prev) =>
                                    [...prev, { id, label }].sort((a, b) => a.label.localeCompare(b.label)),
                                  );
                                }}
                                className="w-full"
                              />
                            </>
                          ) : null}

                          {canRemoveWorkspaceMember && r.userId !== session?.user?.id ? (
                            <>
                              {canEditDesignation ? (
                                <div className="my-3 border-t border-slate-100" aria-hidden />
                              ) : null}
                              <button
                                type="button"
                                disabled={removingUserId === r.userId || savingDesignationUserId === r.userId}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/90 bg-rose-50/90 px-3 py-2.5 text-left text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100/90 disabled:opacity-50"
                                onClick={() => openRemoveConfirmModal(r)}
                              >
                                {removingUserId === r.userId ? (
                                  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-rose-400 border-t-rose-800" />
                                ) : null}
                                Remove member
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                    <span>
                      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">{r.total}</span> project{r.total === 1 ? '' : 's'}
                    </span>
                    <span>
                      <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{r.completed}</span> done
                    </span>
                    <span>
                      <span className="font-bold tabular-nums text-sky-700 dark:text-sky-300">{r.active}</span> active
                    </span>
                    {r.cancelled > 0 ? (
                      <span>
                        <span className="font-bold tabular-nums text-slate-500 dark:text-slate-500">{r.cancelled}</span>{' '}
                        cancelled
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    {r.overdue > 0 ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {r.overdue} overdue
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">No overdue</span>
                    )}
                    {r.dueSoon > 0 ? (
                      <span className="font-medium text-amber-700 dark:text-amber-300">{r.dueSoon} due within 7 days</span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Open workload
                    </span>
                    <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
                      {r.nonCancelled > 0 ? (
                        <>
                          {r.active}/{r.nonCancelled}
                          <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">({widthPct}%)</span>
                        </>
                      ) : (
                        <span className="font-normal text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </span>
                  </div>
                  <div className={`h-3 w-full rounded-full overflow-hidden ring-1 ${track}`}>
                    {r.nonCancelled > 0 ? (
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${fill} transition-[width] duration-500 ease-out shadow-sm`}
                        style={{ width: `${widthPct}%` }}
                        role="progressbar"
                        aria-valuenow={widthPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    ) : (
                      <div className="h-full w-[8%] rounded-full bg-gradient-to-r from-slate-200 to-slate-300 opacity-60" />
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{bl.text}</span>
                    <span className="text-slate-400 dark:text-slate-600"> · </span>
                    {bl.sub}
                  </p>
                </div>

                <ErpMemberActivitySection
                  userId={r.userId}
                  lastActiveAt={r.lastActiveAt}
                  lastSignOutAt={r.lastSignOutAt}
                />
              </li>
            );
          })}
        </ul>
      )}

      {typeof document !== 'undefined' && removeConfirmRow
        ? createPortal(
            <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 sm:p-6">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="Close dialog"
                onClick={closeRemoveConfirmModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-member-title"
                className="relative z-10 w-full max-w-md rounded-2xl border border-rose-200/60 bg-white p-6 shadow-[0_24px_64px_-16px_rgba(127,29,29,0.35)] ring-1 ring-rose-900/[0.08]"
              >
                <h2 id="remove-member-title" className="text-lg font-bold text-slate-900">
                  Remove from workspace
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Permanently remove{' '}
                  <span className="font-semibold text-slate-900">
                    {removeConfirmRow.name?.trim() || 'this member'}
                  </span>
                  ? Their auth account will be deleted, they will be removed from all projects, and their messages and
                  tasks they created will be removed.{' '}
                  <span className="font-medium text-rose-800">This cannot be undone.</span>
                </p>
                <div className="mt-5">
                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mb-2" htmlFor="remove-confirm-input">
                    Type <span className="font-mono text-[#103D4D]">{REMOVE_CONFIRM_PHRASE}</span> to confirm
                  </label>
                  <input
                    id="remove-confirm-input"
                    type="text"
                    value={removeConfirmTyped}
                    onChange={(e) => {
                      setRemoveConfirmTyped(e.target.value);
                      setRemoveConfirmErr('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-rose-400/60 focus:outline-none focus:ring-4 focus:ring-rose-500/15"
                    placeholder={REMOVE_CONFIRM_PHRASE}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={removingUserId === removeConfirmRow.userId}
                  />
                </div>
                {removeConfirmErr ? (
                  <p className="mt-3 text-sm font-medium text-rose-700">{removeConfirmErr}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={closeRemoveConfirmModal}
                    disabled={removingUserId === removeConfirmRow.userId}
                    className="flex-1 min-w-[7rem] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!removeTypedOk || removingUserId === removeConfirmRow.userId}
                    onClick={() => void executeConfirmedRemove()}
                    className="flex-1 min-w-[7rem] rounded-xl bg-gradient-to-r from-rose-700 to-red-800 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {removingUserId === removeConfirmRow.userId ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <span
                          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                          aria-hidden
                        />
                        Removing…
                      </span>
                    ) : (
                      'Permanently delete'
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
