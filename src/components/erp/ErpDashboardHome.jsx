'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  isErpGlobalAdmin,
  isErpManagerRole,
  erpWorkspaceDisplayName,
  erpWorkspaceSubtitle,
} from '../../lib/erp-roles';
import { canApplyLeaveRole, leaveQuotaYear } from '../../lib/erp-leave';
import { canApplyRemoteRole } from '../../lib/erp-remote-work';
import { normalizeBoardColumn } from '../../lib/erp-project-pipeline';
import { useErpSession } from './useErpSession';
import ErpAddProjectModal from './ErpAddProjectModalDynamic';
import { assigneeUidList } from './ErpTaskAssigneeAvatarRow';

const ErpDashboardOverview = dynamic(() => import('./ErpDashboardOverview'), { ssr: false });
const ErpDashboardActivityFeed = dynamic(() => import('./ErpDashboardActivityFeed'), { ssr: false });
const ErpDashboardMeetingsWidget = dynamic(() => import('./ErpDashboardMeetingsWidget'), { ssr: false });
const ErpAttendanceMember = dynamic(() => import('./ErpAttendanceMember'), { ssr: false });
// Heavy modal — only loaded when the user clicks the Overdue KPI card.
const ErpOverdueTasksModal = dynamic(() => import('./ErpOverdueTasksModal'), { ssr: false });
const ErpInviteMembersModal = dynamic(() => import('./ErpInviteMembersModal'), { ssr: false });

