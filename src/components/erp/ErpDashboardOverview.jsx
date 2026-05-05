'use client';

import Link from 'next/link';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import { formatTaskDueDate, taskDueColorClasses, taskDueStatus } from '../../lib/task-dates';

/** Small inline chip that renders a formatted due date in the right color for
 *  its status (past → red, today → blue, future → green, missing → muted). */
function DueDateLabel({ date, prefix = 'Due', className = '', missingLabel = '—' }) {
  if (!date) {
    return <span className={`font-semibold text-slate-400 dark:text-slate-500 ${className}`}>{missingLabel}</span>;
  }
  const status = taskDueStatus(date);
  const c = taskDueColorClasses(status);
  return (
    <span className={`font-semibold tabular-nums ${c.value} ${className}`}>
      {prefix ? <span className={`font-medium ${c.label}`}>{prefix} </span> : null}
      {formatTaskDueDate(date)}
    </span>
  );
}

function KpiCard({ label, value, sub, accent = 'slate', icon, href, onClick }) {
  const accents = {
    slate: 'from-slate-50 to-white border-slate-200/80 ring-slate-100/60',
    sky: 'from-sky-50 to-white border-sky-200/70 ring-sky-100/50',
    emerald: 'from-emerald-50 to-white border-emerald-200/70 ring-emerald-100/50',
    rose: 'from-rose-50 to-white border-rose-200/70 ring-rose-100/50',
    violet: 'from-violet-50 to-white border-violet-200/70 ring-violet-100/50',
  };
  const darkAccents = {
    slate:
      'dark:from-[#111c28] dark:via-[#0c141c] dark:to-[#050a0f] dark:border-slate-600/60 dark:ring-teal-900/40 dark:shadow-black/35',
    sky: 'dark:from-[#0c2130] dark:via-[#0a2836] dark:to-[#050d14] dark:border-teal-800/50 dark:ring-cyan-900/40 dark:shadow-black/35',
    emerald: 'dark:from-[#0a2218] dark:via-[#0c1e1a] dark:to-[#050c0f] dark:border-emerald-900/45 dark:ring-emerald-900/35 dark:shadow-black/35',
    rose: 'dark:from-[#221018] dark:via-[#1a1014] dark:to-[#0c0709] dark:border-rose-900/50 dark:ring-rose-900/35 dark:shadow-black/35',
    violet:
      'dark:from-[#1a1030] dark:via-[#140c28] dark:to-[#0a0814] dark:border-violet-900/45 dark:ring-violet-900/35 dark:shadow-black/35',
  };
  const cls =
    `relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-md shadow-slate-900/5 ring-1 transition ${accents[accent] || accents.slate} ${darkAccents[accent] || darkAccents.slate}`;
  const interactiveCls = `${cls} hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#103D4D]/20 dark:focus:ring-teal-500/30`;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {icon ? (
          <span className="text-lg opacity-90" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${interactiveCls} cursor-pointer text-left`}>
        {inner}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={interactiveCls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function WeeklyHoursChart({ series, labels, teamScope }) {
  const max = Math.max(1, ...series);
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-md ring-1 ring-slate-900/5 sm:p-5 dark:border-teal-800/55 dark:bg-gradient-to-br dark:from-[#0f1e29] dark:via-[#0b1828] dark:to-[#050a10] dark:ring-teal-900/40 dark:shadow-black/35">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Weekly hours</h3>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {teamScope ? 'Time logged by your team (last 7 days)' : 'Time you logged (last 7 days)'}
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-800 ring-1 ring-teal-100 dark:bg-gradient-to-r dark:from-teal-900/80 dark:to-cyan-950 dark:text-teal-200 dark:ring-teal-700/50">
          Last 7 days
        </span>
      </div>
      <div className="mt-6 flex h-36 items-end justify-between gap-1.5 border-b border-slate-100 pb-0.5 dark:border-slate-700/80">
        {series.map((v, i) => {
          const h = Math.round((v / max) * 100);
          return (
            <div key={labels[i]} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-28 w-full items-end justify-center">
                <div
                  className="w-[72%] max-w-[2.25rem] rounded-t-lg bg-gradient-to-t from-[#103D4D] to-teal-400 shadow-sm transition-all"
                  style={{ height: `${Math.max(8, h)}%` }}
                  title={`${labels[i]}: ${v}m`}
                />
              </div>
              <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">{labels[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({ active, completed, teamScope }) {
  const a = Math.max(0, active);
  const c = Math.max(0, completed);
  const total = a + c || 1;
  const pctA = Math.round((a / total) * 100);
  const pctC = 100 - pctA;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-md ring-1 ring-slate-900/5 sm:p-5 dark:border-emerald-900/35 dark:bg-gradient-to-br dark:from-[#0f2220] dark:via-[#0a1c22] dark:to-[#050d12] dark:ring-teal-900/40 dark:shadow-black/35">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Project pipeline</h3>
      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        {teamScope ? 'Active vs completed · workspace-wide' : 'Active vs completed projects you can access'}
      </p>
      <div className="mt-5 flex h-10 overflow-hidden rounded-xl ring-1 ring-slate-200/80 dark:ring-slate-600/60">
        <div
          className="flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-500 text-[10px] font-bold text-white shadow-inner"
          style={{ width: `${pctA}%` }}
          title={`${a} active`}
        >
          {pctA >= 18 ? `${a} active` : ''}
        </div>
        <div
          className="flex items-center justify-center bg-gradient-to-r from-violet-500 to-fuchsia-600 text-[10px] font-bold text-white shadow-inner"
          style={{ width: `${pctC}%` }}
          title={`${c} completed`}
        >
          {pctC >= 22 ? `${c} done` : ''}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Active ({a})
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-violet-800 dark:text-violet-300">
          <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden />
          Completed ({c})
        </span>
      </div>
    </div>
  );
}

export default function ErpDashboardOverview({
  loading,
  /** @deprecated name — means “extended KPI strip” (finance/util cards); tied to RBAC + manager roles */
  showManagerOverview = false,
  /** Global workspace admin: KPIs (overdue, hours, utilization) use team-wide totals. */
  teamScopeKpis = false,
  /** Clients: hide time tracking (hours KPI + weekly chart). */
  showTimeTracking = true,
  /** RBAC: modules from the roles matrix */
  showKpiActiveProjects = true,
  showKpiFinance = true,
  showKpiUtilization = true,
  showKpiOverdue = true,
  showKpiHours = true,
  showPipeline = true,
  showWeeklyHoursPair = false,
  showWeeklyHoursSolo = true,
  showDeadlines = true,
  showMyTasks = true,
  activeProjects,
  completedProjects,
  overdueTasks,
  hoursTotalLabel,
  hoursSubLabel,
  revenueLabel,
  showRevenue,
  utilizationLabel,
  utilizationSub = 'Placeholder metric',
  weeklySeries,
  weekDayLabels,
  deadlines,
  myTasks,
  /** Optional click handler that opens an "all overdue tasks" modal. */
  onOverdueClick,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-cyan-200/60 bg-cyan-50/20 py-16 text-[12px] font-medium text-slate-500 dark:border-teal-800/55 dark:bg-gradient-to-br dark:from-teal-950/40 dark:to-slate-900/85 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  const timeKpiVisible = showTimeTracking && showKpiHours;
  const kpiGridClass = showManagerOverview
    ? `grid grid-cols-2 gap-3 ${timeKpiVisible ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`
    : `grid grid-cols-1 gap-3 ${timeKpiVisible ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`;

  return (
    <div className="space-y-4">
      <div className={kpiGridClass}>
        {showKpiActiveProjects ? (
          <KpiCard
            label="Active projects"
            value={String(activeProjects)}
            sub={showManagerOverview ? 'In your workspace scope' : 'Projects you’re on'}
            accent="sky"
            icon="📁"
            href="/erp/projects"
          />
        ) : null}
        {showManagerOverview ? (
          <>
            {showKpiFinance ? (
              showRevenue ? (
                <KpiCard label="Total revenue (AUD)" value={revenueLabel} sub="Client payments received" accent="emerald" icon="💰" />
              ) : (
                <KpiCard label="Total revenue (AUD)" value="—" sub="Admin-only summary" accent="slate" icon="💰" />
              )
            ) : null}
            {showKpiUtilization ? (
              <KpiCard
                label="Team utilization"
                value={utilizationLabel}
                sub={utilizationSub}
                accent="violet"
                icon="📊"
              />
            ) : null}
          </>
        ) : null}
        {showKpiOverdue ? (
          <KpiCard
            label="Overdue tasks"
            value={String(overdueTasks)}
            sub={teamScopeKpis ? 'Whole workspace' : 'Assigned to you'}
            accent="rose"
            icon="⏰"
            onClick={onOverdueClick}
          />
        ) : null}
        {timeKpiVisible ? (
          <KpiCard
            label={teamScopeKpis ? 'Team hours logged' : 'Hours logged'}
            value={hoursTotalLabel}
            sub={hoursSubLabel}
            accent="sky"
            icon="⏱️"
          />
        ) : null}
      </div>

      {showManagerOverview && (showPipeline || showWeeklyHoursPair) ? (
        <div
          className={`grid grid-cols-1 gap-4 ${
            showPipeline && showWeeklyHoursPair ? 'lg:grid-cols-2' : ''
          }`}
        >
          {showPipeline ? (
            <PipelineCard active={activeProjects} completed={completedProjects} teamScope={teamScopeKpis} />
          ) : null}
          {showWeeklyHoursPair ? (
            <WeeklyHoursChart series={weeklySeries} labels={weekDayLabels} teamScope={teamScopeKpis} />
          ) : null}
        </div>
      ) : showWeeklyHoursSolo && timeKpiVisible ? (
        <WeeklyHoursChart series={weeklySeries} labels={weekDayLabels} teamScope={teamScopeKpis} />
      ) : null}

      {(showDeadlines || showMyTasks) ? (
      <div className={`grid grid-cols-1 gap-4 ${showDeadlines && showMyTasks ? 'lg:grid-cols-2' : ''}`}>
        {showDeadlines ? (
        <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 shadow-md ring-1 ring-amber-100/50 dark:border-amber-900/45 dark:from-amber-950/45 dark:via-slate-900/90 dark:to-orange-950/35 dark:ring-amber-900/30">
          <div className="flex items-center justify-between border-b border-amber-100/80 bg-white/60 px-4 py-3 dark:border-amber-900/40 dark:bg-gradient-to-r dark:from-amber-950/50 dark:to-slate-900/80">
            <h3 className="text-sm font-bold text-slate-900 dark:text-amber-100">
              <span aria-hidden className="mr-1">
                🔥
              </span>
              Upcoming deadlines
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800/70 dark:text-amber-300/80">Next 7 days</span>
          </div>
          <div className="p-4">
            {deadlines.length === 0 ? (
              <p className="py-6 text-center text-[12px] font-medium text-slate-500 dark:text-slate-400">No upcoming deadlines 🎉</p>
            ) : (
              <ul className="space-y-2">
                {deadlines.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/erp/projects/${t.project_id}`}
                      className="flex items-start justify-between gap-2 rounded-xl border border-amber-100/80 bg-white/90 px-3 py-2.5 shadow-sm transition hover:border-amber-200 hover:bg-amber-50/30 dark:border-amber-900/40 dark:bg-gradient-to-r dark:from-slate-800/80 dark:to-amber-950/25 dark:hover:border-amber-800/60 dark:hover:from-slate-800 dark:hover:to-amber-950/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-slate-100">{t.title}</p>
                        <p className="truncate text-[10px] text-amber-900/50 dark:text-amber-200/55">{t.projectName}</p>
                      </div>
                      <span className="shrink-0 text-[11px]">
                        <DueDateLabel date={t.due_date} prefix="" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        ) : null}

        {showMyTasks ? (
        <div className="overflow-hidden rounded-2xl border border-cyan-200/60 bg-white/95 shadow-md ring-1 ring-cyan-900/[0.06] dark:border-teal-800/50 dark:bg-gradient-to-br dark:from-[#12182b] dark:via-[#0c2334] dark:to-[#060a14] dark:shadow-[inset_0_1px_0_0_rgba(94,234,212,0.06)] dark:ring-teal-900/35">
          <div className="flex items-center justify-between border-b border-cyan-100/80 bg-gradient-to-r from-cyan-50/50 to-white px-4 py-3 dark:border-teal-900/50 dark:bg-gradient-to-r dark:from-[#0f2438] dark:via-[#0b1e2e] dark:to-[#061018]">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">My tasks</h3>
            <Link href="/erp/my-tasks" className="text-[11px] font-bold text-[#103D4D] hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200">
              View all →
            </Link>
          </div>
          <div className="p-4">
            {myTasks.length === 0 ? (
              <p className="py-6 text-center text-[12px] font-medium text-slate-500 dark:text-slate-400">You&apos;re all caught up.</p>
            ) : (
              <ul className="space-y-0 divide-y divide-slate-100 dark:divide-slate-700/80">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/erp/projects/${t.project_id}`}
                      className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0 transition hover:bg-cyan-50/40 -mx-1 px-1 rounded-lg dark:hover:bg-teal-950/35"
                    >
                      <span className="shrink-0 pt-0.5">
                        <ReadOnlyPriorityPill size="sm" priority={t.priority} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-slate-100">{t.title}</p>
                        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{t.projectName}</p>
                      </div>
                      <span className="shrink-0 text-[11px]">
                        <DueDateLabel date={t.due_date} prefix="" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
