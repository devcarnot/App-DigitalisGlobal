'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { groupTasksByProjectId } from '../../lib/erp-task-tree';
import { compareTaskPriority, rollupPriorityFromTasks } from '../../lib/erp-task-priority';
import { isErpGlobalAdmin, isErpManagerRole, erpProjectMemberDelegationLabel } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpAddProjectModal from './ErpAddProjectModalDynamic';
import ErpUserAvatar from './ErpUserAvatar';
import ErpFilterMultiSelect from './ErpFilterMultiSelect';
import { ERP_PROJECT_TYPES } from '../../lib/erp-project-types';
import { formatTotalTrackedSeconds } from '../../lib/erp-project-time-format';
import {
  formatTaskDueDate,
  parseDateOnlyLocal,
  startOfLocalDay,
  taskDueColorClasses,
  taskDueStatus,
} from '../../lib/task-dates';
import {
  readRecentProjects,
  recordProjectVisit,
  subscribeRecentProjects,
} from '../../lib/erp-recent-projects';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
} from '../../lib/erp-list-search';
import { workloadOpenAssignedChildMatchesTaskDueMode } from '../../lib/erp-assigned-workload-tasks';
import { ERP_WORKSPACE_SYNC, workspaceSyncTouchesScope } from '../../lib/erp-workspace-sync-events';

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

/** Match Members deep-link semantics: overdue excludes due-within-7-days bucket. */
function projectMatchesDeadlineSlice(row, mode) {
  if (!mode) return true;
  const col = normalizeBoardColumn(row.board_column);
  const completed = col === 'completed';
  const dlRaw = row.deadline_date;
  if (!dlRaw) return false;
  const d = parseDateOnlyLocal(dlRaw);
  if (!d) return false;
  const day = startOfLocalDay(d);
  const today = startOfLocalDay(new Date());

  if (mode === 'overdue') {
    if (completed) return false;
    return day.getTime() < today.getTime();
  }
  if (mode === 'due7') {
    if (completed) return false;
    if (day.getTime() < today.getTime()) return false;
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return day.getTime() <= weekEnd.getTime();
  }
  return true;
}