function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHoursShort(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function firstName(profile, email) {
  const n = profile?.full_name?.trim();
  if (n) return n.split(/\s+/)[0];
  const e = email?.split('@')[0];
  return e || 'there';
}

// Note: dashboard task query embeds project name; avoid extra round-trip name map.

/** Dashboard strips — aligns with ERP task selects + nested project names. */
const DASH_TASK_SELECT =
  'id, title, status, priority, due_date, start_date, assignee_id, assignee_ids, project_id, project:erp_projects(name, board_column)';

function dashboardTaskStripRow(t) {
  return {
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    start_date: t.start_date,
    project_id: t.project_id,
    projectName: t.project?.name || 'Project',
    priority: t.priority,
    assignee_id: t.assignee_id,
    assignee_ids: t.assignee_ids,
  };
}

function isMineOnlyAssignedTask(viewerId, task) {
  const ids = assigneeUidList(task);
  if (ids.length === 0) return false;
  return ids.length === 1 && ids[0] === viewerId;
}

/** Prefer tasks assigned to others; pad with viewer-only assigns. */
function pickTeamDashboardStripTasks(sortedFilteredRows, viewerId, limit) {
  const prefersOthers = sortedFilteredRows.filter((t) => !isMineOnlyAssignedTask(viewerId, t));
  const mineOnly = sortedFilteredRows.filter((t) => isMineOnlyAssignedTask(viewerId, t));
  const out = [...prefersOthers.slice(0, limit)];
  let i = 0;
  while (out.length < limit && i < mineOnly.length) out.push(mineOnly[i++]);
  return out.slice(0, limit).map(dashboardTaskStripRow);
}

async function fetchDashboardAssigneeProfiles(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const out = {};
  if (unique.length === 0) return out;
  const CHUNK = 80;
  const slices = [];
  for (let i = 0; i < unique.length; i += CHUNK) slices.push(unique.slice(i, i + CHUNK));
  // Fan out all chunks in parallel — N independent IN queries are bounded by
  // Postgres connection pool, not by JS, and run far faster than sequentially.
  const results = await Promise.all(
    slices.map((slice) =>
      supabase.from('erp_profiles').select('id, full_name, avatar_path').in('id', slice),
    ),
  );
  for (const { data } of results) {
    for (const p of data || []) {
      out[p.id] = { id: p.id, full_name: p.full_name || 'Member', avatar_path: p.avatar_path ?? null };
    }
  }
  return out;
}

function collectAssigneeIds(rows) {
  const seen = new Set();
  const acc = [];
  for (const t of rows) {
    for (const id of assigneeUidList(t)) {
      if (!seen.has(id)) {
        seen.add(id);
        acc.push(id);
      }
    }
  }
  return acc;
}

const emptyDash = {
  activeProjects: 0,
  completedProjects: 0,
  overdueTasks: 0,
  hoursSeconds: 0,
  hoursThisWeekSeconds: 0,
  revenueAud: null,
  /** Global admin only: % of active (non-client) team members who currently
   *  have at least one open / in_progress / in_review task assigned to them.
   *  null = not computed (non-admin or insufficient data). */
  utilizationPct: null,
  /** Global admin only: total active (non-client) team members — denominator
   *  of the utilization calculation, surfaced so the card sub-text can show
   *  e.g. "5 / 7 members have active tasks". */
  utilizationActiveMembers: null,
  /** Global admin only: count of active members with at least one active
   *  task assigned — numerator of the utilization calculation. */
  utilizationAssignedMembers: null,
  weeklySeries: [0, 0, 0, 0, 0, 0, 0],
  weekDayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  deadlines: [],
  myTasks: [],
  teamTasks: [],
  assigneeProfiles: {},
};

export default function ErpDashboardHome() {
  const { profile, session, erpCan } = useErpSession();
  const [projectCount, setProjectCount] = useState(null);
  const [remoteYtd, setRemoteYtd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState(emptyDash);
  const [dashLoading, setDashLoading] = useState(true);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [overdueModalOpen, setOverdueModalOpen] = useState(false);
  const [showBelowFold, setShowBelowFold] = useState(false);

  const dateLine = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const loadDashboardMetrics = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid || !profile) {
      setDash(emptyDash);
      setDashLoading(false);
      return;
    }
    setDashLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = localYmd(today);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = localYmd(weekEnd);

      const orderedDayKeys = [];
      const weekDayLabels = [];
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        orderedDayKeys.push(localYmd(d));
        weekDayLabels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
      }

      let activeProjects = 0;
      let completedProjects = 0;

      if (isErpGlobalAdmin(profile.role)) {
        const { data: prows } = await supabase.from('erp_projects').select('board_column').limit(800);
        for (const p of prows || []) {
          if (String(p?.board_column).toLowerCase() === 'completed') completedProjects += 1;
          else activeProjects += 1;
        }
      } else {
        const { data: mems } = await supabase.from('erp_project_members').select('project_id').eq('user_id', uid);
        const projectIds = [...new Set((mems || []).map((m) => m.project_id).filter(Boolean))];
        if (projectIds.length === 0) {
          setDash(emptyDash);
          return;
        }
        const CHUNK = 80;
        const slices = [];
        for (let i = 0; i < projectIds.length; i += CHUNK) slices.push(projectIds.slice(i, i + CHUNK));
        // Parallelize chunk fetches — they're independent.
        const chunked = await Promise.all(
          slices.map((slice) =>
            supabase.from('erp_projects').select('board_column').in('id', slice),
          ),
        );
        for (const { data: prows } of chunked) {
          for (const p of prows || []) {
            if (String(p?.board_column).toLowerCase() === 'completed') completedProjects += 1;
            else activeProjects += 1;
          }
        }
      }

      const isWorkspaceAdmin = isErpGlobalAdmin(profile.role);

      // "Assigned to me" covers both the legacy single-assignee column and the
      // multi-assignee array column introduced in migration 055. Without this
      // OR filter users only in assignee_ids are missed from dashboard counts.
      const mineAssignedFilter = `assignee_id.eq.${uid},assignee_ids.cs.{${uid}}`;

      const isClient = profile.role === 'client';

      const overdueP = (
        isWorkspaceAdmin
          ? supabase
              .from('erp_tasks')
              .select('id', { count: 'exact', head: true })
              .lt('due_date', todayStr)
              .neq('status', 'done')
              .neq('status', 'cancelled')
          : supabase
              .from('erp_tasks')
              .select('id', { count: 'exact', head: true })
              .or(mineAssignedFilter)
              .lt('due_date', todayStr)
              .neq('status', 'done')
              .neq('status', 'cancelled')
      ).then(({ count }) => count ?? 0);

      /** "Team utilization" (workspace admin only):
       *  share of active (non-client) team members who currently have at
       *  least one active task assigned (status open / in_progress / in_review).
       *  Returns `{ activeMembers, assignedMembers }` so the card can show
       *  the ratio context (e.g. "5 / 7 members have active tasks"). */
      const utilizationP = (async () => {
        if (!isWorkspaceAdmin) return { activeMembers: null, assignedMembers: null };
        try {
          const [{ data: profiles, error: pErr }, { data: tasks, error: tErr }] = await Promise.all([
            supabase.from('erp_profiles').select('id').neq('role', 'client'),
            supabase
              .from('erp_tasks')
              .select('assignee_id, assignee_ids')
              .in('status', ['open', 'in_progress', 'in_review'])
              .limit(5000),
          ]);
          if (pErr || tErr) return { activeMembers: null, assignedMembers: null };
          const memberIds = new Set((profiles || []).map((p) => String(p.id)));
          if (memberIds.size === 0) return { activeMembers: 0, assignedMembers: 0 };
          const assignedSet = new Set();
          for (const row of tasks || []) {
            if (row?.assignee_id && memberIds.has(String(row.assignee_id))) {
              assignedSet.add(String(row.assignee_id));
            }
            if (Array.isArray(row?.assignee_ids)) {
              for (const x of row.assignee_ids) {
                if (x && memberIds.has(String(x))) assignedSet.add(String(x));
              }
            }
          }
          return { activeMembers: memberIds.size, assignedMembers: assignedSet.size };
        } catch {
          return { activeMembers: null, assignedMembers: null };
        }
      })();

      const logsP = (async () => {
        let hoursSeconds = 0;
        const bucketSeconds = Object.fromEntries(orderedDayKeys.map((k) => [k, 0]));
        if (isClient) return { hoursSeconds, bucketSeconds };
        try {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          start.setDate(start.getDate() - 6);
          const logsQuery = supabase
            .from('erp_project_time_logs')
            .select('duration_seconds, created_at')
            .gte('created_at', start.toISOString())
            .limit(isWorkspaceAdmin ? 8000 : 1200);
          const { data: logs } = isWorkspaceAdmin ? await logsQuery : await logsQuery.eq('user_id', uid);
          for (const row of logs || []) {
            const sec = Number(row.duration_seconds) || 0;
            hoursSeconds += sec;
            const dk = localYmd(new Date(row.created_at));
            if (dk in bucketSeconds) bucketSeconds[dk] += sec;
          }
        } catch {
          /* table may not exist yet */
        }
        return { hoursSeconds, bucketSeconds };
      })();

      const revenueP = (async () => {
        if (!isErpGlobalAdmin(profile.role)) return null;
        // We used to first try `select('amount_received.sum()')` for an
        // in-database aggregate, but this PostgREST deployment rejects the
        // inline aggregator syntax with a 400, polluting the browser
        // console on every dashboard load. The straight fetch below scales
        // fine into the thousands and gives us the same number.
        const { data: pays, error: capErr } = await supabase
          .from('erp_project_payments')
          .select('amount_received')
          .order('created_at', { ascending: false })
          .limit(2500);
        if (capErr || !pays) return null;
        return pays.reduce((a, p) => a + Number(p.amount_received || 0), 0);
      })();

      const tasksMineP = supabase
        .from('erp_tasks')
        .select(DASH_TASK_SELECT)
        .or(mineAssignedFilter)
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200)
        .then(({ data, error: tErr }) => {
          if (tErr) throw new Error(tErr.message);
          return data || [];
        });

      const fetchTeamWideTasks = isClient || isErpManagerRole(profile.role);
      const tasksTeamP = fetchTeamWideTasks
        ? supabase
            .from('erp_tasks')
            .select(DASH_TASK_SELECT)
            .neq('status', 'done')
            .neq('status', 'cancelled')
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(200)
            .then(({ data, error: tErr }) => {
              if (tErr) throw new Error(tErr.message);
              return data || [];
            })
        : Promise.resolve([]);

      const [overdueCount, utilizationData, revenueAud, logsData, taskListMine, taskListTeamWide] =
        await Promise.all([overdueP, utilizationP, revenueP, logsP, tasksMineP, tasksTeamP]);

      const { hoursSeconds, bucketSeconds } = logsData;
      const weeklySeries = orderedDayKeys.map((k) => Math.round((bucketSeconds[k] || 0) / 60));
      const hoursThisWeekSeconds = orderedDayKeys.reduce((a, k) => a + (bucketSeconds[k] || 0), 0);

      // Derive the workspace utilization % (admin only): share of active
      // (non-client) team members that currently have any open / in_progress
      // / in_review task assigned to them. Pure assignment-coverage metric —
      // hours and statuses do not factor in.
      const utilizationActiveMembers = utilizationData?.activeMembers ?? null;
      const utilizationAssignedMembers = utilizationData?.assignedMembers ?? null;
      let utilizationPct = null;
      if (
        isWorkspaceAdmin &&
        utilizationActiveMembers != null &&
        utilizationAssignedMembers != null &&
        utilizationActiveMembers > 0
      ) {
        utilizationPct = Math.max(
          0,
          Math.min(100, Math.round((100 * utilizationAssignedMembers) / utilizationActiveMembers)),
        );
      }

      const filteredTaskList = (taskListMine || []).filter(
        (t) => normalizeBoardColumn(t.project?.board_column) !== 'completed',
      );

      const deadlines = filteredTaskList
        .filter((t) => t.due_date && t.due_date >= todayStr && t.due_date <= weekEndStr)
        .slice(0, 14)
        .map((t) => ({
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          project_id: t.project_id,
          projectName: t.project?.name || 'Project',
        }));

      const myTasks = filteredTaskList.slice(0, 8).map(dashboardTaskStripRow);

      let teamTasks = [];
      if (fetchTeamWideTasks && uid) {
        const teamFiltered = (taskListTeamWide || []).filter(
          (t) => normalizeBoardColumn(t.project?.board_column) !== 'completed',
        );
        teamTasks = pickTeamDashboardStripTasks(teamFiltered, uid, 8);
      }

      const assigneeProfiles = await fetchDashboardAssigneeProfiles(
        collectAssigneeIds([
          ...myTasks.map((r) => ({ assignee_id: r.assignee_id, assignee_ids: r.assignee_ids })),
          ...teamTasks.map((r) => ({ assignee_id: r.assignee_id, assignee_ids: r.assignee_ids })),
        ]),
      );

      setDash({
        activeProjects,
        completedProjects,
        overdueTasks: overdueCount ?? 0,
        hoursSeconds,
        hoursThisWeekSeconds,
        revenueAud,
        utilizationPct,
        utilizationActiveMembers,
        utilizationAssignedMembers,
        weeklySeries,
        weekDayLabels,
        deadlines,
        myTasks,
        teamTasks,
        assigneeProfiles,
      });
    } catch {
      setDash(emptyDash);
    } finally {
      setDashLoading(false);
    }
  }, [profile, session?.user?.id]);

  const reloadDashboard = useCallback(
    async (showSpinner) => {
      if (!profile) return;
      if (showSpinner) setLoading(true);
      try {
        if (!isErpGlobalAdmin(profile.role)) {
          await erpAuthorizedFetch('/api/erp/me/sync-project-memberships', { method: 'POST' }).catch(() => {});
        }
        const uid = session?.user?.id;
        const year = new Date().getFullYear();
        const [headerResults] = await Promise.all([
          Promise.all([
            (async () => {
              if (isErpGlobalAdmin(profile?.role)) {
                const { count } = await supabase.from('erp_projects').select('*', { count: 'exact', head: true });
                return count ?? 0;
              }
              if (uid) {
                const { count } = await supabase
                  .from('erp_project_members')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', uid);
                return count ?? 0;
              }
              const { count } = await supabase.from('erp_projects').select('*', { count: 'exact', head: true });
              return count ?? 0;
            })(),
            canApplyRemoteRole(profile?.role) && uid
              ? supabase
                  .from('erp_remote_work_requests')
                  .select('day_count, status, start_date')
                  .eq('user_id', uid)
                  .then(({ data, error }) => {
                    if (error) return null;
                    let sum = 0;
                    for (const r of data || []) {
                      if (r.status !== 'approved') continue;
                      if (leaveQuotaYear(r.start_date) !== year) continue;
                      sum += Number(r.day_count) || 0;
                    }
                    return sum;
                  })
                  .catch(() => null)
              : Promise.resolve(null),
          ]),
          loadDashboardMetrics(),
        ]);
        const [pc, remoteYtdVal] = headerResults;
        setProjectCount(pc);
        if (typeof remoteYtdVal === 'number') setRemoteYtd(remoteYtdVal);
        else setRemoteYtd(null);
      } finally {
        setLoading(false);
      }
    },
    [profile, session?.user?.id, loadDashboardMetrics],
  );

  useEffect(() => {
    if (!profile) return;
    void reloadDashboard(true);
  }, [profile, session?.user?.id, reloadDashboard]);

  useEffect(() => {
    if (!profile) return;
    const belowFoldTimer = setTimeout(() => setShowBelowFold(true), 280);
    return () => clearTimeout(belowFoldTimer);
  }, [profile]);

  useEffect(() => {
    const onExternalReload = () => {
      void reloadDashboard(false);
    };
    window.addEventListener('erp-dashboard-reload', onExternalReload);
    return () => window.removeEventListener('erp-dashboard-reload', onExternalReload);
  }, [reloadDashboard]);

  const fn = firstName(profile, session?.user?.email);
  const showEmptyProjectsCta = !loading && projectCount === 0;
  const showManagerDashboard = isErpManagerRole(profile?.role);

  /** Dashboard widgets follow RBAC modules (Roles & permissions matrix). */
  const dashVis = useMemo(() => {
    const finance = erpCan('finance', 'view');
    const statistics = erpCan('statistics', 'view');
    const projects = erpCan('projects', 'view');
    const tasks = erpCan('tasks', 'view');
    const time =
      profile?.role !== 'client' &&
      (erpCan('attendance', 'view') || erpCan('remote', 'view') || erpCan('performance', 'view'));
    const meetings = erpCan('meetings', 'view');
    const extendedStrip =
      isErpManagerRole(profile?.role) ||
      isErpGlobalAdmin(profile?.role) ||
      finance ||
      statistics;
    return {
      kpiActiveProjects: projects,
      kpiFinance: finance,
      kpiUtilization: statistics,
      kpiOverdue: tasks,
      kpiHours: time,
      pipeline: projects && extendedStrip,
      weeklyHoursPair: time && extendedStrip,
      weeklyHoursSolo: time && !extendedStrip,
      deadlines: tasks,
      myTasks: tasks,
      /** Workspace admin + Team Manager strip of tasks visible via RLS. */
      teamTasksStrip: tasks && (profile?.role === 'client' || isErpManagerRole(profile?.role)),
      meetings,
      extendedStrip,
    };
  }, [erpCan, profile?.role]);

  const revenueLabel =
    dash.revenueAud != null
      ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
          dash.revenueAud,
        )
      : '—';

  return (
    <div className="w-full max-w-none space-y-4 pb-5 text-xs leading-snug text-slate-800 dark:text-slate-200 sm:text-[13px]">
      <header className="overflow-hidden rounded-2xl border border-cyan-200/70 bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 dark:border-teal-900/50 dark:bg-[#090e14] dark:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)] dark:ring-teal-950/30 dark:[background-image:none]">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#103D4D] dark:text-teal-300">Workspace</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">Dashboard</h1>
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200 sm:text-base">
              Welcome back, {fn}{' '}
              <span aria-hidden className="inline-block">
                👋
              </span>
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">{dateLine}</p>
            {canApplyRemoteRole(profile?.role) && !loading && typeof remoteYtd === 'number' ? (
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                <Link
                  href="/erp/remote"
                  className="font-semibold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                >
                  Remote (YTD)
                </Link>
                <span className="text-slate-500 dark:text-slate-500"> · </span>
                {remoteYtd} approved day{remoteYtd === 1 ? '' : 's'}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
              {erpWorkspaceDisplayName(profile, session?.user?.email)}
              <span className="font-bold text-slate-400 dark:text-slate-500"> · </span>
              {erpWorkspaceSubtitle(profile)}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/erp/projects"
                className="inline-flex items-center justify-center rounded-xl border-2 border-[#103D4D]/25 bg-white px-4 py-2 text-[11px] font-bold text-[#103D4D] shadow-sm hover:bg-slate-50 dark:border-teal-500/40 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-slate-900 dark:text-teal-100 dark:hover:from-slate-800 dark:hover:to-teal-950/50"
              >
                View projects
              </Link>
              {showManagerDashboard ? (
                <button
                  type="button"
                  onClick={() => setAddProjectOpen(true)}
                  className="inline-flex items-center justify-center rounded-xl erp-brand-fill px-4 py-2 text-[11px] font-bold text-white shadow-md"
                >
                  + New project
                </button>
              ) : null}
            </div>
            {showManagerDashboard ? (
              <div className="flex flex-wrap gap-1.5">
                <Link
                  href="/erp/projects"
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800/80 dark:to-slate-900 dark:text-slate-200 dark:hover:from-slate-700 dark:hover:to-teal-950/40"
                >
                  Start timer
                </Link>
                <Link
                  href="/erp/admin/clients"
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800/80 dark:to-slate-900 dark:text-slate-200 dark:hover:from-slate-700 dark:hover:to-teal-950/40"
                >
                  New client
                </Link>
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800/80 dark:to-slate-900 dark:text-slate-200 dark:hover:from-slate-700 dark:hover:to-teal-950/40"
                >
                  Invite member
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-slate-200/90 bg-slate-100/95 px-3 py-2.5 sm:px-4 dark:border-teal-900/50 dark:bg-[#060a0f] dark:[background-image:none]"
          aria-label="Quick navigation"
        >
          <Link
            href="/erp/projects"
            className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D] dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Projects
          </Link>
          <span className="select-none text-slate-300 dark:text-slate-600" aria-hidden>
            |
          </span>
          <Link
            href="/erp/my-tasks"
            className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D] dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {profile?.role === 'client' ? 'Task' : 'My tasks'}
          </Link>
          <span className="select-none text-slate-300 dark:text-slate-600" aria-hidden>
            |
          </span>
          <Link
            href="/erp/inbox"
            className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D] dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Inbox
          </Link>
          {canApplyLeaveRole(profile?.role) ? (
            <>
              <span className="select-none text-slate-300 dark:text-slate-600" aria-hidden>
                |
              </span>
              <Link
                href="/erp/attendance"
                className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D] dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Attendance
              </Link>
              <span className="select-none text-slate-300 dark:text-slate-600" aria-hidden>
                |
              </span>
              <Link
                href="/erp/leave"
                className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D] dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Leave
              </Link>
              <span className="select-none text-slate-300 dark:text-slate-600" aria-hidden>
                |
              </span>
              <Link
                href="/erp/remote"
                className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D] dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Remote
              </Link>
            </>
          ) : null}
          <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-600 dark:text-white/70">
            {loading ? '…' : projectCount != null ? `${projectCount} project${projectCount === 1 ? '' : 's'}` : ''}
          </span>
        </nav>
      </header>

      {profile?.role !== 'client' && showBelowFold ? (
        <section aria-label="Today attendance check-in">
          <ErpAttendanceMember dashboardWidget />
        </section>
      ) : null}

      {showEmptyProjectsCta ? (
        <div className="rounded-2xl border border-dashed border-cyan-300/60 bg-gradient-to-br from-cyan-50/50 via-white to-violet-50/40 px-4 py-4 shadow-sm ring-1 ring-cyan-900/[0.04] sm:px-5 dark:border-teal-900/45 dark:bg-[#0a1016] dark:ring-teal-950/25 dark:[background-image:none]">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Get started</p>
          <Link
            href="/erp/projects"
            className="mt-2 inline-flex text-[11px] font-bold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 hover:text-teal-800"
          >
            Browse projects
          </Link>
        </div>
      ) : null}

      <ErpDashboardOverview
        loading={dashLoading}
        showManagerOverview={dashVis.extendedStrip}
        teamScopeKpis={isErpGlobalAdmin(profile?.role)}
        showTimeTracking={profile?.role !== 'client'}
        showKpiActiveProjects={dashVis.kpiActiveProjects}
        showKpiFinance={dashVis.kpiFinance}
        showKpiUtilization={dashVis.kpiUtilization}
        showKpiOverdue={dashVis.kpiOverdue}
        showKpiHours={dashVis.kpiHours}
        showPipeline={dashVis.pipeline}
        showWeeklyHoursPair={dashVis.weeklyHoursPair}
        showWeeklyHoursSolo={dashVis.weeklyHoursSolo}
        showDeadlines={dashVis.deadlines}
        showMyTasks={dashVis.myTasks}
        activeProjects={dash.activeProjects}
        completedProjects={dash.completedProjects}
        overdueTasks={dash.overdueTasks}
        hoursTotalLabel={formatHoursShort(dash.hoursSeconds)}
        hoursSubLabel={
          isErpGlobalAdmin(profile?.role)
            ? dash.hoursThisWeekSeconds > 0
              ? `Team · this week: ${formatHoursShort(dash.hoursThisWeekSeconds)}`
              : 'Team time logged · log from project pages'
            : dash.hoursThisWeekSeconds > 0
              ? `This week: ${formatHoursShort(dash.hoursThisWeekSeconds)}`
              : 'Log time from a project page'
        }
        revenueLabel={revenueLabel}
        showRevenue={isErpGlobalAdmin(profile?.role)}
        utilizationLabel={
          isErpGlobalAdmin(profile?.role) && dash.utilizationPct != null ? `${dash.utilizationPct}%` : '—'
        }
        utilizationSub={
          isErpGlobalAdmin(profile?.role)
            ? dash.utilizationActiveMembers && dash.utilizationActiveMembers > 0
              ? `${dash.utilizationAssignedMembers ?? 0} / ${dash.utilizationActiveMembers} members have an active task`
              : 'Members with at least one active task assigned'
            : 'Placeholder metric'
        }
        weeklySeries={dash.weeklySeries}
        weekDayLabels={dash.weekDayLabels}
        deadlines={dash.deadlines}
        myTasks={dash.myTasks}
        teamTasks={dash.teamTasks}
        assigneeProfiles={dash.assigneeProfiles}
        showTeamTasksStrip={dashVis.teamTasksStrip}
        teamTasksStripTitle={profile?.role === 'client' ? 'All tasks' : 'Team tasks'}
        teamTasksStripSubtitle={
          profile?.role === 'client'
            ? 'Every open task in your projects.'
            : 'Open tasks in projects you access (prioritizes work assigned to others).'
        }
        teamTasksEmptyLabel={
          profile?.role === 'client' ? 'No open tasks in your projects yet.' : 'No team-visible open tasks yet.'
        }
        onOverdueClick={() => setOverdueModalOpen(true)}
      />

      <ErpOverdueTasksModal
        open={overdueModalOpen}
        onClose={() => setOverdueModalOpen(false)}
        userId={session?.user?.id || null}
        teamScope={isErpGlobalAdmin(profile?.role)}
      />

      {dashVis.meetings && showBelowFold ? <ErpDashboardMeetingsWidget /> : null}

      {showManagerDashboard && showBelowFold ? <ErpDashboardActivityFeed userId={session?.user?.id} /> : null}

      <ErpAddProjectModal
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        userId={session?.user?.id}
        onCreated={() => {
          setAddProjectOpen(false);
          void loadDashboardMetrics();
          setProjectCount((c) => (typeof c === 'number' ? c + 1 : c));
        }}
      />
      <ErpInviteMembersModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        projectId={null}
        onSuccess={async () => {
          void loadDashboardMetrics();
          window.dispatchEvent(new Event('erp-dashboard-reload'));
        }}
      />
    </div>
  );
}
