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
import { canApplyLeaveRole } from '../../lib/erp-leave';
import { useErpSession } from './useErpSession';
import ErpAddProjectModal from './ErpAddProjectModalDynamic';

const ErpDashboardOverview = dynamic(() => import('./ErpDashboardOverview'), { ssr: false });
const ErpDashboardActivityFeed = dynamic(() => import('./ErpDashboardActivityFeed'), { ssr: false });
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

const emptyDash = {
  activeProjects: 0,
  completedProjects: 0,
  overdueTasks: 0,
  hoursSeconds: 0,
  hoursThisWeekSeconds: 0,
  revenueAud: null,
  /** Global admin only: % of (open|in_progress) tasks that are in_progress */
  utilizationPct: null,
  weeklySeries: [0, 0, 0, 0, 0, 0, 0],
  weekDayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  deadlines: [],
  myTasks: [],
};

export default function ErpDashboardHome() {
  const { profile, session } = useErpSession();
  const showInviteStats = isErpManagerRole(profile?.role);
  const [projectCount, setProjectCount] = useState(null);
  const [pendingInvites, setPendingInvites] = useState(null);
  const [pendingLeaveReviews, setPendingLeaveReviews] = useState(null);
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
        const all = [];
        for (let i = 0; i < projectIds.length; i += CHUNK) {
          const slice = projectIds.slice(i, i + CHUNK);
          const { data: prows } = await supabase.from('erp_projects').select('board_column').in('id', slice);
          all.push(...(prows || []));
        }
        for (const p of all) {
          if (String(p?.board_column).toLowerCase() === 'completed') completedProjects += 1;
          else activeProjects += 1;
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

      const utilizationP = (async () => {
        if (!isWorkspaceAdmin) return null;
        try {
          const [{ count: activeWork }, { count: inProg }] = await Promise.all([
            supabase
              .from('erp_tasks')
              .select('id', { count: 'exact', head: true })
              .in('status', ['open', 'in_progress', 'in_review']),
            supabase.from('erp_tasks').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
          ]);
          const a = activeWork ?? 0;
          const ip = inProg ?? 0;
          return a > 0 ? Math.round((100 * ip) / a) : null;
        } catch {
          return null;
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
        const { data: pays, error: payErr } = await supabase
          .from('erp_project_payments')
          .select('amount_received')
          .order('created_at', { ascending: false })
          .limit(5000);
        if (payErr || !pays) return null;
        return pays.reduce((a, p) => a + Number(p.amount_received || 0), 0);
      })();

      const tasksP = supabase
        .from('erp_tasks')
        .select('id, title, status, priority, due_date, project_id, project:erp_projects(name)')
        .or(mineAssignedFilter)
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200)
        .then(({ data, error: tErr }) => {
          if (tErr) throw new Error(tErr.message);
          return data || [];
        });

      const [overdueCount, utilizationPct, revenueAud, logsData, taskList] = await Promise.all([
        overdueP,
        utilizationP,
        revenueP,
        logsP,
        tasksP,
      ]);

      const { hoursSeconds, bucketSeconds } = logsData;
      const weeklySeries = orderedDayKeys.map((k) => Math.round((bucketSeconds[k] || 0) / 60));
      const hoursThisWeekSeconds = orderedDayKeys.reduce((a, k) => a + (bucketSeconds[k] || 0), 0);

      const deadlines = taskList
        .filter((t) => t.due_date && t.due_date >= todayStr && t.due_date <= weekEndStr)
        .slice(0, 14)
        .map((t) => ({
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          project_id: t.project_id,
          projectName: t.project?.name || 'Project',
        }));

      const myTasks = taskList.slice(0, 8).map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        project_id: t.project_id,
        projectName: t.project?.name || 'Project',
        priority: t.priority,
      }));

      setDash({
        activeProjects,
        completedProjects,
        overdueTasks: overdueCount ?? 0,
        hoursSeconds,
        hoursThisWeekSeconds,
        revenueAud,
        utilizationPct,
        weeklySeries,
        weekDayLabels,
        deadlines,
        myTasks,
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
            showInviteStats
              ? supabase
                  .from('erp_invitations')
                  .select('*', { count: 'exact', head: true })
                  .is('accepted_at', null)
                  .then(({ count }) => count ?? 0)
              : Promise.resolve(null),
            isErpManagerRole(profile?.role)
              ? supabase
                  .from('erp_leave_requests')
                  .select('*', { count: 'exact', head: true })
                  .eq('status', 'pending')
                  .then(({ count }) => count ?? 0)
              : Promise.resolve(null),
          ]),
          loadDashboardMetrics(),
        ]);
        const [pc, inviteCount, leavePending] = headerResults;
        setProjectCount(pc);
        if (showInviteStats && inviteCount != null) setPendingInvites(inviteCount);
        else if (!showInviteStats) setPendingInvites(null);
        if (isErpManagerRole(profile?.role) && leavePending != null) setPendingLeaveReviews(leavePending);
        else setPendingLeaveReviews(null);
      } finally {
        setLoading(false);
      }
    },
    [profile, showInviteStats, session?.user?.id, loadDashboardMetrics],
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

  const revenueLabel =
    dash.revenueAud != null
      ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
          dash.revenueAud,
        )
      : '—';

  return (
    <div className="w-full max-w-none space-y-4 pb-5 text-xs leading-snug text-slate-800 sm:text-[13px]">
      <header className="overflow-hidden rounded-2xl border border-cyan-200/70 bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#103D4D]">Workspace</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h1>
            <p className="mt-2 text-sm font-semibold text-slate-800 sm:text-base">
              Welcome back, {fn}{' '}
              <span aria-hidden className="inline-block">
                👋
              </span>
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-600">{dateLine}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {erpWorkspaceDisplayName(profile, session?.user?.email)}
              <span className="font-bold text-slate-400"> · </span>
              {erpWorkspaceSubtitle(profile)}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/erp/projects"
                className="inline-flex items-center justify-center rounded-xl border-2 border-[#103D4D]/25 bg-white px-4 py-2 text-[11px] font-bold text-[#103D4D] shadow-sm hover:bg-slate-50"
              >
                View projects
              </Link>
              {showManagerDashboard ? (
                <button
                  type="button"
                  onClick={() => setAddProjectOpen(true)}
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-4 py-2 text-[11px] font-bold text-white shadow-md hover:from-[#0d3442] hover:to-teal-800"
                >
                  + New project
                </button>
              ) : null}
            </div>
            {showManagerDashboard ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAddProjectOpen(true)}
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white"
                >
                  New project
                </button>
                <Link
                  href="/erp/projects"
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white"
                >
                  Start timer
                </Link>
                <Link
                  href="/erp/admin/clients"
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white"
                >
                  New client
                </Link>
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-white"
                >
                  Invite member
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-slate-200/90 bg-slate-100/95 px-3 py-2.5 sm:px-4"
          aria-label="Quick navigation"
        >
          <Link
            href="/erp/projects"
            className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D]"
          >
            Projects
          </Link>
          <span className="select-none text-slate-300" aria-hidden>
            |
          </span>
          <Link
            href="/erp/my-tasks"
            className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D]"
          >
            {profile?.role === 'client' ? 'Task' : 'My tasks'}
          </Link>
          <span className="select-none text-slate-300" aria-hidden>
            |
          </span>
          <Link
            href="/erp/inbox"
            className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D]"
          >
            Inbox
          </Link>
          {canApplyLeaveRole(profile?.role) ? (
            <>
              <span className="select-none text-slate-300" aria-hidden>
                |
              </span>
              <Link
                href="/erp/attendance"
                className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D]"
              >
                Attendance
              </Link>
              <span className="select-none text-slate-300" aria-hidden>
                |
              </span>
              <Link
                href="/erp/leave"
                className="rounded-lg px-2.5 py-1.5 font-bold text-slate-800 transition hover:bg-white hover:text-[#103D4D]"
              >
                Leave
              </Link>
            </>
          ) : null}
          <span className="ml-auto text-[11px] font-semibold tabular-nums text-slate-600">
            {loading ? '…' : projectCount != null ? `${projectCount} project${projectCount === 1 ? '' : 's'}` : ''}
          </span>
        </nav>
      </header>

      {canApplyLeaveRole(profile?.role) && showBelowFold ? (
        <section aria-label="Today attendance check-in">
          <ErpAttendanceMember dashboardWidget />
        </section>
      ) : null}

      {showEmptyProjectsCta ? (
        <div className="rounded-2xl border border-dashed border-cyan-300/60 bg-gradient-to-br from-cyan-50/50 via-white to-violet-50/40 px-4 py-4 shadow-sm ring-1 ring-cyan-900/[0.04] sm:px-5">
          <p className="text-sm font-semibold text-slate-900">Get started</p>
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
        showManagerOverview={showManagerDashboard}
        teamScopeKpis={isErpGlobalAdmin(profile?.role)}
        showTimeTracking={profile?.role !== 'client'}
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
            ? 'In-progress share of open work (workspace)'
            : 'Placeholder metric'
        }
        weeklySeries={dash.weeklySeries}
        weekDayLabels={dash.weekDayLabels}
        deadlines={dash.deadlines}
        myTasks={dash.myTasks}
        onOverdueClick={() => setOverdueModalOpen(true)}
      />

      <ErpOverdueTasksModal
        open={overdueModalOpen}
        onClose={() => setOverdueModalOpen(false)}
        userId={session?.user?.id || null}
        teamScope={isErpGlobalAdmin(profile?.role)}
      />

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
          if (showInviteStats) {
            const { count } = await supabase
              .from('erp_invitations')
              .select('*', { count: 'exact', head: true })
              .is('accepted_at', null);
            setPendingInvites(count ?? 0);
          }
        }}
      />
    </div>
  );
}
