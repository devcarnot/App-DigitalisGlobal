'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { memberProjectsHref, memberWorkloadSliceHref } from '../../lib/erp-member-projects-links';
import { ERP_TASK_STATUS_LABELS } from '../../lib/erp-task-status';
import { formatTaskDueDate, taskDueColorClasses, taskDueStatus } from '../../lib/task-dates';
import {
  attendanceAverageForWindow,
  attendanceLiveBreakSeconds,
  attendanceRowNetSeconds,
  formatAttendanceAverageSeconds,
  formatWorkDate,
  localDateString,
} from '../../lib/erp-attendance';
import ErpUserAvatar from './ErpUserAvatar';
import {
  AttendanceHistoryTable,
  AttendanceHoursBarChart,
  buildDailyNetSeriesForRange,
  formatNetHoursShort,
  formatSecondsAsHms,
} from './ErpAttendanceCharts';
import { useTeamMemberTaskDetail } from './attendance/useTeamMemberTaskDetail';

/**
 * @param {{
 *   open: boolean,
 *   member: { id: string, full_name?: string | null, role?: string | null } | null,
 *   rows: object[],
 *   rangeFrom: string,
 *   rangeTo: string,
 *   rangeLabel: string,
 *   onClose: () => void,
 *   canEdit?: boolean,
 *   onEditRow?: (row: object) => void,
 *   workload?: {
 *     total?: number,
 *     active?: number,
 *     completed?: number,
 *     openTasks?: number,
 *     overdue?: number,
 *     dueSoon?: number,
 *     activeProjects?: { id: string, name: string }[],
 *   } | null,
 *   initialTab?: 'overview' | 'projects' | 'tasks' | 'history',
 *   taskFilter?: 'all' | 'overdue',
 * }} props
 */
