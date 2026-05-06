'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { logErpTaskStatusChange, logErpActivity } from '../../lib/erp-activity-client';
import { buildTaskForest } from '../../lib/erp-task-tree';
import {
  compareTaskPriority,
  normalizeTaskPriority,
} from '../../lib/erp-task-priority';
import { ERP_TASK_STATUS_LABELS, normalizeTaskStatus } from '../../lib/erp-task-status';
import { formatTaskDueDate, taskDueColorClasses, taskDueStatus } from '../../lib/task-dates';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpNativeSelect from './ErpNativeSelect';
import ErpTaskPriorityPicker from './ErpTaskPriorityPicker';
import { ErpTaskAssigneeAvatarRow, assigneeUidList } from './ErpTaskAssigneeAvatarRow';

const KANBAN_STATUSES = ['open', 'in_progress', 'in_review', 'done', 'cancelled'];

/**
 * Column tint + dark header strip — matches the "My tasks" board so project
 * Kanbans feel identical to the workspace board.
 */
function kanbanCardTone(statusId) {
  if (statusId === 'open')
    return 'ring-slate-400/30 border border-slate-300/35 bg-gradient-to-b from-slate-100/95 to-slate-50/85 dark:border-slate-600/50 dark:ring-slate-600/35 dark:bg-[#0e1824] dark:[background-image:none]';
  if (statusId === 'in_progress')
    return 'ring-sky-400/35 border border-sky-300/40 bg-gradient-to-b from-sky-100/90 to-cyan-50/75 dark:border-sky-800/45 dark:ring-sky-700/35 dark:bg-[#0c1824] dark:[background-image:none]';
  if (statusId === 'in_review')
    return 'ring-violet-400/35 border border-violet-300/40 bg-gradient-to-b from-violet-100/85 to-fuchsia-50/55 dark:border-violet-800/45 dark:ring-violet-700/35 dark:bg-[#14101c] dark:[background-image:none]';
  if (statusId === 'done')
    return 'ring-emerald-400/30 border border-emerald-300/40 bg-gradient-to-b from-emerald-100/90 to-teal-50/70 dark:border-emerald-800/45 dark:ring-emerald-700/30 dark:bg-[#0a1814] dark:[background-image:none]';
  return 'ring-rose-400/30 border border-rose-300/35 bg-gradient-to-b from-rose-100/85 to-red-50/60 dark:border-rose-800/45 dark:ring-rose-700/35 dark:bg-[#1a1014] dark:[background-image:none]';
}

function kanbanHeaderClass(statusId) {
  if (statusId === 'open')
    return 'bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white shadow-md shadow-slate-900/20 dark:bg-[#283240] dark:[background-image:none]';
  if (statusId === 'in_progress')
    return 'bg-gradient-to-r from-sky-900 via-cyan-800 to-teal-900 text-white shadow-md shadow-cyan-900/25 dark:bg-[#105a6b] dark:[background-image:none]';
  if (statusId === 'in_review')
    return 'bg-gradient-to-r from-violet-900 via-indigo-900 to-violet-950 text-white shadow-md shadow-violet-900/25 dark:bg-[#2d2345] dark:[background-image:none]';
  if (statusId === 'done')
    return 'bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 text-emerald-50 shadow-md shadow-emerald-900/20 dark:bg-[#174030] dark:text-emerald-100 dark:[background-image:none]';
  return 'bg-gradient-to-r from-rose-900 via-rose-950 to-red-900 text-rose-50 shadow-md shadow-rose-900/25 dark:bg-[#4a1e28] dark:text-rose-100 dark:[background-image:none]';
}

function kanbanDropRing(statusId) {
  if (statusId === 'open') return 'ring-2 ring-slate-500/40 ring-offset-2 ring-offset-slate-50 shadow-lg shadow-slate-900/15';
  if (statusId === 'in_progress') return 'ring-2 ring-sky-500 ring-offset-2 ring-offset-sky-50 shadow-lg shadow-sky-900/15';
  if (statusId === 'in_review') return 'ring-2 ring-violet-500 ring-offset-2 ring-offset-violet-50 shadow-lg shadow-violet-900/15';
  if (statusId === 'done') return 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-emerald-50 shadow-lg shadow-emerald-900/15';
  return 'ring-2 ring-rose-500 ring-offset-2 ring-offset-rose-50 shadow-lg shadow-rose-900/15';
}

