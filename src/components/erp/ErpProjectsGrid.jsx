'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { groupTasksByProjectId } from '../../lib/erp-task-tree';
import { compareTaskPriority, rollupPriorityFromTasks } from '../../lib/erp-task-priority';
import { isErpGlobalAdmin, isErpManagerRole, erpProjectMemberDelegationLabel } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpAddProjectModal from './ErpAddProjectModalDynamic';
import ErpUserAvatar from './ErpUserAvatar';
import ErpNativeSelect, { ERP_FILTER_SELECT_CLASS } from './ErpNativeSelect';
import { ERP_PROJECT_TYPES } from '../../lib/erp-project-types';
import { formatTotalTrackedSeconds } from '../../lib/erp-project-time-format';
import { formatTaskDueDate, taskDueColorClasses, taskDueStatus } from '../../lib/task-dates';
import {
  readRecentProjects,
  recordProjectVisit,
  subscribeRecentProjects,
} from '../../lib/erp-recent-projects';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
} from '../../lib/erp-list-search';

function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

function normalizeBoardColumn(raw) {
  const v = String(raw || 'todo').toLowerCase();
  if (v === 'todo' || v === 'in_progress' || v === 'review' || v === 'completed') return v;
  return 'todo';
}

function leadSourceDisplay(src) {
  const s = String(src || 'direct').toLowerCase();
  if (s === 'upwork') return { label: 'upwork', dot: 'bg-emerald-500' };
  if (s === 'fiverr') return { label: 'fiverr', dot: 'bg-emerald-600' };
  if (s === 'referral') return { label: 'referral', dot: 'bg-amber-400' };
  return { label: 'direct', dot: 'bg-sky-500' };
}