export default function ErpAttendanceMemberDetailSheet({
  open,
  member,
  rows,
  workload,
  initialTab = 'overview',
  taskFilter = 'all',
  rangeFrom,
  rangeTo,
  rangeLabel,
  onClose,
  canEdit = false,
  onEditRow,
}) {
  const [detailTab, setDetailTab] = useState(initialTab);

  const memberId = member?.id;
  const memberRows = useMemo(
    () =>
      [...(rows || [])]
        .filter((r) => r.user_id === memberId)
        .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date))),
    [rows, memberId],
  );

  const todayStr = localDateString();
  const { tasks, loading: tasksLoading } = useTeamMemberTaskDetail(open && memberId ? memberId : null);

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'overdue') return tasks.filter((t) => t.dueBucket === 'overdue');
    return tasks;
  }, [tasks, taskFilter]);

  useEffect(() => {
    if (open) setDetailTab(initialTab);
    else setDetailTab('overview');
  }, [open, memberId, initialTab]);

  const rangeRows = useMemo(
    () =>
      memberRows.filter((r) => {
        const d = String(r.work_date).slice(0, 10);
        return d >= String(rangeFrom).slice(0, 10) && d <= String(rangeTo).slice(0, 10);
      }),
    [memberRows, rangeFrom, rangeTo],
  );

  const stats = useMemo(() => {
    let completed = 0;
    let missingOut = 0;
    let totalNetSec = 0;
    let totalBreakSec = 0;
    const nowMs = Date.now();
    for (const r of rangeRows) {
      if (r.check_in_at && r.check_out_at) completed += 1;
      else if (r.check_in_at && !r.check_out_at) missingOut += 1;
      if (r.check_in_at && memberId) {
        totalNetSec += attendanceRowNetSeconds(r, nowMs, { uid: memberId, workDate: r.work_date });
        const breakSec =
          r.break_started_at && !r.check_out_at
            ? attendanceLiveBreakSeconds(r, nowMs, { uid: memberId, workDate: r.work_date })
            : Math.max(0, Number(r.break_seconds_total) || 0);
        totalBreakSec += breakSec;
      }
    }
    return {
      completed,
      missingOut,
      totalNetSec,
      totalBreakSec,
      avg7: attendanceAverageForWindow(memberRows, todayStr, 7, nowMs, { uid: memberId }),
      avg14: attendanceAverageForWindow(memberRows, todayStr, 14, nowMs, { uid: memberId }),
      avg30: attendanceAverageForWindow(memberRows, todayStr, 30, nowMs, { uid: memberId }),
    };
  }, [rangeRows, memberRows, memberId, todayStr]);

  const chartSeries = useMemo(
    () => buildDailyNetSeriesForRange(rangeFrom, rangeTo, rangeRows, memberId, Date.now()),
    [rangeFrom, rangeTo, rangeRows, memberId],
  );

  if (!open || !member) return null;

  const name = member.full_name?.trim() || 'Member';

  return (
    <div className="fixed inset-0 z-[500] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="attendance-member-sheet-title">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close panel" />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-teal-900/50 dark:bg-[#0a1018]">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-white px-4 py-4 dark:border-teal-900/45 dark:from-[#0d141c] dark:to-[#0a1018] dark:[background-image:none]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ErpUserAvatar profile={member} size="md" alt={name} />
              <div className="min-w-0">
                <h2 id="attendance-member-sheet-title" className="truncate text-lg font-bold text-slate-900 dark:text-white">
                  {name}
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{rangeLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              Close
            </button>
          </div>

          <div role="tablist" aria-label="Member attendance views" className="mt-3 flex flex-wrap gap-1.5">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'projects', label: 'Projects', count: workload?.active ?? null },
              { id: 'tasks', label: 'Tasks', count: tasksLoading ? workload?.openTasks ?? null : tasks.length || workload?.openTasks || null },
              { id: 'history', label: 'History', count: memberRows.length },
            ].map((tab) => {
              const active = detailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDetailTab(tab.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    active
                      ? 'bg-[#103D4D] text-white dark:bg-teal-700/90'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-[#101a22] dark:text-slate-300 dark:ring-teal-900/55'
                  }`}
                >
                  {tab.label}
                  {tab.count != null ? (
                    <span className={`rounded-full px-1 text-[9px] tabular-nums ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-white/10'}`}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
          {detailTab === 'overview' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-teal-200/55 bg-teal-50/50 px-2.5 py-2 dark:border-teal-900/45 dark:bg-[#0e1824]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-teal-800/80 dark:text-teal-300">Total net</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{formatNetHoursShort(stats.totalNetSec)}</p>
                </div>
                <div className="rounded-xl border border-violet-200/55 bg-violet-50/50 px-2.5 py-2 dark:border-violet-900/45 dark:bg-[#141020]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-violet-800/80 dark:text-violet-300">Pauses</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{formatNetHoursShort(stats.totalBreakSec)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200/55 bg-emerald-50/50 px-2.5 py-2 dark:border-emerald-900/45 dark:bg-[#101816]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-800/80 dark:text-emerald-300">Completed</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{stats.completed}</p>
                </div>
                <div className="rounded-xl border border-amber-200/55 bg-amber-50/50 px-2.5 py-2 dark:border-amber-900/45 dark:bg-[#1a1408]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300">Missing out</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{stats.missingOut}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Avg 7d', stat: stats.avg7 },
                  { label: 'Avg 14d', stat: stats.avg14 },
                  { label: 'Avg 30d', stat: stats.avg30 },
                ].map(({ label, stat }) => (
                  <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 dark:border-teal-900/35 dark:bg-[#0a1018]">
                    <p className="text-[8px] font-bold uppercase text-slate-500">{label}</p>
                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {stat.loggedDayCount > 0 ? formatAttendanceAverageSeconds(stat.avgSec) : '—'}
                    </p>
                    <p className="text-[8px] text-slate-500">
                      {stat.loggedDayCount > 0
                        ? `${stat.loggedDayCount} working day${stat.loggedDayCount === 1 ? '' : 's'}`
                        : '—'}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 dark:border-teal-900/35 dark:bg-[#0c121a]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-white">Daily hours</p>
                  <span className="text-[9px] font-semibold uppercase text-slate-500">Selected range</span>
                </div>
                <AttendanceHoursBarChart
                  labels={chartSeries.labels}
                  minutes={chartSeries.minutes}
                  dates={chartSeries.dates}
                  compact
                />
              </div>
            </div>
          ) : null}

          {detailTab === 'projects' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Active', value: workload?.active ?? 0 },
                  { label: 'Open tasks', value: workload?.openTasks ?? 0 },
                  { label: 'Overdue', value: workload?.overdue ?? 0, warn: (workload?.overdue ?? 0) > 0 },
                  { label: 'Due this week', value: workload?.dueSoon ?? 0 },
                ].map(({ label, value, warn }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-teal-900/35 dark:bg-[#0a1018]"
                  >
                    <p className="text-[8px] font-bold uppercase text-slate-500">{label}</p>
                    <p
                      className={`font-mono text-sm font-bold tabular-nums ${
                        warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={memberWorkloadSliceHref(memberId, 'active')}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold dark:border-teal-800/45 dark:bg-[#131b24]"
                >
                  Active projects
                </Link>
                <Link
                  href={memberWorkloadSliceHref(memberId, 'assigned')}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold dark:border-teal-800/45 dark:bg-[#131b24]"
                >
                  Open tasks
                </Link>
                {(workload?.overdue ?? 0) > 0 ? (
                  <Link
                    href={memberWorkloadSliceHref(memberId, 'overdue')}
                    className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-900 dark:border-amber-900/45 dark:bg-amber-950/30 dark:text-amber-100"
                  >
                    Overdue ({workload.overdue})
                  </Link>
                ) : null}
                <Link
                  href={memberProjectsHref(memberId, { status: 'all' })}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 dark:border-teal-800/45 dark:bg-[#131b24] dark:text-slate-300"
                >
                  All projects
                </Link>
              </div>

              {(workload?.activeProjects?.length ?? 0) > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-teal-900/35 dark:border-teal-900/35">
                  {workload.activeProjects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/erp/projects/${p.id}`}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-teal-950/30"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-slate-400">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-slate-500">No active projects assigned.</p>
              )}
            </div>
          ) : null}

          {detailTab === 'tasks' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Active', value: workload?.active ?? 0 },
                  { label: 'Open tasks', value: tasksLoading ? (workload?.openTasks ?? 0) : (filteredTasks.length || workload?.openTasks || 0) },
                  { label: 'Overdue', value: workload?.overdue ?? 0, warn: (workload?.overdue ?? 0) > 0 },
                  { label: 'Due this week', value: workload?.dueSoon ?? 0 },
                ].map(({ label, value, warn }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-teal-900/35 dark:bg-[#0a1018]"
                  >
                    <p className="text-[8px] font-bold uppercase text-slate-500">{label}</p>
                    <p
                      className={`font-mono text-sm font-bold tabular-nums ${
                        warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={memberWorkloadSliceHref(memberId, 'assigned')}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold dark:border-teal-800/45 dark:bg-[#131b24]"
                >
                  Open in Projects
                </Link>
                {(workload?.overdue ?? 0) > 0 ? (
                  <Link
                    href={memberWorkloadSliceHref(memberId, 'overdue')}
                    className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-900 dark:border-amber-900/45 dark:bg-amber-950/30 dark:text-amber-100"
                  >
                    Overdue ({workload.overdue})
                  </Link>
                ) : null}
              </div>

              {tasksLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <p className="text-[12px] text-slate-500">
                  {taskFilter === 'overdue' ? 'No overdue tasks assigned.' : 'No open tasks assigned.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-teal-900/35 dark:border-teal-900/35">
                  {filteredTasks.map((t) => {
                    const dueSt = t.dueDate ? taskDueStatus(t.dueDate) : null;
                    const dueCls = taskDueColorClasses(dueSt);
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/erp/projects/${t.projectId}`}
                          className="block px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-teal-950/30"
                        >
                          <p className="text-[12.5px] font-medium leading-snug text-slate-900 dark:text-white">{t.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">{t.projectName}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600 dark:border-teal-800/45 dark:bg-[#131b24] dark:text-slate-300">
                              {ERP_TASK_STATUS_LABELS[t.status] || t.status}
                            </span>
                            {t.dueDate ? (
                              <span className={`text-[10px] font-medium ${dueCls.value}`}>
                                {formatTaskDueDate(t.dueDate)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">No due date</span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {detailTab === 'history' ? (
            <div>
              <AttendanceHistoryTable
                rows={memberRows}
                uid={memberId}
                showBreaks
                onEditRow={canEdit && onEditRow ? onEditRow : undefined}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