function sortSubs(subs) {
  return [...subs].sort((a, b) => {
    const pr = compareTaskPriority(normalizeTaskPriority(a.priority), normalizeTaskPriority(b.priority));
    if (pr !== 0) return pr;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
}

/**
 * List or Kanban for project tasks (rows with parent_task_id — work items under the project anchor).
 * Used on My tasks, dashboard boards, and the project workspace.
 */
export default function ErpProjectSubtasksPanel({
  projectId,
  tasks = [],
  viewMode,
  onReload,
  isWorkspaceAdmin = false,
  /** Tighter spacing when embedded in dense list layouts (e.g. My tasks list view). */
  dense = false,
  /** Current user id — used to log task status changes for admin activity. */
  userId = null,
  /** When false, empty state does not link to the workspace (already on that page). */
  showOpenProjectLink = true,
  /** When true, task titles are plain text (no link to the same workspace URL). */
  plainTitles = false,
  /** Optional: parent-provided edit handler. */
  onEditTask,
  /** Optional: parent-provided detail (read-only preview) handler. Used on card click. */
  onOpenTask,
  /**
   * When 'mine', only tasks assigned to `userId` are shown (via assignee_id or
   * assignee_ids). Anything else ('team' / undefined) keeps the default
   * behavior of showing every task in the project.
   */
  scope = 'team',
  /** Workspace roster lookup — when set, show assignee avatars on Kanban/list rows. */
  avatarProfileFor = null,
}) {
  const [statusSavingId, setStatusSavingId] = useState(null);
  const [prioritySavingId, setPrioritySavingId] = useState(null);
  const [kanbanDragSubId, setKanbanDragSubId] = useState(null);
  const [kanbanDropHoverStatus, setKanbanDropHoverStatus] = useState(null);

  const { subs, parentTitleById, hiddenByScope } = useMemo(() => {
    const list = tasks || [];
    const { roots } = buildTaskForest(list);
    const rootTitle = {};
    for (const r of roots) {
      rootTitle[r.id] = r.title || 'Task';
    }
    const withParent = list.filter((t) => t.parent_task_id);
    let visible = withParent;
    let hidden = 0;
    if (scope === 'mine' && userId) {
      const beforeLen = withParent.length;
      visible = withParent.filter((t) => {
        if (t?.assignee_id && t.assignee_id === userId) return true;
        const many = Array.isArray(t?.assignee_ids) ? t.assignee_ids : null;
        if (many && many.includes(userId)) return true;
        return false;
      });
      hidden = beforeLen - visible.length;
    }
    return {
      subs: sortSubs(visible),
      parentTitleById: rootTitle,
      hiddenByScope: hidden,
    };
  }, [tasks, scope, userId]);

  const setTaskStatus = useCallback(
    async (taskId, nextStatus) => {
      if (!taskId) return;
      const sub = subs.find((s) => s.id === taskId);
      const prev = sub ? normalizeTaskStatus(sub.status) : null;
      const normalized = normalizeTaskStatus(nextStatus);
      setStatusSavingId(taskId);
      try {
        const { error } = await supabase
          .from('erp_tasks')
          .update({ status: normalized, updated_at: new Date().toISOString() })
          .eq('id', taskId);
        if (!error && userId && projectId) {
          void logErpTaskStatusChange({
            projectId,
            userId,
            taskId,
            title: sub?.title,
            previousStatus: prev,
            nextStatus: normalized,
          });
        }
        if (!error) onReload?.();
      } finally {
        setStatusSavingId(null);
      }
    },
    [onReload, subs, userId, projectId],
  );

  const setTaskPriority = useCallback(
    async (taskId, nextPriority) => {
      if (!taskId || !isWorkspaceAdmin) return;
      const sub = subs.find((s) => s.id === taskId);
      const prevP = sub ? normalizeTaskPriority(sub.priority) : null;
      setPrioritySavingId(taskId);
      try {
        const { error } = await supabase
          .from('erp_tasks')
          .update({ priority: nextPriority, updated_at: new Date().toISOString() })
          .eq('id', taskId);
        if (!error) {
          if (userId && projectId && sub) {
            void logErpActivity({
              projectId,
              userId,
              action: 'task_priority_changed',
              meta: {
                task_id: taskId,
                title: sub.title || '',
                from: prevP,
                to: nextPriority,
              },
            });
          }
          onReload?.();
        }
      } finally {
        setPrioritySavingId(null);
      }
    },
    [isWorkspaceAdmin, onReload, subs, userId, projectId],
  );

  const workspaceHref = `/erp/projects/${projectId}`;

  if (subs.length === 0) {
    if (scope === 'mine' && hiddenByScope > 0) {
      return (
        <p
          className={`text-[11px] text-slate-500 ${dense ? 'py-0' : 'border-t border-slate-100 pt-3'}`}
        >
          Nothing assigned to you in this project yet.{' '}
          <span className="text-slate-400">
            ({hiddenByScope === 1 ? '1 task' : `${hiddenByScope} tasks`} hidden)
          </span>
        </p>
      );
    }
    return (
      <p
        className={`text-[11px] text-slate-400 ${dense ? 'py-0' : 'border-t border-slate-100 pt-3'}`}
      >
        {showOpenProjectLink ? (
          <>
            No tasks yet —{' '}
            <Link href={workspaceHref} className="font-semibold text-[#589CD5] hover:text-[#3d7fb8]">
              open project
            </Link>
          </>
        ) : (
          <>No tasks yet. Use <span className="font-semibold text-slate-600">+ Task</span> above to add one.</>
        )}
      </p>
    );
  }

  if (viewMode === 'list') {
    return (
      <ul
        className={`space-y-0 divide-y divide-slate-100 dark:divide-slate-700/80 ${
          dense ? 'mt-0 border-t-0 pt-0' : 'mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/70'
        }`}
      >
        {subs.map((sub) => {
          const parentLabel = parentTitleById[sub.parent_task_id] || 'Task';
          return (
            <li key={sub.id} className={`list-none ${dense ? 'py-1.5 first:pt-0' : 'py-2.5 first:pt-0'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  {plainTitles ? (
                    typeof onOpenTask === 'function' ? (
                      <button
                        type="button"
                        onClick={() => onOpenTask(sub.id)}
                        className={`text-left font-medium text-slate-800 hover:text-[#3d7fb8] line-clamp-2 dark:text-slate-200 dark:hover:text-cyan-300 ${dense ? 'text-xs' : 'text-sm'}`}
                      >
                        {sub.title}
                      </button>
                    ) : (
                      <span className={`font-medium text-slate-800 dark:text-slate-200 line-clamp-2 ${dense ? 'text-xs' : 'text-sm'}`}>
                        {sub.title}
                      </span>
                    )
                  ) : (
                    <Link
                      href={workspaceHref}
                      className={`font-medium text-slate-800 hover:text-[#3d7fb8] line-clamp-2 dark:text-slate-200 dark:hover:text-cyan-300 ${dense ? 'text-xs' : 'text-sm'}`}
                    >
                      {sub.title}
                    </Link>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="text-slate-400 dark:text-slate-500">Project</span> · {parentLabel}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                    <ErpTaskAssigneeAvatarRow uids={assigneeUidList(sub)} avatarProfileFor={avatarProfileFor} />
                    <span className="text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-400 dark:text-slate-500">Start</span>{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {sub.start_date ? formatTaskDueDate(sub.start_date) : 'Not set'}
                      </span>
                    </span>
                    {(() => {
                      const due = sub.due_date;
                      const c = taskDueColorClasses(due ? taskDueStatus(due) : null);
                      return (
                        <span className={c.value}>
                          <span className={`font-medium ${c.label}`}>Due</span>{' '}
                          <span className="font-semibold">{due ? formatTaskDueDate(due) : 'Not set'}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {typeof onEditTask === 'function' ? (
                    <button
                      type="button"
                      onClick={() => onEditTask(sub.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold uppercase text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#1f2934] dark:text-slate-200 dark:hover:bg-[#273240] dark:[background-image:none]"
                      aria-label="Edit task"
                    >
                      Edit
                    </button>
                  ) : null}
                  {isWorkspaceAdmin ? (
                    <ErpTaskPriorityPicker
                      size="sm"
                      value={normalizeTaskPriority(sub.priority)}
                      disabled={prioritySavingId === sub.id}
                      onChange={(next) => void setTaskPriority(sub.id, next)}
                      ariaLabel="Task priority"
                    />
                  ) : (
                    <ReadOnlyPriorityPill size="sm" priority={sub.priority} />
                  )}
                  <ErpNativeSelect
                    zoneSize="sm"
                    value={normalizeTaskStatus(sub.status)}
                    disabled={statusSavingId === sub.id}
                    onChange={(e) => void setTaskStatus(sub.id, e.target.value)}
                    aria-label="Task status"
                    className="max-w-[8.5rem] rounded-lg border border-slate-200 bg-white !pl-2 !pr-8 py-1 text-[9px] font-semibold uppercase text-slate-700 outline-none dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-200"
                  >
                    <option value="open">{ERP_TASK_STATUS_LABELS.open}</option>
                    <option value="in_progress">{ERP_TASK_STATUS_LABELS.in_progress}</option>
                    <option value="in_review">{ERP_TASK_STATUS_LABELS.in_review}</option>
                    <option value="done">{ERP_TASK_STATUS_LABELS.done}</option>
                    <option value="cancelled">{ERP_TASK_STATUS_LABELS.cancelled}</option>
                  </ErpNativeSelect>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  /* Kanban — mirrors the "My tasks" board: five columns in one row on wide
     screens, dark header strip, tinted column body, rich task cards. */
  return (
    <div className={dense ? 'mt-0 border-t-0 pt-0' : 'mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/70'}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 lg:items-stretch xl:min-h-[680px] w-full min-w-0">
        {KANBAN_STATUSES.map((statusId) => {
          const inCol = subs.filter((s) => normalizeTaskStatus(s.status) === statusId);
          const isDropHover = kanbanDropHoverStatus === statusId && kanbanDragSubId;
          return (
            <div
              key={statusId}
              className={`flex min-w-0 flex-col rounded-xl p-3 sm:p-3.5 min-h-[200px] lg:min-h-[680px] lg:h-full transition-[box-shadow,ring] ${kanbanCardTone(statusId)} ${
                isDropHover ? kanbanDropRing(statusId) : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setKanbanDropHoverStatus(statusId);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setKanbanDropHoverStatus(statusId);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setKanbanDropHoverStatus((prev) => (prev === statusId ? null : prev));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData('text/plain') || kanbanDragSubId;
                if (raw) {
                  const cur = subs.find((s) => s.id === raw);
                  const next = normalizeTaskStatus(statusId);
                  if (cur && normalizeTaskStatus(cur.status) !== next) {
                    void setTaskStatus(raw, next);
                  }
                }
                setKanbanDragSubId(null);
                setKanbanDropHoverStatus(null);
              }}
            >
              <div className={`overflow-hidden rounded-lg mb-3 ${kanbanHeaderClass(statusId)}`}>
                <div className="flex items-center justify-between px-2.5 py-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider">
                    {ERP_TASK_STATUS_LABELS[statusId]}
                  </p>
                  <span className="text-[11px] font-bold tabular-nums rounded-md bg-white/15 border border-white/25 px-1.5 py-0.5 text-white/95">
                    {inCol.length}
                  </span>
                </div>
              </div>
              <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto max-h-[min(70vh,520px)] lg:max-h-none lg:overflow-visible pr-0.5 [scrollbar-width:thin]">
                {inCol.map((sub) => {
                  const isDragging = kanbanDragSubId === sub.id;
                  const isSaving = statusSavingId === sub.id;
                  const due = sub.due_date;
                  const startD = sub.start_date;
                  const assignees = assigneeUidList(sub);
                  return (
                    <li
                      key={sub.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', sub.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setKanbanDragSubId(sub.id);
                      }}
                      onDragEnd={() => {
                        setKanbanDragSubId(null);
                        setKanbanDropHoverStatus(null);
                      }}
                      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-60' : ''} ${
                        isSaving ? 'pointer-events-none opacity-70' : ''
                      }`}
                    >
                      <div className="overflow-hidden rounded-xl border border-cyan-200/50 bg-white/95 shadow-md shadow-cyan-900/8 backdrop-blur-sm transition-all hover:border-cyan-400/50 hover:shadow-lg hover:ring-1 hover:ring-violet-200/40 dark:border-teal-800/50 dark:bg-[#151f28] dark:shadow-black/35 dark:[background-image:none] dark:backdrop-blur-none dark:hover:border-teal-600/50 dark:hover:ring-teal-900/40">
                        {plainTitles ? (
                          <button
                            type="button"
                            onClick={
                              typeof onOpenTask === 'function'
                                ? () => onOpenTask(sub.id)
                                : typeof onEditTask === 'function'
                                  ? () => onEditTask(sub.id)
                                  : undefined
                            }
                            disabled={
                              typeof onOpenTask !== 'function' && typeof onEditTask !== 'function'
                            }
                            draggable={false}
                            className="block w-full text-left px-3 pt-3 pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded-t-xl disabled:cursor-default"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug break-words min-w-0 line-clamp-3">
                                {sub.title || 'Untitled task'}
                              </p>
                              {isWorkspaceAdmin ? (
                                <span onClick={(e) => e.stopPropagation()}>
                                  <ErpTaskPriorityPicker
                                    size="sm"
                                    value={normalizeTaskPriority(sub.priority)}
                                    disabled={prioritySavingId === sub.id}
                                    onChange={(next) => void setTaskPriority(sub.id, next)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    ariaLabel="Priority"
                                  />
                                </span>
                              ) : (
                                <ReadOnlyPriorityPill priority={normalizeTaskPriority(sub.priority)} />
                              )}
                            </div>
                          </button>
                        ) : (
                          <Link
                            href={workspaceHref}
                            draggable={false}
                            className="block px-3 pt-3 pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded-t-xl"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug break-words min-w-0 line-clamp-3">
                                {sub.title || 'Untitled task'}
                              </p>
                              <ReadOnlyPriorityPill priority={normalizeTaskPriority(sub.priority)} />
                            </div>
                          </Link>
                        )}
                        <div className="flex items-start justify-between gap-2 px-3 pb-3">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug">
                            <ErpTaskAssigneeAvatarRow uids={assignees} avatarProfileFor={avatarProfileFor} />
                            <span className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium text-slate-400 dark:text-slate-500">Start</span>{' '}
                              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                {startD ? formatTaskDueDate(startD) : 'Not set'}
                              </span>
                            </span>
                            {(() => {
                              const c = taskDueColorClasses(due ? taskDueStatus(due) : null);
                              return (
                                <span className={c.value}>
                                  <span className={`font-medium ${c.label}`}>Due</span>{' '}
                                  <span className="font-semibold tabular-nums">{due ? formatTaskDueDate(due) : 'Not set'}</span>
                                </span>
                              );
                            })()}
                          </div>
                          {typeof onEditTask === 'function' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTask(sub.id);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              draggable={false}
                              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm transition hover:border-[#103D4D]/40 hover:text-[#103D4D] dark:border-slate-600 dark:bg-[#1f2934] dark:text-slate-300 dark:hover:border-teal-500/50 dark:hover:text-teal-200"
                              aria-label="Edit task"
                              title="Edit task"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4.5 1 1-4.5 12.862-12.226z" />
                              </svg>
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {inCol.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center px-2 py-10 text-center lg:py-0">
                    <span className="text-xs text-slate-500/40 font-medium">Empty</span>
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