/** @param {Record<string, { id?: string }[]>} teamByProject */
function projectIncludesMember(teamByProject, projectId, memberUserId) {
  if (!memberUserId) return true;
  return (teamByProject[projectId] || []).some((m) => m?.id != null && String(m.id) === String(memberUserId));
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

function isProjectLeadOnCard(teamMembers, uid) {
  if (!uid) return false;
  return (teamMembers || []).some((m) => m.id === uid && m.projectRole === 'project_lead');
}

function canUseProjectQuickMenu(profile, uid, teamMembers) {
  return isErpManagerRole(profile?.role) || isProjectLeadOnCard(teamMembers, uid);
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
  const router = useRouter();
  const searchParams = useSearchParams();
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
  /** Empty = no restriction (labeled "All types" / "All channels"). */
  const [typeFilters, setTypeFilters] = useState([]);
  const [channelFilters, setChannelFilters] = useState([]);
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
  /** Dropdown from ⋮ — { pid: string } only; anchored with fixed coords from button rect. */
  const [quickMenu, setQuickMenu] = useState(null);
  const [completionBusyPid, setCompletionBusyPid] = useState(null);

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
          .select('id, title, status, priority, parent_task_id, project_id, created_at, assignee_id, assignee_ids, due_date')
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

  useEffect(() => {
    const onWorkspaceSync = (e) => {
      const d = e?.detail;
      if (
        workspaceSyncTouchesScope(d, 'projects') ||
        workspaceSyncTouchesScope(d, 'tasks')
      ) {
        void load();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(ERP_WORKSPACE_SYNC, onWorkspaceSync);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(ERP_WORKSPACE_SYNC, onWorkspaceSync);
      }
    };
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
    const valid = new Set(allProjectTypes.map((t) => t.id));
    setTypeFilters((prev) => prev.filter((id) => valid.has(id)));
  }, [allProjectTypes]);

  useEffect(() => {
    const valid = new Set(channelNames);
    setChannelFilters((prev) => prev.filter((n) => valid.has(n)));
  }, [channelNames]);

  const projectTypeMultiOptions = useMemo(
    () => allProjectTypes.map((t) => ({ value: t.id, label: t.label })),
    [allProjectTypes],
  );
  const channelMultiOptions = useMemo(
    () => channelNames.map((n) => ({ value: n, label: n })),
    [channelNames],
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

  const queryKey = searchParams?.toString() ?? '';
  const { memberFilterId, statusFromQuery, deadlineFromQuery, taskDueQuery } = useMemo(() => {
    const p = new URLSearchParams(queryKey);
    const rawSt = String(p.get('status') || '')
      .trim()
      .toLowerCase();
    const st = rawSt === 'active' || rawSt === 'completed' || rawSt === 'all' ? rawSt : null;
    const rawDl = String(p.get('deadline') || '')
      .trim()
      .toLowerCase();
    const dl = rawDl === 'overdue' || rawDl === 'due7' ? rawDl : null;
    const rawTd = String(p.get('taskDue') || '')
      .trim()
      .toLowerCase();
    const tq = rawTd === 'overdue' || rawTd === 'due7' ? rawTd : null;
    return {
      memberFilterId: String(p.get('member') || '').trim(),
      statusFromQuery: st,
      deadlineFromQuery: dl,
      taskDueQuery: tq,
    };
  }, [queryKey]);

  useEffect(() => {
    if (statusFromQuery) setStatusFilter(statusFromQuery);
  }, [statusFromQuery]);

  const visibleIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const today = startOfLocalDay(new Date());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return projectIds.filter((pid) => {
      const row = projectRows[pid] || {};
      if (memberFilterId && taskDueQuery) {
        const tasks = tasksByProject[pid] || [];
        const hit = tasks.some((t) =>
          workloadOpenAssignedChildMatchesTaskDueMode(t, memberFilterId, taskDueQuery, today, weekEnd),
        );
        if (!hit) return false;
      } else if (memberFilterId && !projectIncludesMember(teamByProject, pid, memberFilterId)) {
        return false;
      }
      if (deadlineFromQuery && !projectMatchesDeadlineSlice(row, deadlineFromQuery)) return false;
      const col = row.board_column || 'todo';
      const completed = col === 'completed';
      if (statusFilter === 'active' && completed) return false;
      if (statusFilter === 'completed' && !completed) return false;
      if (typeFilters.length) {
        const ids = row.project_type_ids;
        const list = Array.isArray(ids) && ids.length ? ids : [String(row.project_type || 'custom')];
        if (!typeFilters.some((fid) => list.includes(fid))) return false;
      }
      if (channelFilters.length) {
        const names = channelNamesByProject[pid] || [];
        if (!channelFilters.some((c) => names.includes(c))) return false;
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
    typeFilters,
    channelFilters,
    channelNamesByProject,
    searchQuery,
    clientNameByProject,
    teamByProject,
    memberFilterId,
    deadlineFromQuery,
    taskDueQuery,
    tasksByProject,
  ]);

  /**
   * Counts for tab badges — applies every filter except the status tab itself
   * so users can see how many active vs completed projects match their query.
   */
  const statusTabCounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const today = startOfLocalDay(new Date());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    let active = 0;
    let completed = 0;
    for (const pid of projectIds) {
      const row = projectRows[pid] || {};
      if (memberFilterId && taskDueQuery) {
        const tasks = tasksByProject[pid] || [];
        const hit = tasks.some((t) =>
          workloadOpenAssignedChildMatchesTaskDueMode(t, memberFilterId, taskDueQuery, today, weekEnd),
        );
        if (!hit) continue;
      } else if (memberFilterId && !projectIncludesMember(teamByProject, pid, memberFilterId)) {
        continue;
      }
      if (deadlineFromQuery && !projectMatchesDeadlineSlice(row, deadlineFromQuery)) continue;
      if (typeFilters.length) {
        const ids = row.project_type_ids;
        const list = Array.isArray(ids) && ids.length ? ids : [String(row.project_type || 'custom')];
        if (!typeFilters.some((fid) => list.includes(fid))) continue;
      }
      if (channelFilters.length) {
        const names = channelNamesByProject[pid] || [];
        if (!channelFilters.some((c) => names.includes(c))) continue;
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
    typeFilters,
    channelFilters,
    channelNamesByProject,
    searchQuery,
    clientNameByProject,
    teamByProject,
    memberFilterId,
    deadlineFromQuery,
    taskDueQuery,
    tasksByProject,
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

  useEffect(() => {
    if (!quickMenu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setQuickMenu(null);
    };
    const onDown = (e) => {
      if (e.target?.closest?.('[data-erp-project-quick-menu-panel]')) return;
      if (e.target?.closest?.('[data-erp-project-quick-menu-trigger]')) return;
      setQuickMenu(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [quickMenu]);

  const toggleProjectCompletionFromGrid = useCallback(
    async (pid, currentlyCompleted) => {
      if (!pid) return;
      setCompletionBusyPid(pid);
      setError('');
      try {
        const nextColumn = currentlyCompleted ? 'todo' : 'completed';
        const { error: rpcErr } = await supabase.rpc('erp_set_project_board_column', {
          p_project_id: pid,
          p_column: nextColumn,
        });
        if (rpcErr) throw new Error(rpcErr.message || 'Could not update project status');
        setQuickMenu(null);
        await load();
      } catch (e) {
        setError(e?.message || 'Could not update project status');
      } finally {
        setCompletionBusyPid(null);
      }
    },
    [load],
  );

  const openEditFromGrid = useCallback(
    (pid) => {
      setQuickMenu(null);
      router.push(`/erp/projects/${pid}?edit=1`);
    },
    [router],
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">Projects</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} min-w-[14rem] sm:w-64`}>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/55 dark:text-teal-400/75" />
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
          <ErpFilterMultiSelect
            id="erp-project-type-filter"
            placeholder="All types"
            options={projectTypeMultiOptions}
            value={typeFilters}
            onChange={setTypeFilters}
          />
          <label className="sr-only" htmlFor="erp-project-channel-filter">
            Filter by channel
          </label>
          <ErpFilterMultiSelect
            id="erp-project-channel-filter"
            placeholder="All channels"
            options={channelMultiOptions}
            value={channelFilters}
            onChange={setChannelFilters}
          />
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
        className="inline-flex w-full max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-teal-900/55 dark:bg-[#050a0f] dark:ring-teal-950/40 dark:[background-image:none] sm:w-auto"
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
                  ? 'bg-white text-[#103D4D] shadow-md shadow-slate-900/10 ring-1 ring-slate-200/80 dark:bg-[#0f2838] dark:text-teal-50 dark:[background-image:none] dark:shadow-black/45 dark:ring-teal-600/35'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white'
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${tab.dot}`} aria-hidden />
              {tab.label}
              <span
                className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active
                    ? 'bg-[#103D4D] text-white dark:bg-teal-950/80 dark:text-teal-100 dark:ring-1 dark:ring-teal-500/40'
                    : 'bg-slate-200/80 text-slate-600 dark:bg-[#141c24] dark:text-slate-200'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {sessionLoading || loading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-900 dark:border-t-teal-400" />
        </div>
      ) : sortedIds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 py-16 text-center text-slate-600 dark:border-teal-900/45 dark:bg-[#0c141c]/80 dark:text-slate-300">
          {searchQuery.trim() ||
          statusFilter !== 'active' ||
          typeFilters.length > 0 ||
          channelFilters.length > 0 ? (
            <>
              <p className="font-medium text-slate-800 dark:text-slate-100">
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
                  setTypeFilters([]);
                  setChannelFilters([]);
                }}
                className="mt-3 text-sm font-bold text-[#103D4D] underline dark:text-teal-300 dark:hover:text-teal-200"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-800 dark:text-slate-100">No projects yet</p>
              {canCreateProject ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-3 text-sm font-bold text-[#103D4D] underline dark:text-teal-300 dark:hover:text-teal-200"
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
            const clientLabel = row.client_name?.trim() || clientNameByProject[pid] || '—';
            const teamAll = teamByProject[pid] || [];
            const team = teamAll.slice(0, 4);
            const extra = Math.max(0, teamAll.length - 4);
            const dueStatus = row.deadline_date ? taskDueStatus(row.deadline_date) : null;
            const dueColors = taskDueColorClasses(dueStatus);
            const due = row.deadline_date ? formatTaskDueDate(row.deadline_date) : null;
            const unreadChat = unreadChatByProjectId[pid] || 0;
            const showQuickMenu = canUseProjectQuickMenu(profile, uid, teamAll);

            return (
              <article
                key={pid}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50/90 shadow-sm ring-1 ring-slate-200/40 transition hover:border-cyan-400/50 hover:shadow-lg hover:ring-cyan-200/50 dark:border-cyan-950/50 dark:bg-gradient-to-br dark:from-[#0d1824] dark:via-[#0a121c] dark:to-[#060a10] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.75)] dark:ring-1 dark:ring-cyan-500/15 dark:[background-image:none] dark:hover:border-cyan-500/45 dark:hover:ring-cyan-400/25"
              >
                {showQuickMenu ? (
                  <button
                    type="button"
                    data-erp-project-quick-menu-trigger
                    aria-expanded={quickMenu?.pid === pid}
                    aria-haspopup="menu"
                    aria-label={`More actions for ${row.name || 'project'}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const menuW = 220;
                      const left = Math.max(
                        8,
                        Math.min(r.right - menuW, typeof window !== 'undefined' ? window.innerWidth - menuW - 8 : 8),
                      );
                      setQuickMenu((prev) =>
                        prev?.pid === pid ? null : { pid, top: r.bottom + 6, left, width: menuW },
                      );
                    }}
                    className="absolute right-2.5 top-2.5 z-[26] inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-400/70 bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:border-cyan-500/50 hover:bg-cyan-50/90 hover:text-[#103D4D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-cyan-800/45 dark:bg-[#0f1c28] dark:text-slate-200 dark:shadow-[inset_0_1px_0_0_rgba(34,211,238,0.06)] dark:hover:border-cyan-400/55 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-50 dark:focus-visible:ring-cyan-400/50 dark:focus-visible:ring-offset-[#0a121c]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0"
                      fill="currentColor"
                      aria-hidden
                    >
                      <circle cx="12" cy="5" r="1.65" />
                      <circle cx="12" cy="12" r="1.65" />
                      <circle cx="12" cy="19" r="1.65" />
                    </svg>
                  </button>
                ) : null}
                <Link
                  href={`/erp/projects/${pid}`}
                  onClick={() => {
                    if (uid) recordProjectVisit(uid, pid);
                  }}
                  className="flex min-h-0 flex-1 flex-col p-4"
                >
                <div className={`flex items-start gap-2 ${showQuickMenu ? 'min-h-7 pr-10' : ''}`}>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      completed
                        ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80 dark:bg-violet-950/70 dark:text-violet-200 dark:ring-violet-700/45'
                        : 'bg-cyan-100 text-cyan-950 ring-1 ring-cyan-200/90 dark:bg-cyan-950/55 dark:text-cyan-100 dark:ring-cyan-600/35'
                    }`}
                  >
                    {completed ? 'Completed' : 'Active'}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    {unreadChat > 0 ? (
                      <span
                        title={`${unreadChat} unread project chat message${unreadChat === 1 ? '' : 's'}`}
                        className="inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm"
                      >
                        {unreadChat > 99 ? '99+' : unreadChat}
                      </span>
                    ) : null}
                  </div>
                </div>
                <h2 className="mt-3 line-clamp-2 text-lg font-bold text-slate-900 group-hover:text-[#103D4D] dark:text-slate-50 dark:group-hover:text-cyan-100">
                  {row.name || 'Project'}
                </h2>
                <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-300">{clientLabel}</p>
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 dark:bg-[#04080d] dark:ring-1 dark:ring-cyan-950/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-teal-500 to-[#103D4D] transition-all dark:from-cyan-400 dark:via-teal-500 dark:to-cyan-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-300">
                    {pct}% · {done}/{total || 0} tasks
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-sky-800/95 dark:text-slate-200">
                    <span className="font-semibold text-sky-900 dark:text-cyan-300/95">Time tracked</span>{' '}
                    {formatTotalTrackedSeconds(projectTimeTotals[pid] || 0)}
                  </p>
                </div>
                <div className="mt-4 flex items-end justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
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
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold text-slate-700 dark:border-[#0d1824] dark:bg-slate-700/90 dark:text-slate-100">
                        +{extra}
                      </span>
                    ) : null}
                    {team.length === 0 && !extra ? (
                      <span className="text-[11px] text-slate-400 dark:text-slate-300">No assignees</span>
                    ) : null}
                  </div>
                  <div className="flex w-full min-w-0 flex-col items-end gap-1">
                    <div className="flex w-full justify-end">
                      <ReadOnlyPriorityPill priority={rollup} size="sm" />
                    </div>
                    {due ? (
                      <span className={`w-full text-right text-[11px] tabular-nums font-semibold ${dueColors.value}`}>
                        <span className={`font-medium ${dueColors.label}`}>Due</span> {due}
                      </span>
                    ) : null}
                  </div>
                </div>
                </Link>
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

      {typeof document !== 'undefined' && quickMenu
        ? createPortal(
            <div
              data-erp-project-quick-menu-panel
              role="menu"
              aria-label="Project actions"
              className="fixed z-[380] min-w-[14rem] overflow-hidden rounded-xl border border-slate-200/95 bg-white py-1 shadow-2xl dark:border-teal-800/65 dark:bg-[#0f1a23]"
              style={{
                top: Math.max(8, Math.min(quickMenu.top, typeof window !== 'undefined' ? window.innerHeight - 220 : quickMenu.top)),
                left: quickMenu.left,
                width: quickMenu.width,
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                onClick={() => void openEditFromGrid(quickMenu.pid)}
              >
                Edit project
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={completionBusyPid === quickMenu.pid}
                className={`flex w-full items-center px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-white/[0.08] ${
                  (projectRows[quickMenu.pid] || {}).board_column === 'completed'
                    ? 'text-slate-800 dark:text-slate-100'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}
                onClick={() =>
                  void toggleProjectCompletionFromGrid(
                    quickMenu.pid,
                    (projectRows[quickMenu.pid] || {}).board_column === 'completed',
                  )
                }
              >
                {completionBusyPid === quickMenu.pid
                  ? 'Saving…'
                  : (projectRows[quickMenu.pid] || {}).board_column === 'completed'
                    ? 'Mark as active'
                    : 'Mark as complete'}
              </button>
              {canDeleteProject ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={deletingId === quickMenu.pid}
                  className="flex w-full items-center px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/35"
                  onClick={() => {
                    const id = quickMenu.pid;
                    const nm = projectRows[id]?.name || 'Project';
                    setQuickMenu(null);
                    handleDeleteProject(id, nm);
                  }}
                >
                  {deletingId === quickMenu.pid ? 'Deleting…' : 'Delete project'}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && deleteConfirm ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => (deleteConfirm?.busy ? null : setDeleteConfirm(null))}
          />
          <div
            className={`relative z-[401] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-3xl`}
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
