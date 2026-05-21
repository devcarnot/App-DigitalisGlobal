'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { groupTasksByProjectId } from '../../lib/erp-task-tree';
import {
  compareTaskPriority,
  ERP_TASK_PRIORITY_LABELS,
  ERP_TASK_PRIORITY_ORDER,
  normalizeTaskPriority,
  projectDisplayPriority,
} from '../../lib/erp-task-priority';
import { logErpActivity } from '../../lib/erp-activity-client';
import ErpTaskPriorityPicker from './ErpTaskPriorityPicker';
import { isErpGlobalAdmin, isErpManagerRole, erpProjectMemberDelegationLabel } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import ErpAddProjectModal from './ErpAddProjectModalDynamic';
import ErpUserAvatar from './ErpUserAvatar';
import ErpFilterMultiSelect from './ErpFilterMultiSelect';
import ErpNativeSelect, { ERP_FILTER_SELECT_CLASS } from './ErpNativeSelect';
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
  isProjectPinned,
  pinProject,
  readPinnedProjects,
  subscribePinnedProjects,
  togglePinProject,
  unpinProject,
} from '../../lib/erp-pinned-projects';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
} from '../../lib/erp-list-search';
import { workloadOpenAssignedChildMatchesTaskDueMode } from '../../lib/erp-assigned-workload-tasks';
import { ERP_WORKSPACE_SYNC, workspaceSyncTouchesScope } from '../../lib/erp-workspace-sync-events';
import { ERP_GRID_TASKS_PER_CHUNK_MAX } from '../../lib/erp-query-limits';

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
    m.includes('created_at') ||
    m.includes('updated_at') ||
    m.includes('priority') ||
    m.includes('schema cache')
  );
}

const PROJECT_SORT_STORAGE_KEY = 'erp:projectsGridSort';

const PROJECT_SORT_OPTIONS = [
  { id: 'recent', label: 'Recently opened' },
  { id: 'pinned', label: 'Pinned first' },
  { id: 'priority_high', label: 'Priority (urgent first)' },
  { id: 'priority_low', label: 'Priority (low first)' },
  { id: 'newest', label: 'Created (newest)' },
  { id: 'oldest', label: 'Created (oldest)' },
  { id: 'updated_newest', label: 'Updated (newest)' },
  { id: 'updated_oldest', label: 'Updated (oldest)' },
  { id: 'due_asc', label: 'Due date (soonest)' },
  { id: 'due_desc', label: 'Due date (latest)' },
  { id: 'name_asc', label: 'Name (A–Z)' },
  { id: 'name_desc', label: 'Name (Z–A)' },
  { id: 'time_desc', label: 'Time tracked (most)' },
  { id: 'time_asc', label: 'Time tracked (least)' },
];

const PRIORITY_FILTER_OPTIONS = ERP_TASK_PRIORITY_ORDER.map((id) => ({
  id,
  label: ERP_TASK_PRIORITY_LABELS[id],
}));

function readProjectSortPreference() {
  if (typeof window === 'undefined') return 'recent';
  try {
    const v = window.localStorage.getItem(PROJECT_SORT_STORAGE_KEY);
    return PROJECT_SORT_OPTIONS.some((o) => o.id === v) ? v : 'recent';
  } catch {
    return 'recent';
  }
}

function projectCreatedTime(row) {
  return row?.created_at ? new Date(row.created_at).getTime() : 0;
}

function projectDueTime(row) {
  const raw = row?.deadline_date;
  const dt = raw ? parseDateOnlyLocal(raw) : null;
  return dt ? startOfLocalDay(dt).getTime() : Number.POSITIVE_INFINITY;
}

function projectUpdatedTime(row) {
  const raw = row?.updated_at || row?.created_at;
  return raw ? new Date(raw).getTime() : 0;
}