function taskProgress(tasks) {
  const list = tasks || [];
  const work = list.filter((t) => t.parent_task_id);
  const use = work.length ? work : list;
  const total = use.length;
  const done = use.filter((t) => String(t.status).toLowerCase() === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

function isMissingOptionalColumnError(err) {
  const m = String(err?.message || err?.details || '').toLowerCase();
  return (
    m.includes('client_name') ||
    m.includes('lead_source') ||
    m.includes('project_type') ||
    m.includes('project_type_ids') ||
    m.includes('schema cache')
  );
}

export default function ErpProjectsGrid() {
  const { profile, session, loading: sessionLoading } = useErpSession();
  const uid = session?.user?.id;
  const canCreateProject = isErpManagerRole(profile?.role);
  const canDeleteProject = canCreateProject;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectIds, setProjectIds] = useState([]);
  const [projectRows, setProjectRows] = useState({});
  const [tasksByProject, setTasksByProject] = useState({});
  const [teamByProject, setTeamByProject] = useState({});
  const [clientNameByProject, setClientNameByProject] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  /** Tab-style status filter above the grid — 'active' keeps completed projects in their own tab. */
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customTypes, setCustomTypes] = useState([]);
  const [channelNames, setChannelNames] = useState([]);
  const [channelNamesByProject, setChannelNamesByProject] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [unreadChatByProjectId, setUnreadChatByProjectId] = useState({});
  const [projectTimeTotals, setProjectTimeTotals] = useState({});
  /** localStorage-backed map of projectId → last opened timestamp (ms). Drives "recent first" ordering. */
  const [recentVisits, setRecentVisits] = useState({});

  useEffect(() => {
    if (!uid) {
      setRecentVisits({});
      return undefined;
    }
    setRecentVisits(readRecentProjects(uid));
    return subscribeRecentProjects(uid, setRecentVisits);
  }, [uid]);

  const parseProjectIdFromLink = useCallback((link) => {
    const s = String(link || '');
    const m = s.match(/\/erp\/projects\/([0-9a-fA-F-]{36})/);
    return m?.[1] || null;
  }, []);

  const load = useCallback(async () => {
    if (sessionLoading) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData?.session?.user;
      if (!user?.id) {
        const { data: authData } = await supabase.auth.getUser();
        user = authData?.user;
        if (!user?.id) {
          setError('Sign in required');
          setProjectIds([]);
          return;
        }
      }

      // While profile is still null we cannot tell admin vs member — skip sync to avoid 401
      // and wrong data path. After profile loads, this callback re-runs (deps).
      if (profile && !isErpGlobalAdmin(profile.role)) {
        await erpAuthorizedFetch('/api/erp/me/sync-project-memberships', { method: 'POST' }).catch(() => {});
      }

      let ids = [];
      if (isErpGlobalAdmin(profile?.role)) {
        const { data: allProjs, error: apErr } = await supabase
          .from('erp_projects')
          .select('id')
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .limit(500);
        if (apErr) throw new Error(apErr.message);
        ids = (allProjs || []).map((p) => p.id).filter(Boolean);
      } else {
        const { data: myMems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', user.id)
          .limit(500);
        if (memErr) throw new Error(memErr.message);
        ids = [...new Set((myMems || []).map((m) => m.project_id).filter(Boolean))];
      }

      setProjectIds(ids);
      if (ids.length === 0) {
        setProjectRows({});
        setTasksByProject({});
        setTeamByProject({});
        setClientNameByProject({});
        setChannelNames([]);
        setChannelNamesByProject({});
        setProjectTimeTotals({});
        return;
      }

      // Channels (for the channel filter). Non-fatal if the table is missing.
      const channelsMap = {};
      const channelSet = new Set();
      for (let i = 0; i < ids.length; i += 120) {
        const slice = ids.slice(i, i + 120);
        const { data: chans, error: chErr } = await supabase
          .from('erp_project_channels')
          .select('project_id, name')
          .in('project_id', slice)
          .limit(1000);
        if (chErr) break;
        for (const ch of chans || []) {
          const pid = ch?.project_id;
          const nm = typeof ch?.name === 'string' ? ch.name.trim() : '';
          if (!pid || !nm) continue;
          if (!channelsMap[pid]) channelsMap[pid] = [];
          channelsMap[pid].push(nm);
          channelSet.add(nm);
        }
      }
      for (const pid of Object.keys(channelsMap)) {
        channelsMap[pid] = [...new Set(channelsMap[pid])].sort((a, b) => a.localeCompare(b));
      }
      setChannelNamesByProject(channelsMap);
      setChannelNames([...channelSet].sort((a, b) => a.localeCompare(b)));

      const details = {};
      const CHUNK = 80;
      let extendedCols = true;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const cols = extendedCols
          ? 'id, name, deadline_date, board_column, client_name, lead_source, project_type, project_type_ids'
          : 'id, name, deadline_date, board_column';
        let { data: projs, error: pErr } = await supabase.from('erp_projects').select(cols).in('id', slice).is('deleted_at', null);
        if (pErr && extendedCols && isMissingOptionalColumnError(pErr)) {
          extendedCols = false;
          ({ data: projs, error: pErr } = await supabase
            .from('erp_projects')
            .select('id, name, deadline_date, board_column')
            .in('id', slice)
            .is('deleted_at', null));
        }
        if (pErr) throw new Error(pErr.message);
        (projs || []).forEach((p) => {
          if (!p?.id) return;
          const typeIdsRaw = Array.isArray(p.project_type_ids) ? p.project_type_ids : null;
          const legacyType = p.project_type || 'custom';
          const typeIds = typeIdsRaw && typeIdsRaw.length ? typeIdsRaw : [legacyType];
          details[p.id] = {
            name: p.name || 'Project',
            deadline_date: p.deadline_date ?? null,
            board_column: normalizeBoardColumn(p.board_column),
            client_name: extendedCols ? p.client_name : null,
            lead_source: extendedCols ? p.lead_source || 'direct' : 'direct',
            project_type: legacyType,
            project_type_ids: typeIds,
          };
        });
      }

      for (const pid of ids) {
        if (!details[pid]) {
          details[pid] = {
            name: 'Project',
            deadline_date: null,
            board_column: 'todo',
            client_name: null,
            lead_source: 'direct',
            project_type: 'custom',
          };
        }
      }
      setProjectRows(details);

      const flatTasks = [];
      const TCHUNK = 60;
      for (let i = 0; i < ids.length; i += TCHUNK) {
        const slice = ids.slice(i, i + TCHUNK);
        const { data: trows, error: tErr } = await supabase
          .from('erp_tasks')
          .select('id, title, status, priority, parent_task_id, project_id, created_at')
          .in('project_id', slice);
        if (tErr) throw new Error(tErr.message);
        flatTasks.push(...(trows || []));
      }
      setTasksByProject(groupTasksByProjectId(flatTasks));

      const teamMap = {};
      const clientMap = {};
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: mems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('project_id, user_id, role')
          .in('project_id', slice);
        if (memErr) throw new Error(memErr.message);
        const uids = [...new Set((mems || []).map((m) => m.user_id).filter(Boolean))];
        const names = {};
        const profileRowById = {};
        for (let j = 0; j < uids.length; j += 80) {
          const us = uids.slice(j, j + 80);
          const { data: profs } = await supabase
            .from('erp_profiles')
            .select('id, full_name, avatar_path, role, member_team')
            .in('id', us);
          (profs || []).forEach((p) => {
            if (!p?.id) return;
            names[p.id] = (p.full_name && String(p.full_name).trim()) || 'Member';
            profileRowById[p.id] = {
              id: p.id,
              full_name: p.full_name,
              avatar_path: p.avatar_path ?? null,
              role: p.role ?? null,
              member_team: p.member_team ?? null,
            };
          });
        }
        for (const m of mems || []) {
          if (!m.project_id) continue;
          if (!teamMap[m.project_id]) teamMap[m.project_id] = [];
          if (m.role === 'client') {
            const nm = names[m.user_id];
            if (nm && !clientMap[m.project_id]) clientMap[m.project_id] = nm;
            continue;
          }
          if (m.role === 'project_lead' || m.role === 'member') {
            const uidMember = m.user_id;
            teamMap[m.project_id].push({
              id: uidMember,
              name: names[uidMember] || 'Member',
              projectRole: m.role,
              profile:
                profileRowById[uidMember] ||
                ({ id: uidMember, full_name: names[uidMember] || null, avatar_path: null, role: null, member_team: null }),
            });
          }
        }
      }
      setTeamByProject(teamMap);
      setClientNameByProject(clientMap);

      const timeTotals = {};
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: aggRows, error: aggErr } = await supabase.rpc('erp_project_time_totals', {
          p_project_ids: slice,
        });
        if (!aggErr && Array.isArray(aggRows)) {
          for (const r of aggRows) {
            const pid = r?.project_id;
            if (!pid) continue;
            timeTotals[pid] = Number(r?.total_seconds) || 0;
          }
        } else {
          const { data: logRows } = await supabase
            .from('erp_project_time_logs')
            .select('project_id, duration_seconds')
            .in('project_id', slice);
          for (const r of logRows || []) {
            const pid = r.project_id;
            if (!pid) continue;
            timeTotals[pid] = (timeTotals[pid] || 0) + (Number(r.duration_seconds) || 0);
          }
        }
      }
      setProjectTimeTotals(timeTotals);

      // Unread project-chat notifications -> per-project badge.
      if (user?.id) {
        const { data: notifs } = await supabase
          .from('erp_notifications')
          .select('id, link')
          .eq('user_id', user.id)
          .eq('read', false)
          .ilike('link', '%/erp/projects/%')
          .limit(500);
        const counts = {};
        for (const n of notifs || []) {
          const pid = parseProjectIdFromLink(n?.link);
          if (!pid) continue;
          // Only treat channel deep-links as chat notifications.
          if (!String(n?.link || '').includes('channel=')) continue;
          counts[pid] = (counts[pid] || 0) + 1;
        }
        setUnreadChatByProjectId(counts);
      } else {
        setUnreadChatByProjectId({});
      }
    } catch (e) {
      setError(e?.message || 'Could not load projects');
      setProjectIds([]);
    } finally {
      setLoading(false);
    }
  }, [parseProjectIdFromLink, profile, sessionLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCustomTypes = useCallback(async () => {
    const { data, error: cErr } = await supabase
      .from('erp_custom_project_types')
      .select('id, label, sort_order')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (cErr) return;
    setCustomTypes(
      (data || []).map((t) => ({
        id: `custom:${t.id}`,
        label: String(t.label || '').trim() || 'Type',
        sort_order: t.sort_order ?? 0,
      })),
    );
  }, []);

  // Keep the "All types" dropdown live: refetch on mount, whenever the tab
  // becomes visible again, and on any realtime change to `erp_custom_project_types`.
  // This way, a type added elsewhere (e.g. inside the New-project dialog or by
  // an admin on another device) shows up here without a manual refresh.
  useEffect(() => {
    void loadCustomTypes();

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadCustomTypes();
      }
    };
    const onFocus = () => void loadCustomTypes();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }

    const channel = supabase
      .channel('erp-custom-project-types-grid')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_custom_project_types' },
        () => void loadCustomTypes(),
      )
      .subscribe();

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        /* channel may already be closed */
      }
    };
  }, [loadCustomTypes]);

  const allProjectTypes = useMemo(
    () => [...ERP_PROJECT_TYPES, ...customTypes],
    [customTypes],
  );

  useEffect(() => {
    if (!uid) return;
    async function refreshUnreadBadges() {
      const { data: notifs } = await supabase
        .from('erp_notifications')
        .select('id, link')
        .eq('user_id', uid)
        .eq('read', false)
        .ilike('link', '%/erp/projects/%')
        .limit(500);
      const counts = {};
      for (const n of notifs || []) {
        const pid = parseProjectIdFromLink(n?.link);
        if (!pid) continue;
        if (!String(n?.link || '').includes('channel=')) continue;
        counts[pid] = (counts[pid] || 0) + 1;
      }
      setUnreadChatByProjectId(counts);
    }
    const handler = () => void refreshUnreadBadges();
    window.addEventListener('erp-notifications-reload', handler);
    return () => window.removeEventListener('erp-notifications-reload', handler);
  }, [uid, parseProjectIdFromLink]);

  const visibleIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projectIds.filter((pid) => {
      const row = projectRows[pid] || {};
      const col = row.board_column || 'todo';
      const completed = col === 'completed';
      if (statusFilter === 'active' && completed) return false;
      if (statusFilter === 'completed' && !completed) return false;
      if (typeFilter !== 'all') {
        const ids = row.project_type_ids;
        const list = Array.isArray(ids) && ids.length ? ids : [String(row.project_type || 'custom')];
        if (!list.includes(typeFilter)) return false;
      }
      if (channelFilter !== 'all') {
        const names = channelNamesByProject[pid] || [];
        if (!names.includes(channelFilter)) return false;
      }
      if (q) {
        const haystacks = [
          row.name,
          row.client_name,
          clientNameByProject[pid],
          ...(channelNamesByProject[pid] || []),
          ...((teamByProject[pid] || []).map((m) => m?.name)),
        ];
        const match = haystacks.some((v) => String(v || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [
    projectIds,
    projectRows,
    statusFilter,
    typeFilter,
    channelFilter,
    channelNamesByProject,
    searchQuery,
    clientNameByProject,
    teamByProject,
  ]);

  /**
   * Counts for tab badges — applies every filter except the status tab itself
   * so users can see how many active vs completed projects match their query.
   */
  const statusTabCounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let active = 0;
    let completed = 0;
    for (const pid of projectIds) {
      const row = projectRows[pid] || {};
      if (typeFilter !== 'all') {
        const ids = row.project_type_ids;
        const list = Array.isArray(ids) && ids.length ? ids : [String(row.project_type || 'custom')];
        if (!list.includes(typeFilter)) continue;
      }
      if (channelFilter !== 'all') {
        const names = channelNamesByProject[pid] || [];
        if (!names.includes(channelFilter)) continue;
      }
      if (q) {
        const haystacks = [
          row.name,
          row.client_name,
          clientNameByProject[pid],
          ...(channelNamesByProject[pid] || []),
          ...((teamByProject[pid] || []).map((m) => m?.name)),
        ];
        const match = haystacks.some((v) => String(v || '').toLowerCase().includes(q));
        if (!match) continue;
      }
      if ((row.board_column || 'todo') === 'completed') completed += 1;
      else active += 1;
    }
    return { active, completed, all: active + completed };
  }, [
    projectIds,
    projectRows,
    typeFilter,
    channelFilter,
    channelNamesByProject,
    searchQuery,
    clientNameByProject,
    teamByProject,
  ]);

  const sortedIds = useMemo(() => {
    const rollup = (pid) => {
      const list = tasksByProject[pid] || [];
      const work = list.filter((t) => t.parent_task_id);
      return rollupPriorityFromTasks(work.length ? work : list);
    };
    // Two-tier sort:
    //   1. Projects the user opened recently on this device come first, newest
    //      visit at the top (so "which we open/used recently" actually leads).
    //   2. Everything else falls back to priority rollup + name (existing order).
    return [...visibleIds].sort((a, b) => {
      const ra = recentVisits[a] || 0;
      const rb = recentVisits[b] || 0;
      if (ra !== rb) return rb - ra;
      const pr = compareTaskPriority(rollup(a), rollup(b));
      if (pr !== 0) return pr;
      return (projectRows[a]?.name || '').localeCompare(projectRows[b]?.name || '');
    });
  }, [visibleIds, tasksByProject, projectRows, recentVisits]);

  const handleDeleteProject = useCallback((pid, name) => {
    if (!pid) return;
    setError('');
    setDeleteConfirm({
      pid,
      name: String(name || 'Project'),
      typed: '',
      busy: false,
      err: '',
    });
  }, []);

  const confirmDeleteProject = useCallback(async () => {
    if (!deleteConfirm?.pid || deleteConfirm.busy) return;
    if (String(deleteConfirm.typed || '').trim().toUpperCase() !== 'DELETE') {
      setDeleteConfirm((p) => (p ? { ...p, err: 'Type DELETE to confirm.' } : p));
      return;
    }
    const pid = deleteConfirm.pid;
    setDeleteConfirm((p) => (p ? { ...p, busy: true, err: '' } : p));
    setDeletingId(pid);
    setError('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${pid}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete project');
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      setDeleteConfirm((p) => (p ? { ...p, err: e?.message || 'Could not delete project' } : p));
      setError(e?.message || 'Could not delete project');
    } finally {
      setDeletingId(null);
      setDeleteConfirm((p) => (p ? { ...p, busy: false } : p));
    }
  }, [deleteConfirm, load]);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Projects</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} min-w-[14rem] sm:w-64`}>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/55" />
            <label className="block">
              <span className="sr-only">Search projects</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects…"
                className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
                autoComplete="off"
              />
            </label>
          </div>
          <label className="sr-only" htmlFor="erp-project-type-filter">
            Filter by project type
          </label>
          <ErpNativeSelect
            id="erp-project-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={ERP_FILTER_SELECT_CLASS}
          >
            <option value="all">All types</option>
            {allProjectTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </ErpNativeSelect>
          <label className="sr-only" htmlFor="erp-project-channel-filter">
            Filter by channel
          </label>
          <ErpNativeSelect
            id="erp-project-channel-filter"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className={ERP_FILTER_SELECT_CLASS}
          >
            <option value="all">All channels</option>
            {channelNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </ErpNativeSelect>
          {canCreateProject ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#103D4D] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#0d3442]"
            >
              <span className="text-lg leading-none">+</span>
              New Project
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="inline-flex w-full max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 shadow-sm ring-1 ring-slate-900/[0.03] sm:w-auto"
        role="tablist"
        aria-label="Project status"
      >
        {[
          { id: 'active', label: 'Active', dot: 'bg-emerald-500', count: statusTabCounts.active },
          { id: 'completed', label: 'Completed', dot: 'bg-violet-500', count: statusTabCounts.completed },
          { id: 'all', label: 'All', dot: 'bg-[#103D4D]', count: statusTabCounts.all },
        ].map((tab) => {
          const active = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatusFilter(tab.id)}
              className={`inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
                active
                  ? 'bg-white text-[#103D4D] shadow-md shadow-slate-900/10 ring-1 ring-slate-200/80'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${tab.dot}`} aria-hidden />
              {tab.label}
              <span
                className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active ? 'bg-[#103D4D] text-white' : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {sessionLoading || loading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : sortedIds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 py-16 text-center text-slate-600">
          {searchQuery.trim() ||
          statusFilter !== 'active' ||
          typeFilter !== 'all' ||
          channelFilter !== 'all' ? (
            <>
              <p className="font-medium text-slate-800">
                {statusFilter === 'completed'
                  ? 'No completed projects match your filters'
                  : statusFilter === 'active'
                    ? 'No active projects match your filters'
                    : 'No projects match your filters'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('active');
                  setTypeFilter('all');
                  setChannelFilter('all');
                }}
                className="mt-3 text-sm font-bold text-[#103D4D] underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-800">No projects yet</p>
              {canCreateProject ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-3 text-sm font-bold text-[#103D4D] underline"
                >
                  Create your first project
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedIds.map((pid) => {
            const row = projectRows[pid] || {};
            const tasks = tasksByProject[pid] || [];
            const { total, done, pct } = taskProgress(tasks);
            const rollup = (() => {
              const work = tasks.filter((t) => t.parent_task_id);
              return rollupPriorityFromTasks(work.length ? work : tasks);
            })();
            const completed = row.board_column === 'completed';
            const src = leadSourceDisplay(row.lead_source);
            const clientLabel = row.client_name?.trim() || clientNameByProject[pid] || '—';
            const team = (teamByProject[pid] || []).slice(0, 4);
            const extra = Math.max(0, (teamByProject[pid] || []).length - 4);
            const dueStatus = row.deadline_date ? taskDueStatus(row.deadline_date) : null;
            const dueColors = taskDueColorClasses(dueStatus);
            const due = row.deadline_date ? formatTaskDueDate(row.deadline_date) : null;
            const unreadChat = unreadChatByProjectId[pid] || 0;

            return (
              <article
                key={pid}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:border-cyan-300/60 hover:shadow-md"
              >
                <Link
                  href={`/erp/projects/${pid}`}
                  onClick={() => {
                    if (uid) recordProjectVisit(uid, pid);
                  }}
                  className="flex flex-col p-4 flex-1 min-h-0"
                >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      completed
                        ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80'
                        : 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                    }`}
                  >
                    {completed ? 'Completed' : 'Active'}
                  </span>
                  <div className="flex items-center gap-2">
                    {unreadChat > 0 ? (
                      <span
                        title={`${unreadChat} unread project chat message${unreadChat === 1 ? '' : 's'}`}
                        className="inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm"
                      >
                        {unreadChat > 99 ? '99+' : unreadChat}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium capitalize text-slate-500">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${src.dot}`} aria-hidden />
                      {src.label}
                    </span>
                  </div>
                </div>
                <h2 className="mt-3 line-clamp-2 text-lg font-bold text-slate-900 group-hover:text-[#103D4D]">
                  {row.name || 'Project'}
                </h2>
                <p className="mt-1 line-clamp-1 text-sm text-slate-500">{clientLabel}</p>
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-[#103D4D] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                    {pct}% · {done}/{total || 0} tasks
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-teal-800/90">
                    <span className="font-semibold text-teal-900/90">Time tracked</span>{' '}
                    {formatTotalTrackedSeconds(projectTimeTotals[pid] || 0)}
                  </p>
                </div>
                <div className="mt-4 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex -space-x-2">
                    {team.map((m) => (
                      <span
                        key={m.id}
                        title={`${m.name} — ${erpProjectMemberDelegationLabel(m.projectRole, m.profile)}`}
                        className="relative inline-flex shrink-0"
                      >
                        <ErpUserAvatar
                          profile={m.profile}
                          size="sm"
                          alt={m.name}
                          className="!ring-0 shadow-none"
                          imgClassName="!ring-0 shadow-none"
                        />
                      </span>
                    ))}
                    {extra > 0 ? (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold text-slate-700">
                        +{extra}
                      </span>
                    ) : null}
                    {team.length === 0 && !extra ? (
                      <span className="text-[11px] text-slate-400">No assignees</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ReadOnlyPriorityPill priority={rollup} size="sm" />
                    {due ? (
                      <span className={`text-[11px] tabular-nums font-semibold ${dueColors.value}`}>
                        <span className={`font-medium ${dueColors.label}`}>Due</span> {due}
                      </span>
                    ) : null}
                  </div>
                </div>
                </Link>
                {canDeleteProject ? (
                  <div className="border-t border-slate-100 bg-rose-50/30 px-4 py-2 flex justify-end">
                    <button
                      type="button"
                      disabled={deletingId === pid}
                      onClick={() => void handleDeleteProject(pid, row.name || 'Project')}
                      className="text-[11px] font-bold uppercase tracking-wide text-rose-700 hover:text-rose-900 disabled:opacity-50"
                    >
                      {deletingId === pid ? 'Deleting…' : 'Delete project'}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <ErpAddProjectModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        userId={uid}
        onCreated={() => void load()}
      />

      {typeof document !== 'undefined' && deleteConfirm ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => (deleteConfirm?.busy ? null : setDeleteConfirm(null))}
          />
          <div
            className="relative z-[401] w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="erp-delete-project-title"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Danger zone</p>
            <h2 id="erp-delete-project-title" className="mt-1 text-lg font-bold text-slate-900">
              Delete “{deleteConfirm.name}”
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently removes the project, tasks, chat, activity, and files in storage. This cannot be undone.
            </p>
            <p className="mt-4 text-sm text-slate-700">
              Type <span className="font-extrabold text-slate-900">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirm.typed}
              onChange={(e) => setDeleteConfirm((p) => (p ? { ...p, typed: e.target.value, err: '' } : p))}
              placeholder="DELETE"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
              disabled={deleteConfirm.busy}
              autoFocus
            />
            {deleteConfirm.err ? <p className="mt-2 text-sm text-rose-700">{deleteConfirm.err}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteConfirm.busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteProject()}
                disabled={deleteConfirm.busy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteConfirm.busy ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
