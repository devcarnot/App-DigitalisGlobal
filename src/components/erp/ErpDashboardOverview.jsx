'use client';

import Link from 'next/link';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import { formatTaskDueDate, taskDueColorClasses, taskDueStatus } from '../../lib/task-dates';

/** Small inline chip that renders a formatted due date in the right color for
 *  its status (past → red, today → blue, future → green, missing → muted). */
function DueDateLabel({ date, prefix = 'Due', className = '', missingLabel = '—' }) {
  if (!date) {
    return <span className={`font-semibold text-slate-400 ${className}`}>{missingLabel}</span>;
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
  const cls = `relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-md shadow-slate-900/5 ring-1 transition ${accents[accent] || accents.slate}`;
  const interactiveCls = `${cls} hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#103D4D]/20`;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        {icon ? (
          <span className="text-lg opacity-90" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 text-[10px] font-medium text-slate-500">{sub}</p> : null}
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
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-md ring-1 ring-slate-900/5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Weekly hours</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {teamScope ? 'Time logged by your team (last 7 days)' : 'Time you logged (last 7 days)'}
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-800 ring-1 ring-teal-100">
          Last 7 days
        </span>
      </div>
      <div className="mt-6 flex h-36 items-end justify-between gap-1.5 border-b border-slate-100 pb-0.5">
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
              <span className="text-[9px] font-semibold text-slate-500">{labels[i]}</span>
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
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-md ring-1 ring-slate-900/5 sm:p-5">
      <h3 className="text-sm font-bold text-slate-900">Project pipeline</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {teamScope ? 'Active vs completed · workspace-wide' : 'Active vs completed projects you can access'}
      </p>
      <div className="mt-5 flex h-10 overflow-hidden rounded-xl ring-1 ring-slate-200/80">
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
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Active ({a})
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-violet-800">
          <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden />
          Completed ({c})
        </span>
      </div>
    </div>
  );
}

export default function ErpDashboardOverview({
  loading,
  /** Admin / team lead: full KPI row, pipeline, etc. Members: personal stats only. */
  showManagerOverview = false,
  /** Global workspace admin: KPIs (overdue, hours, utilization) are team-wide totals. */
  teamScopeKpis = false,
  /** Clients: hide time tracking (hours KPI + weekly chart). */
  showTimeTracking = true,
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
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-cyan-200/60 bg-cyan-50/20 py-16 text-[12px] font-medium text-slate-500">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  const kpiGridClass = showManagerOverview
    ? `grid grid-cols-2 gap-3 ${showTimeTracking ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`
    : `grid grid-cols-1 gap-3 ${showTimeTracking ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`;

  return (
    <div className="space-y-4">
      <div className={kpiGridClass}>
        <KpiCard
          label="Active projects"
          value={String(activeProjects)}
          sub={showManagerOverview ? 'In your workspace scope' : 'Projects you’re on'}
          accent="sky"
          icon="📁"
          href="/erp/projects"
        />
        {showManagerOverview ? (
          <>
            {showRevenue ? (
              <KpiCard label="Total revenue (AUD)" value={revenueLabel} sub="Client payments received" accent="emerald" icon="💰" />
            ) : (
              <KpiCard label="Total revenue (AUD)" value="—" sub="Admin-only summary" accent="slate" icon="💰" />
            )}
            <KpiCard
              label="Team utilization"
              value={utilizationLabel}
              sub={utilizationSub}
              accent="violet"
              icon="📊"
            />
          </>
        ) : null}
        <KpiCard
          label="Overdue tasks"
          value={String(overdueTasks)}
          sub={teamScopeKpis ? 'Whole workspace' : 'Assigned to you'}
          accent="rose"
          icon="⏰"
          onClick={onOverdueClick}
        />
        {showTimeTracking ? (
          <KpiCard
            label={teamScopeKpis ? 'Team hours logged' : 'Hours logged'}
            value={hoursTotalLabel}
            sub={hoursSubLabel}
            accent="sky"
            icon="⏱️"
          />
        ) : null}
      </div>

      {showManagerOverview ? (
        <div
          className={`grid grid-cols-1 gap-4 ${showTimeTracking ? 'lg:grid-cols-2' : ''}`}
        >
          <PipelineCard active={activeProjects} completed={completedProjects} teamScope={teamScopeKpis} />
          {showTimeTracking ? (
            <WeeklyHoursChart series={weeklySeries} labels={weekDayLabels} teamScope={teamScopeKpis} />
          ) : null}
        </div>
      ) : showTimeTracking ? (
        <WeeklyHoursChart series={weeklySeries} labels={weekDayLabels} teamScope={teamScopeKpis} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 shadow-md ring-1 ring-amber-100/50">
          <div className="flex items-center justify-between border-b border-amber-100/80 bg-white/60 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">
              <span aria-hidden className="mr-1">
                🔥
              </span>
              Upcoming deadlines
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800/70">Next 7 days</span>
          </div>
          <div className="p-4">
            {deadlines.length === 0 ? (
              <p className="py-6 text-center text-[12px] font-medium text-slate-500">No upcoming deadlines 🎉</p>
            ) : (
              <ul className="space-y-2">
                {deadlines.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/erp/projects/${t.project_id}`}
                      className="flex items-start justify-between gap-2 rounded-xl border border-amber-100/80 bg-white/90 px-3 py-2.5 shadow-sm transition hover:border-amber-200 hover:bg-amber-50/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-slate-900">{t.title}</p>
                        <p className="truncate text-[10px] text-amber-900/50">{t.projectName}</p>
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

        <div className="overflow-hidden rounded-2xl border border-cyan-200/60 bg-white/95 shadow-md ring-1 ring-cyan-900/[0.06]">
          <div className="flex items-center justify-between border-b border-cyan-100/80 bg-gradient-to-r from-cyan-50/50 to-white px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">My tasks</h3>
            <Link href="/erp/my-tasks" className="text-[11px] font-bold text-[#103D4D] hover:text-teal-800">
              View all →
            </Link>
          </div>
          <div className="p-4">
            {myTasks.length === 0 ? (
              <p className="py-6 text-center text-[12px] font-medium text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="space-y-0 divide-y divide-slate-100">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/erp/projects/${t.project_id}`}
                      className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0 transition hover:bg-cyan-50/40 -mx-1 px-1 rounded-lg"
                    >
                      <span className="shrink-0 pt-0.5">
                        <ReadOnlyPriorityPill size="sm" priority={t.priority} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-slate-900">{t.title}</p>
                        <p className="truncate text-[10px] text-slate-500">{t.projectName}</p>
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
      </div>
    </div>
  );
}
