'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  parseDateOnlyLocal,
  startOfLocalDay,
  formatTaskDueDate,
  taskDueColorClasses,
  taskDueStatus,
} from '../../lib/task-dates';
import { groupTasksByProjectId } from '../../lib/erp-task-tree';
import { compareTaskPriority, normalizeTaskPriority } from '../../lib/erp-task-priority';
import { ERP_TASK_STATUS_LABELS, normalizeTaskStatus } from '../../lib/erp-task-status';
import { logErpTaskStatusChange } from '../../lib/erp-activity-client';
import { normalizeBoardColumn } from '../../lib/erp-project-pipeline';
import { isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import ProjectBulkPriorityContextMenu from './ProjectBulkPriorityContextMenu';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpAddMainTaskModal from './ErpAddMainTaskModal';
import ErpAddProjectModal from './ErpAddProjectModal';
import { ERP_LIST_SEARCH_INPUT_CLASS } from '../../lib/erp-list-search';
import { ERP_DARK_PRIMARY_BUTTON } from '../../lib/erp-dark-surfaces';
import { ERP_PROJECT_TYPES } from '../../lib/erp-project-types';
import ErpNativeSelect from './ErpNativeSelect';
import { ERP_WORKSPACE_SYNC, workspaceSyncTouchesScope } from '../../lib/erp-workspace-sync-events';

const MAIN_TASK_VIEW_KEY = 'erp:subtaskViewMode';

function startOfDay(d) {
  return startOfLocalDay(d);
}

function cardTone(key) {
  /** Light: soft gradient. Dark: flat fill so no leftover light grey band. */
  const lightOpen =
    'ring-slate-400/30 border border-slate-300/35 bg-gradient-to-b from-slate-100/95 to-slate-50/85 dark:border-slate-700/55 dark:ring-slate-600/25 dark:[background-image:none] dark:bg-[#0e1824]';
  const darkByKey = {
    open: '',
    in_progress:
      ' dark:[background-image:none] dark:bg-[#0c1824] dark:border-cyan-900/45 dark:ring-cyan-900/25',
    in_review:
      ' dark:[background-image:none] dark:bg-[#140f1a] dark:border-violet-900/40 dark:ring-violet-900/25',
    done: ' dark:[background-image:none] dark:bg-[#0a1814] dark:border-emerald-900/35 dark:ring-emerald-900/20',
    cancelled: ' dark:[background-image:none] dark:bg-[#1a1014] dark:border-rose-900/40 dark:ring-rose-900/25',
  };
  if (key === 'open') return `${lightOpen}${darkByKey.open}`;
  if (key === 'in_progress')
    return `ring-sky-400/35 bg-gradient-to-b from-sky-100/90 to-cyan-50/75 border border-sky-300/40 dark:ring-sky-900/20${darkByKey.in_progress}`;
  if (key === 'in_review')
    return `ring-violet-400/35 bg-gradient-to-b from-violet-100/85 to-fuchsia-50/55 border border-violet-300/40 dark:ring-violet-900/20${darkByKey.in_review}`;
  if (key === 'done')
    return `ring-emerald-400/30 bg-gradient-to-b from-emerald-100/90 to-teal-50/70 border border-emerald-300/40 dark:ring-emerald-900/20${darkByKey.done}`;
  return `ring-rose-400/30 bg-gradient-to-b from-rose-100/85 to-red-50/60 border border-rose-300/35 dark:ring-rose-900/20${darkByKey.cancelled}`;
}

/** Light: gradient strip. Dark: flat solid (no glossy header band). */
function columnHeaderClass(key) {
  if (key === 'open')
    return 'bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white shadow-md shadow-slate-900/20 dark:bg-[#283240] dark:[background-image:none]';
  if (key === 'in_progress')
    return 'bg-gradient-to-r from-sky-900 via-cyan-800 to-teal-900 text-white shadow-md shadow-cyan-900/25 dark:bg-[#105a6b] dark:[background-image:none]';
  if (key === 'in_review')
    return 'bg-gradient-to-r from-violet-900 via-indigo-900 to-violet-950 text-white shadow-md shadow-violet-900/25 dark:bg-[#2d2345] dark:[background-image:none]';
  if (key === 'done')
    return 'bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 text-emerald-50 shadow-md shadow-emerald-900/20 dark:bg-[#174030] dark:text-emerald-100 dark:[background-image:none]';
  return 'bg-gradient-to-r from-rose-900 via-rose-950 to-red-900 text-rose-50 shadow-md shadow-rose-900/25 dark:bg-[#4a1e28] dark:text-rose-100 dark:[background-image:none]';
}

const COLUMNS = [
  { id: 'open', title: ERP_TASK_STATUS_LABELS.open || 'Open' },
  { id: 'in_progress', title: ERP_TASK_STATUS_LABELS.in_progress || 'In progress' },
  { id: 'in_review', title: ERP_TASK_STATUS_LABELS.in_review || 'In review' },
  { id: 'done', title: ERP_TASK_STATUS_LABELS.done || 'Completed' },
  { id: 'cancelled', title: ERP_TASK_STATUS_LABELS.cancelled || 'Cancelled' },
];

export default function MyTasksBoard({ embedded = false, standalonePage = false }) {
  const { profile, session } = useErpSession();
  const tasksTitle = profile?.role === 'client' ? 'Task' : 'My tasks';
  const [loadedWorkspaceRole, setLoadedWorkspaceRole] = useState(null);
  /** Drag deadlines, bulk priority: managers (admin or team lead) on projects they can see. */
  const isWorkspaceAdmin = isErpManagerRole(profile?.role) || isErpManagerRole(loadedWorkspaceRole);
  const canCreateProject = isErpManagerRole(profile?.role);
  const [priorityMenu, setPriorityMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectIds, setProjectIds] = useState([]);
  /** @type {Record<string, { name: string, start_date: string | null, deadline_date: string | null, board_column: string | null }>} */
  const [projectDetails, setProjectDetails] = useState({});
  /** @type {Record<string, { id: string, title: string, status: string, priority: string, parent_task_id: string | null, project_id: string, created_at?: string }[]>} */
  const [tasksByProject, setTasksByProject] = useState({});
  const [dropTargetCol, setDropTargetCol] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [movingTaskId, setMovingTaskId] = useState(null);
  const [mainTaskViewMode, setMainTaskViewMode] = useState('kanban');
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  /** 'mine' = only tasks assigned to me; 'team' = every task in projects I can see.
   *  Default 'mine' so the board no longer shows every task in a project. */
  const [taskScope, setTaskScope] = useState('mine');
  const tasksBoardHiddenAtRef = useRef(null);

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(MAIN_TASK_VIEW_KEY);
      if (v === 'list' || v === 'kanban') setMainTaskViewMode(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setMainTaskViewModePersist = useCallback((mode) => {
    setMainTaskViewMode(mode);
    try {
      sessionStorage.setItem(MAIN_TASK_VIEW_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData?.session?.user;
      if (!user?.id) {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        user = authData?.user;
        if (authErr || !user?.id) {
          setError(authErr?.message || 'Sign in required');
          setProjectIds([]);
          setProjectDetails({});
          setTasksByProject({});
          setLoadedWorkspaceRole(null);
          return;
        }
      }

      const { data: profRow } = await supabase.from('erp_profiles').select('role').eq('id', user.id).maybeSingle();
      const workspaceRole = profRow?.role;
      setLoadedWorkspaceRole(workspaceRole ?? null);

      if (!isErpGlobalAdmin(workspaceRole)) {
        await erpAuthorizedFetch('/api/erp/me/sync-project-memberships', { method: 'POST' }).catch(() => {});
      }

      let ids = [];
      if (isErpGlobalAdmin(workspaceRole)) {
        const { data: allProjs, error: apErr } = await supabase
          .from('erp_projects')
          .select('id')
          .order('name', { ascending: true })
          .limit(500);
        if (apErr) {
          setError(apErr.message);
          return;
        }
        ids = (allProjs || []).map((p) => p.id).filter(Boolean);
      } else {
        const { data: myMems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', user.id)
          .limit(500);
        if (memErr) {
          setError(memErr.message);
          return;
        }
        ids = [...new Set((myMems || []).map((m) => m.project_id).filter(Boolean))];
      }

      setProjectIds(ids);

      if (ids.length === 0) {
        setProjectDetails({});
        setTasksByProject({});
        return;
      }

      const detailsMap = {};
      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: projs, error: pErr } = await supabase
          .from('erp_projects')
          .select('id, name, project_type, project_type_ids, board_column')
          .in('id', slice);
        if (pErr) {
          setError(pErr.message);
          break;
        }
        (projs || []).forEach((p) => {
          if (!p?.id) return;
          const typeIdsRaw = Array.isArray(p.project_type_ids) ? p.project_type_ids : null;
          const legacyType = p.project_type || 'custom';
          const typeIds = typeIdsRaw && typeIdsRaw.length ? typeIdsRaw : [legacyType];
          detailsMap[p.id] = {
            name: p.name || 'Project',
            project_type: legacyType,
            project_type_ids: typeIds,
            board_column: p.board_column ?? null,
          };
        });
      }

      for (const pid of ids) {
        if (!detailsMap[pid]) {
          detailsMap[pid] = {
            name: 'Project',
            project_type: 'custom',
            project_type_ids: ['custom'],
            board_column: null,
          };
        }
      }

      setProjectDetails(detailsMap);

      const flatTasks = [];
      const TCHUNK = 60;
      for (let i = 0; i < ids.length; i += TCHUNK) {
        const slice = ids.slice(i, i + TCHUNK);
        const { data: trows, error: tErr } = await supabase
          .from('erp_tasks')
          .select('id, title, status, priority, parent_task_id, project_id, created_at, due_date, start_date, assignee_id, assignee_ids')
          .in('project_id', slice);
        if (tErr) {
          setError(tErr.message);
          break;
        }
        flatTasks.push(...(trows || []));
      }
      setTasksByProject(groupTasksByProjectId(flatTasks));
    } catch (e) {
      setError(e?.message || 'Something went wrong loading projects');
      setProjectIds([]);
      setProjectDetails({});
      setTasksByProject({});
      setLoadedWorkspaceRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        tasksBoardHiddenAtRef.current = Date.now();
        return;
      }
      const t0 = tasksBoardHiddenAtRef.current;
      tasksBoardHiddenAtRef.current = null;
      const hiddenMs = t0 ? Date.now() - t0 : 0;
      // Short switch to another app: keep board as-is (interval still refreshes).
      if (hiddenMs < 20000) return;
      void load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    const onWorkspaceSync = (e) => {
      const d = e?.detail;
      if (
        workspaceSyncTouchesScope(d, 'tasks') ||
        workspaceSyncTouchesScope(d, 'projects')
      ) {
        void load(true);
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

  /**
   * Flat list of "work" tasks (rows whose parent_task_id is set — real tasks,
   * not the hidden project anchor row), filtered by search + project type.
   * @type {{ id: string, title: string, status: string, priority: string, project_id: string, due_date?: string | null, start_date?: string | null, created_at?: string }[]}
   */
  const currentUserId = session?.user?.id || null;

  /** A task is "mine" when I'm the single assignee OR I appear in assignee_ids. */
  const isTaskAssignedToMe = useCallback(
    (t) => {
      if (!currentUserId) return false;
      if (t?.assignee_id && t.assignee_id === currentUserId) return true;
      const many = Array.isArray(t?.assignee_ids) ? t.assignee_ids : null;
      if (many && many.includes(currentUserId)) return true;
      return false;
    },
    [currentUserId],
  );

  const visibleTasks = useMemo(() => {
    const q = boardSearch.trim().toLowerCase();
    const out = [];
    for (const pid of projectIds) {
      const d = projectDetails[pid];
      if (!d) continue;
      if (normalizeBoardColumn(d.board_column) === 'completed') continue;
      if (projectTypeFilter !== 'all') {
        const ids = d.project_type_ids;
        const list = Array.isArray(ids) && ids.length ? ids : [String(d.project_type || 'custom')];
        if (!list.includes(projectTypeFilter)) continue;
      }
      const projectMatches = q ? (d.name || '').toLowerCase().includes(q) : true;
      const tasks = tasksByProject[pid] || [];
      for (const t of tasks) {
        if (!t?.parent_task_id) continue;
        if (taskScope === 'mine' && !isTaskAssignedToMe(t)) continue;
        if (!q) {
          out.push(t);
          continue;
        }
        const hay = (t.title || '').toLowerCase();
        if (projectMatches || hay.includes(q)) out.push(t);
      }
    }
    return out;
  }, [projectIds, projectDetails, tasksByProject, boardSearch, projectTypeFilter, taskScope, isTaskAssignedToMe]);

  const columns = useMemo(() => {
    const grouped = { open: [], in_progress: [], in_review: [], done: [], cancelled: [] };
    for (const t of visibleTasks) {
      grouped[normalizeTaskStatus(t.status)].push(t);
    }

    const dueTime = (t) => {
      const raw = t?.due_date;
      const dt = raw ? parseDateOnlyLocal(raw) : null;
      return dt ? startOfDay(dt).getTime() : Number.POSITIVE_INFINITY;
    };

    const createdTime = (t) => (t?.created_at ? new Date(t.created_at).getTime() : 0);

    const sortTasks = (list) =>
      [...list].sort((a, b) => {
        const pr = compareTaskPriority(normalizeTaskPriority(a.priority), normalizeTaskPriority(b.priority));
        if (pr !== 0) return pr;
        const da = dueTime(a);
        const db = dueTime(b);
        if (da !== db) return da - db;
        return createdTime(a) - createdTime(b);
      });

    for (const key of ['open', 'in_progress', 'in_review', 'done', 'cancelled']) {
      grouped[key] = sortTasks(grouped[key]);
    }
    return grouped;
  }, [visibleTasks]);

  /** Projects that still have at least one visible task (used for the "no matches" fallback). */
  const visibleProjectIds = useMemo(() => {
    const seen = new Set();
    for (const t of visibleTasks) seen.add(t.project_id);
    return [...seen];
  }, [visibleTasks]);

  const projectOptions = useMemo(
    () =>
      projectIds.map((id) => ({
        id,
        name: projectDetails[id]?.name || 'Project',
      })),
    [projectIds, projectDetails],
  );

  /** Embedded dashboard always shows column Kanban (no list toggle). */
  const boardLayoutMode = embedded ? 'kanban' : mainTaskViewMode;

  const handleDropTaskOnColumn = useCallback(
    async (targetStatus, taskId) => {
      if (!taskId) return;
      // Find the task across projects.
      let task = null;
      let projectId = null;
      for (const pid of Object.keys(tasksByProject)) {
        const row = (tasksByProject[pid] || []).find((t) => t.id === taskId);
        if (row) {
          task = row;
          projectId = pid;
          break;
        }
      }
      if (!task) {
        setDropTargetCol(null);
        setDraggingTaskId(null);
        return;
      }
      const sourceStatus = normalizeTaskStatus(task.status);
      if (sourceStatus === targetStatus) {
        setDropTargetCol(null);
        setDraggingTaskId(null);
        return;
      }
      setMovingTaskId(taskId);
      setError('');
      try {
        const { error: upErr } = await supabase
          .from('erp_tasks')
          .update({ status: targetStatus, updated_at: new Date().toISOString() })
          .eq('id', taskId);
        if (upErr) {
          setError(upErr.message || 'Could not update task status');
          return;
        }
        setTasksByProject((prev) => {
          const list = prev[projectId] || [];
          const next = list.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t));
          return { ...prev, [projectId]: next };
        });
        const uid = session?.user?.id;
        if (uid) {
          void logErpTaskStatusChange({
            projectId,
            userId: uid,
            taskId,
            title: task.title || 'Task',
            previousStatus: sourceStatus,
            nextStatus: targetStatus,
          });
        }
      } finally {
        setMovingTaskId(null);
        setDropTargetCol(null);
        setDraggingTaskId(null);
      }
    },
    [tasksByProject, session?.user?.id],
  );

  /** Wrapped board: light glass shell; dark = opaque matte slate/teal (no frosted grey read). */
  const shell =
    embedded
      ? 'rounded-none border-0 bg-transparent shadow-none ring-0 overflow-visible'
      : 'overflow-hidden rounded-2xl border border-cyan-200/45 bg-white/80 shadow-[0_12px_40px_-12px_rgba(16,61,77,0.18)] ring-1 ring-white/70 backdrop-blur-md dark:border-teal-900/45 dark:bg-[#0e1824] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.55)] dark:ring-teal-950/35 dark:[background-image:none] dark:backdrop-blur-none';
  const innerPad = embedded ? 'p-2 sm:p-2.5' : 'p-5 sm:p-6';
  const titleClass = embedded
    ? 'text-xs font-bold uppercase tracking-wide text-teal-900/75 dark:text-teal-200/85'
    : standalonePage
      ? 'text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-600 bg-clip-text text-transparent dark:bg-none dark:text-teal-100'
      : 'text-lg font-bold tracking-tight bg-gradient-to-r from-slate-800 to-[#103D4D] bg-clip-text text-transparent dark:bg-none dark:text-teal-100';

  const handleCloseAddProject = useCallback(() => setAddProjectOpen(false), []);
  const handleProjectCreated = useCallback(() => load(true), [load]);
  const handleCloseAddTask = useCallback(() => setAddTaskOpen(false), []);
  const handleCreateProjectFromTaskModal = useCallback(() => {
    setAddTaskOpen(false);
    setAddProjectOpen(true);
  }, []);

  const myTasksModals = (
    <>
      {!embedded && canCreateProject ? (
        <ErpAddProjectModal
          open={addProjectOpen}
          onClose={handleCloseAddProject}
          userId={session?.user?.id}
          onCreated={handleProjectCreated}
        />
      ) : null}
      <ErpAddMainTaskModal
        open={addTaskOpen}
        onClose={handleCloseAddTask}
        projectOptions={projectOptions}
        userId={session?.user?.id}
        onCreated={handleProjectCreated}
        canCreateProject={!embedded && canCreateProject}
        onCreateProject={!embedded && canCreateProject ? handleCreateProjectFromTaskModal : undefined}
        canSetPriority={isWorkspaceAdmin}
      />
      {isWorkspaceAdmin ? (
        <ProjectBulkPriorityContextMenu
          menu={priorityMenu}
          onClose={() => setPriorityMenu(null)}
          onApplied={() => load(true)}
          onError={(msg) => setError(msg)}
        />
      ) : null}
    </>
  );

  if (loading) {
    return (
      <>
        <div className={shell}>
          <div className={`${innerPad} flex items-center gap-3`}>
            <div className="w-7 h-7 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-teal-600 animate-spin shadow-md shadow-cyan-900/10" />
            <p className="text-teal-900/70 text-sm font-medium dark:text-teal-200/80">Loading…</p>
          </div>
        </div>
        {myTasksModals}
      </>
    );
  }

  if (projectIds.length === 0) {
    return (
      <>
        <div className={shell}>
          <div className={innerPad}>
            <div
              className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${embedded ? 'mb-2' : 'mb-5'}`}
            >
              {!standalonePage ? (
                <h2 className={titleClass}>{embedded ? 'Project board' : tasksTitle}</h2>
              ) : null}
              {!embedded && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canCreateProject ? (
                    <button
                      type="button"
                      onClick={() => setAddProjectOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-violet-700/80 bg-violet-800 px-3.5 py-2 text-[11px] font-bold text-white shadow-lg shadow-black/30 transition hover:bg-violet-900 dark:border-violet-600/60 dark:bg-violet-900 dark:hover:bg-violet-950 dark:[background-image:none]"
                    >
                      <span aria-hidden>+</span>
                      Add project
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled
                    title="Create a project first to add tasks"
                    className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/50 bg-slate-300/80 px-3.5 py-2 text-[11px] font-bold text-white/90 opacity-60 cursor-not-allowed"
                  >
                    <span aria-hidden>+</span>
                    Add task
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-dashed border-cyan-300/60 bg-gradient-to-br from-cyan-50/40 via-white to-violet-50/30 px-6 py-14 text-center shadow-inner ring-1 ring-cyan-900/[0.04] dark:border-teal-800/50 dark:bg-[#0a1418] dark:[background-image:none] dark:ring-teal-900/30">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No projects yet</h3>
            </div>
          </div>
        </div>
        {myTasksModals}
      </>
    );
  }

  return (
    <>
    <div className={shell}>
      <div className={innerPad}>
        <div
          className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${embedded ? 'mb-2' : 'mb-5'}`}
        >
          {!standalonePage ? (
            <h2 className={titleClass}>{embedded ? 'Project board' : tasksTitle}</h2>
          ) : null}
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:justify-end">
              {projectIds.length > 0 ? (
                <label className="min-w-0 flex-1 sm:max-w-xs">
                  <span className="sr-only">Search projects and tasks</span>
                  <input
                    type="search"
                    value={boardSearch}
                    onChange={(e) => setBoardSearch(e.target.value)}
                    placeholder="Search project or task…"
                    className={`${ERP_LIST_SEARCH_INPUT_CLASS} max-w-none`}
                    autoComplete="off"
                  />
                </label>
              ) : null}
              {projectIds.length > 0 ? (
                <label className="min-w-0 sm:w-[16rem]">
                  <span className="sr-only">Filter by project type</span>
                  <ErpNativeSelect
                    value={projectTypeFilter}
                    onChange={(e) => setProjectTypeFilter(e.target.value)}
                    className={`${ERP_LIST_SEARCH_INPUT_CLASS} max-w-none cursor-pointer pl-3.5 pr-10 font-semibold`}
                  >
                    <option value="all">All project types</option>
                    {ERP_PROJECT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </ErpNativeSelect>
                </label>
              ) : null}
              {projectIds.length > 0 && isWorkspaceAdmin ? (
                <div
                  className="flex shrink-0 rounded-xl border border-cyan-200/70 bg-slate-900 p-0.5 shadow-md shadow-slate-900/15 dark:border-teal-900/50 dark:bg-[#121a22] dark:[background-image:none]"
                  role="tablist"
                  aria-label="Task scope"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={taskScope === 'mine'}
                    onClick={() => setTaskScope('mine')}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                      taskScope === 'mine'
                        ? 'bg-teal-400 text-slate-950 shadow-md dark:bg-teal-500 dark:text-slate-950 dark:[background-image:none]'
                        : 'text-cyan-100/80 hover:text-white'
                    }`}
                    title="Only tasks assigned to me"
                  >
                    My tasks
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={taskScope === 'team'}
                    onClick={() => setTaskScope('team')}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                      taskScope === 'team'
                        ? 'bg-teal-400 text-slate-950 shadow-md dark:bg-teal-500 dark:text-slate-950 dark:[background-image:none]'
                        : 'text-cyan-100/80 hover:text-white'
                    }`}
                    title="All tasks across projects I can see"
                  >
                    Team tasks
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {!embedded && (
              <>
                {canCreateProject ? (
                  <button
                    type="button"
                    onClick={() => setAddProjectOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-700/80 bg-violet-800 px-3.5 py-2 text-[11px] font-bold text-white shadow-lg shadow-black/30 transition hover:bg-violet-900 dark:border-violet-600/60 dark:bg-violet-900 dark:hover:bg-violet-950 dark:[background-image:none]"
                  >
                    <span aria-hidden>+</span>
                    Add project
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAddTaskOpen(true)}
                  disabled={!session?.user?.id || projectIds.length === 0}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 px-3.5 py-2 text-[11px] font-bold shadow-lg transition disabled:pointer-events-none disabled:opacity-50 dark:border-teal-600/55 ${ERP_DARK_PRIMARY_BUTTON}`}
                >
                  <span aria-hidden>+</span>
                  Add task
                </button>
                <div
                  className="flex shrink-0 rounded-xl border border-cyan-200/70 bg-slate-900 p-0.5 shadow-md shadow-slate-900/15 dark:border-teal-900/50 dark:bg-[#121a22] dark:[background-image:none]"
                  role="tablist"
                  aria-label="Project board layout"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mainTaskViewMode === 'kanban'}
                    onClick={() => setMainTaskViewModePersist('kanban')}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all ${
                      mainTaskViewMode === 'kanban'
                        ? 'bg-teal-400 text-slate-950 shadow-md dark:bg-teal-500 dark:text-slate-950 dark:[background-image:none]'
                        : 'text-cyan-100/80 hover:text-white'
                    }`}
                  >
                    Kanban
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mainTaskViewMode === 'list'}
                    onClick={() => setMainTaskViewModePersist('list')}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all ${
                      mainTaskViewMode === 'list'
                        ? 'bg-teal-400 text-slate-950 shadow-md dark:bg-teal-500 dark:text-slate-950 dark:[background-image:none]'
                        : 'text-cyan-100/80 hover:text-white'
                    }`}
                  >
                    List
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>

        {projectIds.length > 0 && boardSearch.trim() && visibleProjectIds.length === 0 ? (
          <p className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs font-medium text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
            No projects or tasks match your search.{' '}
            <button type="button" className="font-bold underline" onClick={() => setBoardSearch('')}>
              Clear
            </button>
          </p>
        ) : null}

        {error && (
          <p
            className={`text-red-700 bg-red-50 border border-red-200 mb-2 ${embedded ? 'text-xs rounded-md px-2 py-1.5' : 'text-sm rounded-xl px-4 py-2 mb-4'}`}
          >
            {error}
          </p>
        )}

        {boardLayoutMode === 'kanban' ? (
        <div
          className={`grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 lg:items-stretch ${embedded ? 'gap-1.5' : 'gap-4'} ${
            !embedded ? 'xl:min-h-[860px]' : ''
          }`}
        >
          {COLUMNS.map((col) => {
            const tasks = columns[col.id] || [];
            const canDragKanban = !!session?.user?.id;
            const isDropOver = canDragKanban && dropTargetCol === col.id;
            return (
              <div
                key={col.id}
                className={`rounded-xl border border-slate-200/80 ${cardTone(col.id)} flex flex-col transition-[box-shadow,ring] ${
                  embedded
                    ? 'p-1.5 min-h-[160px] lg:min-h-[200px]'
                    : 'p-3 sm:p-3.5 min-h-[200px] lg:min-h-[860px] lg:h-full'
                } ${isDropOver ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-cyan-50 shadow-lg shadow-cyan-900/15 dark:ring-offset-[#0a1218]' : ''}`}
                onDragOver={
                  canDragKanban
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTargetCol(col.id);
                      }
                    : undefined
                }
                onDrop={
                  canDragKanban
                    ? (e) => {
                        e.preventDefault();
                        const tid = e.dataTransfer.getData('application/x-erp-task-id');
                        if (tid) void handleDropTaskOnColumn(col.id, tid);
                        else {
                          setDropTargetCol(null);
                          setDraggingTaskId(null);
                        }
                      }
                    : undefined
                }
              >
                <div
                  className={`overflow-hidden rounded-lg ${columnHeaderClass(col.id)} ${embedded ? 'mb-1.5' : 'mb-3'}`}
                >
                  <div className={`flex items-center justify-between px-2.5 ${embedded ? 'py-1.5' : 'py-2.5'}`}>
                    <p className={`font-bold uppercase tracking-wider ${embedded ? 'text-[10px]' : 'text-xs'}`}>
                      {col.title}
                    </p>
                    <span
                      className={`font-bold tabular-nums rounded-md bg-white/15 border border-white/25 px-1.5 py-0.5 text-white/95 ${embedded ? 'text-[10px]' : 'text-[11px]'}`}
                    >
                      {tasks.length}
                    </span>
                  </div>
                </div>
                <ul
                  className={`flex min-h-0 flex-1 flex-col pr-0.5 [scrollbar-width:thin] ${embedded ? 'gap-1.5 overflow-auto' : 'gap-2 overflow-y-auto max-h-[min(70vh,520px)] lg:max-h-none lg:overflow-visible'} `}
                >
                  {tasks.map((task) => {
                    const pid = task.project_id;
                    const pd = projectDetails[pid];
                    const projectName = pd?.name || 'Project';
                    const due = task.due_date;
                    const startD = task.start_date;
                    const isDragging = draggingTaskId === task.id;
                    const isBusy = movingTaskId === task.id;
                    return (
                      <li
                        key={task.id}
                        draggable={canDragKanban}
                        onDragStart={
                          canDragKanban
                            ? (e) => {
                                e.dataTransfer.setData('application/x-erp-task-id', task.id);
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggingTaskId(task.id);
                              }
                            : undefined
                        }
                        onDragEnd={
                          canDragKanban
                            ? () => {
                                setDraggingTaskId(null);
                                setDropTargetCol(null);
                              }
                            : undefined
                        }
                        className={`${canDragKanban ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-60' : ''} ${isBusy ? 'pointer-events-none opacity-70' : ''}`}
                      >
                        <div
                          onContextMenu={
                            isWorkspaceAdmin
                              ? (e) => {
                                  e.preventDefault();
                                  setError('');
                                  setPriorityMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    projectId: pid,
                                    projectName,
                                    userId: session?.user?.id,
                                  });
                                }
                              : undefined
                          }
                          className={`overflow-hidden rounded-xl border border-cyan-200/50 bg-white/95 shadow-md shadow-cyan-900/8 backdrop-blur-sm transition-all hover:border-cyan-400/50 hover:shadow-lg hover:ring-1 hover:ring-violet-200/40 dark:border-teal-800/45 dark:bg-[#151f28] dark:[background-image:none] dark:shadow-black/35 dark:backdrop-blur-none dark:hover:border-teal-600/45 dark:hover:ring-teal-900/30 ${embedded ? 'text-[11px]' : ''}`}
                        >
                          <Link
                            href={`/erp/projects/${pid}`}
                            draggable={false}
                            className={`block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded-t-xl ${embedded ? 'px-2 pt-2 pb-1' : 'px-3 pt-3 pb-2'}`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <p
                                className={`font-bold text-slate-900 leading-snug break-words min-w-0 line-clamp-3 dark:text-slate-100 ${embedded ? 'text-xs' : 'text-sm'}`}
                              >
                                {task.title || 'Untitled task'}
                              </p>
                              <ReadOnlyPriorityPill priority={normalizeTaskPriority(task.priority)} />
                            </div>
                            <p
                              className={`mt-1.5 line-clamp-1 text-slate-500 leading-snug dark:text-slate-400 ${embedded ? 'text-[10px]' : 'text-[11px]'}`}
                              title={projectName}
                            >
                              <span className="font-medium text-slate-400 dark:text-slate-500">Project</span>{' '}
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{projectName}</span>
                            </p>
                          </Link>
                          <div
                            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug ${embedded ? 'px-2 pb-2 text-[10px]' : 'px-3 pb-3 text-[11px]'}`}
                          >
                            {startD ? (
                              <span className="text-slate-600 dark:text-slate-400">
                                <span className="font-medium text-slate-400 dark:text-slate-500">Start</span>{' '}
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{formatTaskDueDate(startD)}</span>
                              </span>
                            ) : null}
                            {(() => {
                              const c = taskDueColorClasses(due ? taskDueStatus(due) : null);
                              return (
                                <span className={c.value}>
                                  <span className={`font-medium ${c.label}`}>Due</span>{' '}
                                  <span className="font-semibold">
                                    {due ? formatTaskDueDate(due) : 'Not set'}
                                  </span>
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {tasks.length === 0 && (
                    <li className="flex flex-1 items-center justify-center px-2 py-10 text-center lg:py-0">
                      <span className="text-xs font-medium text-slate-500/55 dark:text-slate-400">Empty</span>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
        ) : (
        <div className="space-y-4">
          {COLUMNS.map((col) => {
            const tasks = columns[col.id] || [];
            return (
              <section
                key={col.id}
                className={`rounded-xl border border-slate-200/80 overflow-hidden ${cardTone(col.id)}`}
              >
                <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${columnHeaderClass(col.id)}`}>
                  <h3 className={`font-bold uppercase tracking-wider ${embedded ? 'text-[10px]' : 'text-xs'}`}>
                    {col.title}
                  </h3>
                  <span
                    className={`font-bold tabular-nums rounded-md bg-white/15 border border-white/25 px-1.5 py-0.5 text-white/95 ${embedded ? 'text-[10px]' : 'text-[11px]'}`}
                  >
                    {tasks.length}
                  </span>
                </div>
                <ul className="divide-y divide-cyan-100/60 bg-white/90 backdrop-blur-sm dark:divide-teal-900/40 dark:bg-[#0a1218] dark:backdrop-blur-none dark:[background-image:none]">
                  {tasks.map((task) => {
                    const pid = task.project_id;
                    const projectName = projectDetails[pid]?.name || 'Project';
                    const due = task.due_date;
                    const startD = task.start_date;
                    return (
                      <li
                        key={task.id}
                        className="px-3 py-2.5 transition-colors hover:bg-gradient-to-r hover:from-cyan-50/50 hover:to-violet-50/30 dark:hover:bg-[#121a22]"
                      >
                        <div
                          onContextMenu={
                            isWorkspaceAdmin
                              ? (e) => {
                                  e.preventDefault();
                                  setError('');
                                  setPriorityMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    projectId: pid,
                                    projectName,
                                    userId: session?.user?.id,
                                  });
                                }
                              : undefined
                          }
                          className="flex flex-wrap items-start gap-3 gap-y-2"
                        >
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/erp/projects/${pid}`}
                              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded-lg"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className={`font-semibold text-slate-900 leading-tight break-words min-w-0 dark:text-slate-100 ${embedded ? 'text-xs' : 'text-sm'}`}
                                >
                                  {task.title || 'Untitled task'}
                                </p>
                                <ReadOnlyPriorityPill priority={normalizeTaskPriority(task.priority)} />
                              </div>
                              <p
                                className={`mt-1 line-clamp-1 text-slate-600 dark:text-slate-400 ${embedded ? 'text-[10px]' : 'text-[11px]'}`}
                                title={projectName}
                              >
                                <span className="font-medium text-slate-400 dark:text-slate-500">Project</span>{' '}
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{projectName}</span>
                              </p>
                            </Link>
                          </div>
                          <div
                            className={`shrink-0 text-right leading-snug ${embedded ? 'text-[10px]' : 'text-[11px]'}`}
                          >
                            {startD ? (
                              <p className="text-slate-600 dark:text-slate-400">
                                <span className="font-medium text-slate-400 dark:text-slate-500">Start</span>{' '}
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{formatTaskDueDate(startD)}</span>
                              </p>
                            ) : null}
                            {(() => {
                              const c = taskDueColorClasses(due ? taskDueStatus(due) : null);
                              return (
                                <p className={c.value}>
                                  <span className={`font-medium ${c.label}`}>Due</span>{' '}
                                  <span className="font-semibold">
                                    {due ? formatTaskDueDate(due) : 'Not set'}
                                  </span>
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {tasks.length === 0 && (
                    <li className="py-8 text-center text-xs font-medium text-teal-800/45 dark:text-teal-400/70">
                      No tasks in this stage
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
        )}
      </div>
    </div>
    {myTasksModals}
    </>
  );
}
