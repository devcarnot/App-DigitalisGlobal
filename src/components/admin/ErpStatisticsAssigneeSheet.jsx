'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { formatTaskDueDate } from '../../lib/task-dates';
import { ERP_TASK_STATUS_LABELS } from '../../lib/erp-task-status';
import ErpUserAvatar from '../erp/ErpUserAvatar';
import ErpExportCsvButton from '../erp/ErpExportCsvButton';

const TASK_EXPORT_COLUMNS = [
  { header: 'Task', value: (r) => r.title || 'Untitled task' },
  { header: 'Status', value: (r) => ERP_TASK_STATUS_LABELS[r.status] || r.status || 'Open' },
  { header: 'Project', value: (r) => r.projectName || 'Project' },
  { header: 'Start date', value: (r) => (r.start_date ? formatTaskDueDate(r.start_date) : '') },
  { header: 'Due date', value: (r) => (r.due_date ? formatTaskDueDate(r.due_date) : '') },
];

const STATUS_BADGE = {
  open: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
  in_progress: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100',
  in_review: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100',
  done: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

/**
 * Right-side task list when an assignee is selected on Statistics charts.
 */
export default function ErpStatisticsAssigneeSheet({
  open,
  assigneeId,
  assigneeLabel,
  profile,
  tasks = [],
  projectNameById = {},
  onClose,
}) {
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const da = a.due_date || '9999-12-31';
      const db = b.due_date || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }, [tasks]);

  const exportRows = useMemo(
    () =>
      sortedTasks.map((task) => ({
        ...task,
        projectName: projectNameById[task.project_id] || 'Project',
        status: String(task.status || 'open'),
      })),
    [sortedTasks, projectNameById],
  );

  const exportFilename = useMemo(() => {
    const slug = String(assigneeLabel || 'tasks')
      .toLowerCase()
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return `erp-statistics-tasks-${slug || 'list'}-${new Date().toISOString().slice(0, 10)}`;
  }, [assigneeLabel]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !assigneeId) return null;

  return (
    <div className="fixed inset-0 z-[500] flex justify-end lg:pl-8" role="dialog" aria-modal="true" aria-label={`Tasks for ${assigneeLabel}`}>
      <button type="button" className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]" onClick={onClose} aria-label="Close panel" />
      <div className="relative flex h-full w-full max-w-[min(100%,26rem)] flex-col border-l border-cyan-200/60 bg-white shadow-[-12px_0_48px_-12px_rgba(16,61,77,0.28)] dark:border-teal-900/55 dark:bg-[#0a121a] sm:max-w-md">
        <div className="shrink-0 border-b border-cyan-200/50 erp-brand-fill px-4 py-4 text-white shadow-md dark:border-teal-900/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {assigneeId !== '__unassigned__' ? (
                <ErpUserAvatar profile={profile} size="sm" className="!h-10 !w-10 shrink-0 !ring-2 !ring-white/30" alt="" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold ring-2 ring-white/30">
                  ?
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight">{assigneeLabel}</p>
                <p className="mt-0.5 text-[11px] font-medium text-cyan-100/90">
                  {sortedTasks.length} task{sortedTasks.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
              >
                Close
              </button>
              <ErpExportCsvButton
                filename={exportFilename}
                columns={TASK_EXPORT_COLUMNS}
                rows={exportRows}
                label="Export CSV"
                className="!border-white/25 !bg-white/10 !text-white hover:!bg-white/20"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:thin]">
          {sortedTasks.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No tasks for this selection.</p>
          ) : (
            <ul className="divide-y divide-slate-200/80 dark:divide-teal-900/40">
              {sortedTasks.map((task) => {
                const status = String(task.status || 'open');
                const projectName = projectNameById[task.project_id] || 'Project';
                return (
                  <li key={task.id}>
                    <Link
                      href={`/erp/projects/${task.project_id}`}
                      onClick={onClose}
                      className="flex flex-col gap-1.5 px-4 py-3 transition hover:bg-cyan-50/70 dark:hover:bg-white/5"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            STATUS_BADGE[status] || STATUS_BADGE.open
                          }`}
                        >
                          {ERP_TASK_STATUS_LABELS[status] || status}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                          {task.title || 'Untitled task'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-teal-800/80 dark:text-teal-200/80">{projectName}</span>
                        {task.start_date ? (
                          <span>Start {formatTaskDueDate(task.start_date)}</span>
                        ) : (
                          <span>No start date</span>
                        )}
                        {task.due_date ? (
                          <span>Due {formatTaskDueDate(task.due_date)}</span>
                        ) : (
                          <span>No due date</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