function IconPin({ filled = false, className = 'h-3.5 w-3.5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
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
  const [projectSort, setProjectSort] = useState(readProjectSortPreference);
  /** Empty = no restriction (labeled "All types" / "All channels"). */
  const [typeFilters, setTypeFilters] = useState([]);
  const [channelFilters, setChannelFilters] = useState([]);
  const [priorityFilters, setPriorityFilters] = useState([]);
  const [pinnedOnlyFilter, setPinnedOnlyFilter] = useState(false);
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
  const [pinnedIds, setPinnedIds] = useState([]);
  /** Dropdown from ⋮ — { pid: string } only; anchored with fixed coords from button rect. */
  const [quickMenu, setQuickMenu] = useState(null);
  const [completionBusyPid, setCompletionBusyPid] = useState(null);
  const [priorityBusyPid, setPriorityBusyPid] = useState(null);

  useEffect(() => {
    if (!uid) {
      setRecentVisits({});
      setPinnedIds([]);
      return undefined;
    }
    setRecentVisits(readRecentProjects(uid));
    setPinnedIds(readPinnedProjects(uid));
    const unsubRecent = subscribeRecentProjects(uid, setRecentVisits);
    const unsubPinned = subscribePinnedProjects(uid, setPinnedIds);
    return () => {
      unsubRecent();
      unsubPinned();
    };
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

      // ────────────────────────────────────────────────────────────────────
      // All of the per-project fetches below are independent: the projects
      // grid only needs them to render rows. We fan them out in parallel via
      // `Promise.all` (instead of awaiting each one in turn) so the cold
      // load of /erp/projects feels closer to the slowest single query
      // rather than the sum of all of them. Each block is wrapped in its
      // own async function so the chunk-loop semantics don't change.
      // ────────────────────────────────────────────────────────────────────
      const CHUNK = 80;
      const TCHUNK = 60;

      const fetchChannels = async () => {
        const channelsMap = {};
        const channelSet = new Set();
        const slices = [];
        for (let i = 0; i < ids.length; i += 120) slices.push(ids.slice(i, i + 120));
        const results = await Promise.all(
          slices.map((slice) =>
            supabase
              .from('erp_project_channels')
              .select('project_id, name')
              .in('project_id', slice)
              .limit(1000),
          ),
        );
        for (const { data: chans, error: chErr } of results) {
          if (chErr) continue; // table may be missing — non-fatal
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
        return { channelsMap, channelNames: [...channelSet].sort((a, b) => a.localeCompare(b)) };
      };

      const buildProjectSelectCols = (extended, withPriority) => {
        const parts = ['id', 'name', 'deadline_date', 'board_column', 'updated_at'];
        if (extended) {
          parts.push(
            'client_name',
            'lead_source',
            'project_type',
            'project_type_ids',
            'created_at',
          );
        } else {
          parts.push('created_at');
        }
        if (withPriority) parts.push('priority');
        return parts.join(', ');
      };

      const fetchProjectDetails = async () => {
        const details = {};
        let extendedCols = true;
        let hasPriorityCol = true;
        // First slice: probe extended columns; fall back if missing.
        const headSlice = ids.slice(0, CHUNK);
        const headExtended = await supabase
          .from('erp_projects')
          .select(buildProjectSelectCols(true, true))
          .in('id', headSlice)
          .is('deleted_at', null);
        let firstRows = headExtended.data;
        if (headExtended.error) {
          if (isMissingOptionalColumnError(headExtended.error)) {
            const withoutPriority = await supabase
              .from('erp_projects')
              .select(buildProjectSelectCols(true, false))
              .in('id', headSlice)
              .is('deleted_at', null);
            if (!withoutPriority.error) {
              hasPriorityCol = false;
              firstRows = withoutPriority.data;
            } else {
              extendedCols = false;
              hasPriorityCol = false;
              const fallback = await supabase
                .from('erp_projects')
                .select(buildProjectSelectCols(false, false))
                .in('id', headSlice)
                .is('deleted_at', null);
              if (fallback.error) throw new Error(fallback.error.message);
              firstRows = fallback.data;
            }
          } else {
            throw new Error(headExtended.error.message);
          }
        }

        const cols = buildProjectSelectCols(extendedCols, hasPriorityCol);
        const restSlices = [];
        for (let i = CHUNK; i < ids.length; i += CHUNK) restSlices.push(ids.slice(i, i + CHUNK));
        const restResults = await Promise.all(
          restSlices.map((slice) =>
            supabase.from('erp_projects').select(cols).in('id', slice).is('deleted_at', null),
          ),
        );
        const allRows = [...(firstRows || [])];
        for (const r of restResults) {
          if (r.error) throw new Error(r.error.message);
          allRows.push(...(r.data || []));
        }

        for (const p of allRows) {
          if (!p?.id) continue;
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
            created_at: p.created_at ?? null,
            updated_at: p.updated_at ?? p.created_at ?? null,
            priority: hasPriorityCol ? normalizeTaskPriority(p.priority) : 'medium',
          };
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
              created_at: null,
              updated_at: null,
              priority: 'medium',
            };
          }
        }
        return details;
      };

      const fetchTasks = async () => {
        const slices = [];
        for (let i = 0; i < ids.length; i += TCHUNK) slices.push(ids.slice(i, i + TCHUNK));
        const results = await Promise.all(
          slices.map((slice) =>
            supabase
              .from('erp_tasks')
              .select(
                'id, title, status, priority, parent_task_id, project_id, created_at, assignee_id, assignee_ids, due_date',
              )
              .in('project_id', slice)
              .order('created_at', { ascending: false })
              .limit(ERP_GRID_TASKS_PER_CHUNK_MAX),
          ),
        );
        const flat = [];
        for (const { data: trows, error: tErr } of results) {
          if (tErr) throw new Error(tErr.message);
          flat.push(...(trows || []));
        }
        return groupTasksByProjectId(flat);
      };

      const fetchMembers = async () => {
        const teamMap = {};
        const clientMap = {};
        // 1. Pull every membership row in parallel.
        const memSlices = [];
        for (let i = 0; i < ids.length; i += CHUNK) memSlices.push(ids.slice(i, i + CHUNK));
        const memResults = await Promise.all(
          memSlices.map((slice) =>
            supabase.from('erp_project_members').select('project_id, user_id, role').in('project_id', slice),
          ),
        );
        const allMems = [];
        for (const { data: mems, error: memErr } of memResults) {
          if (memErr) throw new Error(memErr.message);
          allMems.push(...(mems || []));
        }
        // 2. Collect every unique uid first, then fetch profiles in parallel
        //    chunks. Previously we did this nested *inside* the membership
        //    loop which serialised everything.
        const uniqueUids = [...new Set(allMems.map((m) => m.user_id).filter(Boolean))];
        const names = {};
        const profileRowById = {};
        const uidSlices = [];
        for (let j = 0; j < uniqueUids.length; j += 80) uidSlices.push(uniqueUids.slice(j, j + 80));
        const profResults = await Promise.all(
          uidSlices.map((us) =>
            supabase
              .from('erp_profiles')
              .select('id, full_name, avatar_path, role, member_team')
              .in('id', us),
          ),
        );
        for (const { data: profs } of profResults) {
          for (const p of profs || []) {
            if (!p?.id) continue;
            names[p.id] = (p.full_name && String(p.full_name).trim()) || 'Member';
            profileRowById[p.id] = {
              id: p.id,
              full_name: p.full_name,
              avatar_path: p.avatar_path ?? null,
              role: p.role ?? null,
              member_team: p.member_team ?? null,
            };
          }
        }
        // 3. Fold into per-project shape.
        for (const m of allMems) {
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
        return { teamMap, clientMap };
      };

      const fetchTimeTotals = async () => {
        const slices = [];
        for (let i = 0; i < ids.length; i += CHUNK) slices.push(ids.slice(i, i + CHUNK));
        const results = await Promise.all(
          slices.map((slice) =>
            supabase.rpc('erp_project_time_totals', { p_project_ids: slice }),
          ),
        );
        const timeTotals = {};
        const fallbackSlices = [];
        for (let i = 0; i < results.length; i += 1) {
          const r = results[i];
          if (!r.error && Array.isArray(r.data)) {
            for (const row of r.data) {
              const pid = row?.project_id;
              if (!pid) continue;
              timeTotals[pid] = Number(row?.total_seconds) || 0;
            }
          } else {
            fallbackSlices.push(slices[i]);
          }
        }
        if (fallbackSlices.length) {
          const fallbackRes = await Promise.all(
            fallbackSlices.map((slice) =>
              supabase
                .from('erp_project_time_logs')
                .select('project_id, duration_seconds')
                .in('project_id', slice),
            ),
          );
          for (const { data: logRows } of fallbackRes) {
            for (const r of logRows || []) {
              const pid = r.project_id;
              if (!pid) continue;
              timeTotals[pid] = (timeTotals[pid] || 0) + (Number(r.duration_seconds) || 0);
            }
          }
        }
        return timeTotals;
      };

      const fetchUnreadChat = async () => {
        if (!user?.id) return {};
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
          if (!String(n?.link || '').includes('channel=')) continue;
          counts[pid] = (counts[pid] || 0) + 1;
        }
        return counts;
      };

      // Fan out everything in parallel. Failures in any one section bubble
      // up to the caller's catch and surface as `error`.
      const [
        { channelsMap, channelNames: channelNameList },
        details,
        tasksByProj,
        { teamMap, clientMap },
        timeTotals,
        unreadCounts,
      ] = await Promise.all([
        fetchChannels(),
        fetchProjectDetails(),
        fetchTasks(),
        fetchMembers(),
        fetchTimeTotals(),
        fetchUnreadChat(),
      ]);

      setChannelNamesByProject(channelsMap);
      setChannelNames(channelNameList);
      setProjectRows(details);
      setTasksByProject(tasksByProj);
      setTeamByProject(teamMap);
      setClientNameByProject(clientMap);
      setProjectTimeTotals(timeTotals);
      setUnreadChatByProjectId(unreadCounts);
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
      if (priorityFilters.length) {
        const pri = projectDisplayPriority(row);
        if (!priorityFilters.includes(pri)) return false;
      }
      if (pinnedOnlyFilter && !isProjectPinned(uid, pid, pinnedIds)) return false;
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
    priorityFilters,
    pinnedOnlyFilter,
    pinnedIds,
    uid,
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
      if (priorityFilters.length) {
        const pri = projectDisplayPriority(row);
        if (!priorityFilters.includes(pri)) continue;
      }
      if (pinnedOnlyFilter && !isProjectPinned(uid, pid, pinnedIds)) continue;
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
    priorityFilters,
    pinnedOnlyFilter,
    pinnedIds,
    uid,
  ]);

  const sortedIds = useMemo(() => {
    const pinRank = (id) => {
      const i = pinnedIds.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const priorityThenName = (a, b) => {
      const pr = compareTaskPriority(
        projectDisplayPriority(projectRows[a]),
        projectDisplayPriority(projectRows[b]),
      );
      if (pr !== 0) return pr;
      return (projectRows[a]?.name || '').localeCompare(projectRows[b]?.name || '');
    };
    const pinnedFirst = (a, b) => {
      const pa = pinRank(a);
      const pb = pinRank(b);
      if (pa !== pb) return pa - pb;
      return 0;
    };

    return [...visibleIds].sort((a, b) => {
      const rowA = projectRows[a] || {};
      const rowB = projectRows[b] || {};

      const pinCmp = pinnedFirst(a, b);
      if (pinCmp !== 0) return pinCmp;

      if (projectSort === 'pinned') {
        return priorityThenName(a, b);
      }
      if (projectSort === 'priority_high') {
        const pr = compareTaskPriority(
          projectDisplayPriority(rowA),
          projectDisplayPriority(rowB),
        );
        if (pr !== 0) return pr;
        return (rowA.name || '').localeCompare(rowB.name || '');
      }
      if (projectSort === 'priority_low') {
        const pr = compareTaskPriority(
          projectDisplayPriority(rowB),
          projectDisplayPriority(rowA),
        );
        if (pr !== 0) return pr;
        return (rowA.name || '').localeCompare(rowB.name || '');
      }
      if (projectSort === 'updated_newest') {
        const c = projectUpdatedTime(rowB) - projectUpdatedTime(rowA);
        return c !== 0 ? c : priorityThenName(a, b);
      }
      if (projectSort === 'updated_oldest') {
        const c = projectUpdatedTime(rowA) - projectUpdatedTime(rowB);
        return c !== 0 ? c : priorityThenName(a, b);
      }
      if (projectSort === 'newest') {
        const c = projectCreatedTime(rowB) - projectCreatedTime(rowA);
        return c !== 0 ? c : priorityThenName(a, b);
      }
      if (projectSort === 'oldest') {
        const c = projectCreatedTime(rowA) - projectCreatedTime(rowB);
        return c !== 0 ? c : priorityThenName(a, b);
      }
      if (projectSort === 'due_asc') {
        const da = projectDueTime(rowA);
        const db = projectDueTime(rowB);
        if (da !== db) return da - db;
        return priorityThenName(a, b);
      }
      if (projectSort === 'due_desc') {
        const da = projectDueTime(rowA);
        const db = projectDueTime(rowB);
        const fa = da === Number.POSITIVE_INFINITY ? -1 : da;
        const fb = db === Number.POSITIVE_INFINITY ? -1 : db;
        if (fa !== fb) return fb - fa;
        return priorityThenName(a, b);
      }
      if (projectSort === 'name_asc') {
        return (rowA.name || '').localeCompare(rowB.name || '');
      }
      if (projectSort === 'name_desc') {
        return (rowB.name || '').localeCompare(rowA.name || '');
      }
      if (projectSort === 'time_desc') {
        const ta = projectTimeTotals[a] || 0;
        const tb = projectTimeTotals[b] || 0;
        if (ta !== tb) return tb - ta;
        return priorityThenName(a, b);
      }
      if (projectSort === 'time_asc') {
        const ta = projectTimeTotals[a] || 0;
        const tb = projectTimeTotals[b] || 0;
        if (ta !== tb) return ta - tb;
        return priorityThenName(a, b);
      }

      // Default: recently opened on this device, then priority + name.
      const ra = recentVisits[a] || 0;
      const rb = recentVisits[b] || 0;
      if (ra !== rb) return rb - ra;
      return priorityThenName(a, b);
    });
  }, [visibleIds, projectRows, recentVisits, projectSort, projectTimeTotals, pinnedIds]);

  const setProjectPriorityFromGrid = useCallback(
    async (pid, priority) => {
      if (!pid) return;
      const p = normalizeTaskPriority(priority);
      setError('');
      setPriorityBusyPid(pid);
      setProjectRows((prev) => ({
        ...prev,
        [pid]: { ...(prev[pid] || {}), priority: p },
      }));
      const now = new Date().toISOString();
      try {
        const { error: projErr } = await supabase
          .from('erp_projects')
          .update({ priority: p, updated_at: now })
          .eq('id', pid);
        if (projErr) throw projErr;

        const taskList = tasksByProject[pid] || [];
        if (taskList.length > 0) {
          const { error: taskErr } = await supabase
            .from('erp_tasks')
            .update({ priority: p, updated_at: now })
            .eq('project_id', pid);
          if (taskErr) throw taskErr;
          setTasksByProject((prev) => {
            const list = prev[pid] || [];
            return {
              ...prev,
              [pid]: list.map((t) => ({ ...t, priority: p })),
            };
          });
        }

        if (uid) {
          void logErpActivity({
            projectId: pid,
            userId: uid,
            action: taskList.length > 0 ? 'bulk_task_priority_set' : 'project_priority_set',
            meta: { priority: p, task_count: taskList.length },
          });
        }
      } catch (ex) {
        const msg = ex?.message || 'Could not update project priority';
        setError(/priority|schema cache/i.test(msg) ? `${msg} Run migration 20260529120000_erp_projects_priority.sql.` : msg);
        void load();
      } finally {
        setPriorityBusyPid(null);
      }
    },
    [tasksByProject, uid, load],
  );

  const handleTogglePin = useCallback(
    (pid, e) => {
      if (!uid || !pid) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setPinnedIds(togglePinProject(uid, pid));
    },
    [uid],
  );

  const onProjectSortChange = useCallback((e) => {
    const next = e.target.value;
    if (!PROJECT_SORT_OPTIONS.some((o) => o.id === next)) return;
    setProjectSort(next);
    try {
      window.localStorage.setItem(PROJECT_SORT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

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
    <div className="w-full min-h-0 space-y-6">
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
          <label className="sr-only" htmlFor="erp-project-priority-filter">
            Filter by priority
          </label>
          <ErpFilterMultiSelect
            id="erp-project-priority-filter"
            placeholder="All priorities"
            options={PRIORITY_FILTER_OPTIONS}
            value={priorityFilters}
            onChange={setPriorityFilters}
          />
          <button
            type="button"
            aria-pressed={pinnedOnlyFilter}
            onClick={() => setPinnedOnlyFilter((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
              pinnedOnlyFilter
                ? 'border-amber-400/70 bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-200/80 dark:border-amber-500/45 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700/35'
                : 'border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 dark:border-teal-900/50 dark:bg-[#0f1c28] dark:text-slate-300 dark:hover:border-teal-700/50'
            }`}
          >
            <IconPin filled={pinnedOnlyFilter} className="h-3.5 w-3.5" />
            Pinned
          </button>
          {canCreateProject ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl erp-brand-fill px-4 py-2.5 text-sm font-bold text-white shadow-md"
            >
              <span className="text-lg leading-none">+</span>
              New Project
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex w-full max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-teal-900/55 dark:bg-[#050a0f] dark:ring-teal-950/40 dark:[background-image:none] sm:inline-flex sm:w-auto"
          role="tablist"
          aria-label="Project status"
        >
          {[
            { id: 'active', label: 'Active', dot: 'bg-emerald-500', count: statusTabCounts.active },
            { id: 'completed', label: 'Completed', dot: 'bg-violet-500', count: statusTabCounts.completed },
            { id: 'all', label: 'All', dot: 'erp-brand-fill', count: statusTabCounts.all },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(tab.id)}
                className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition sm:min-w-[7.5rem] sm:flex-none sm:px-4 ${
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
                      ? 'erp-brand-fill text-white ring-1 ring-white/35 dark:text-white dark:ring-teal-400/35'
                      : 'bg-slate-200/80 text-slate-600 dark:bg-[#141c24] dark:text-slate-200'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-full min-w-[12rem] max-w-[18rem] shrink-0 sm:w-[17.5rem]">
          <label htmlFor="erp-projects-sort" className="sr-only">
            Sort projects
          </label>
          <ErpNativeSelect
            id="erp-projects-sort"
            value={projectSort}
            onChange={onProjectSortChange}
            aria-label="Sort projects"
            wrapperClassName="w-full"
            className={`${ERP_FILTER_SELECT_CLASS} !w-full !py-2`}
          >
            {PROJECT_SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </ErpNativeSelect>
        </div>
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
          channelFilters.length > 0 ||
          priorityFilters.length > 0 ||
          pinnedOnlyFilter ? (
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
                  setPriorityFilters([]);
                  setPinnedOnlyFilter(false);
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
        <div className="grid auto-rows-min grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedIds.map((pid) => {
            const row = projectRows[pid] || {};
            const tasks = tasksByProject[pid] || [];
            const { total, done, pct } = taskProgress(tasks);
            const displayPri = projectDisplayPriority(row);
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
            const pinned = isProjectPinned(uid, pid, pinnedIds);

            return (
              <article
                key={pid}
                className={`group relative flex w-full flex-col self-start overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-slate-50/90 shadow-sm ring-1 transition hover:border-cyan-400/50 hover:shadow-lg hover:ring-cyan-200/50 dark:bg-gradient-to-br dark:from-[#0d1824] dark:via-[#0a121c] dark:to-[#060a10] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.75)] dark:ring-1 dark:[background-image:none] dark:hover:border-cyan-500/45 dark:hover:ring-cyan-400/25 ${
                  pinned
                    ? 'border-amber-300/80 ring-amber-200/60 dark:border-amber-600/40 dark:ring-amber-500/25'
                    : 'border-slate-200/90 ring-slate-200/40 dark:border-cyan-950/50 dark:ring-cyan-500/15'
                }`}
              >
                <Link
                  href={`/erp/projects/${pid}`}
                  onClick={() => {
                    if (uid) recordProjectVisit(uid, pid);
                  }}
                  className="flex flex-col p-4"
                >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      completed
                        ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80 dark:bg-violet-950/70 dark:text-violet-200 dark:ring-violet-700/45'
                        : 'bg-cyan-100 text-cyan-950 ring-1 ring-cyan-200/90 dark:bg-cyan-950/55 dark:text-cyan-100 dark:ring-cyan-600/35'
                    }`}
                  >
                    {completed ? 'Completed' : 'Active'}
                  </span>
                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    {unreadChat > 0 ? (
                      <span
                        title={`${unreadChat} unread project chat message${unreadChat === 1 ? '' : 's'}`}
                        className="inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm"
                      >
                        {unreadChat > 99 ? '99+' : unreadChat}
                      </span>
                    ) : null}
                    {uid ? (
                      <button
                        type="button"
                        aria-label={pinned ? 'Unpin project' : 'Pin project'}
                        title={pinned ? 'Unpin' : 'Pin to top'}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleTogglePin(pid, e)}
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${
                          pinned
                            ? 'border-amber-400/70 bg-amber-50 text-amber-600 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'border-slate-400/70 bg-white text-slate-500 hover:border-amber-400/50 hover:text-amber-600 dark:border-cyan-800/45 dark:bg-[#0f1c28] dark:text-slate-400 dark:hover:text-amber-300'
                        }`}
                      >
                        <IconPin filled={pinned} />
                      </button>
                    ) : null}
                    {showQuickMenu ? (
                      <button
                        type="button"
                        data-erp-project-quick-menu-trigger
                        aria-expanded={quickMenu?.pid === pid}
                        aria-haspopup="menu"
                        aria-label={`More actions for ${row.name || 'project'}`}
                        onPointerDown={(e) => e.stopPropagation()}
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
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-400/70 bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:border-cyan-500/50 hover:bg-cyan-50/90 hover:text-[#103D4D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-cyan-800/45 dark:bg-[#0f1c28] dark:text-slate-200 dark:shadow-[inset_0_1px_0_0_rgba(34,211,238,0.06)] dark:hover:border-cyan-400/55 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-50 dark:focus-visible:ring-cyan-400/50 dark:focus-visible:ring-offset-[#0a121c]"
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
                  </div>
                </div>
                <h2 className="mt-3 line-clamp-2 text-lg font-bold text-slate-900 group-hover:text-[#103D4D] dark:text-slate-50 dark:group-hover:text-cyan-100">
                  {row.name || 'Project'}
                </h2>
                <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-300">{clientLabel}</p>
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 dark:bg-[#04080d] dark:ring-1 dark:ring-cyan-950/60">
                    <div
                      className="h-full rounded-full erp-brand-fill transition-all"
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
                  <div
                    className="flex min-w-0 flex-col items-end gap-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {showQuickMenu ? (
                      <ErpTaskPriorityPicker
                        value={displayPri}
                        disabled={priorityBusyPid === pid}
                        size="xs"
                        ariaLabel={`Priority for ${row.name || 'project'}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(next) => void setProjectPriorityFromGrid(pid, next)}
                      />
                    ) : null}
                    {due ? (
                      <span className={`text-right text-[11px] tabular-nums font-semibold ${dueColors.value}`}>
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
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Set priority
              </p>
              {ERP_TASK_PRIORITY_ORDER.map((priId) => (
                <button
                  key={priId}
                  type="button"
                  role="menuitem"
                  disabled={priorityBusyPid === quickMenu.pid}
                  className="flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                  onClick={() => {
                    const id = quickMenu.pid;
                    setQuickMenu(null);
                    void setProjectPriorityFromGrid(id, priId);
                  }}
                >
                  {ERP_TASK_PRIORITY_LABELS[priId]}
                </button>
              ))}
              <div className="my-1 border-t border-slate-100 dark:border-teal-900/40" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                onClick={() => {
                  const id = quickMenu.pid;
                  const isPinned = isProjectPinned(uid, id, pinnedIds);
                  setQuickMenu(null);
                  setPinnedIds(isPinned ? unpinProject(uid, id) : pinProject(uid, id));
                }}
              >
                <IconPin filled={isProjectPinned(uid, quickMenu.pid, pinnedIds)} className="h-4 w-4 shrink-0 text-amber-500" />
                {isProjectPinned(uid, quickMenu.pid, pinnedIds) ? 'Unpin from top' : 'Pin to top'}
              </button>
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
