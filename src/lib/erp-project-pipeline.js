import { parseDateOnlyLocal, startOfLocalDay } from './task-dates';

/** @param {{ status?: string }[] | null | undefined} taskRows */
export function projectIsCancelled(taskRows) {
  if (!taskRows?.length) return false;
  return taskRows.every((t) => t.status === 'cancelled');
}

/** @param {{ status?: string }[] | null | undefined} taskRows */
export function projectIsComplete(taskRows) {
  if (!taskRows?.length) return false;
  if (taskRows.some((t) => t.status === 'open' || t.status === 'in_progress')) return false;
  return taskRows.some((t) => t.status === 'done');
}

export function projectIsLate(deadlineStr, asOfDate, complete) {
  if (complete) return false;
  if (!deadlineStr) return false;
  const dl = parseDateOnlyLocal(deadlineStr);
  if (!dl) return false;
  return startOfLocalDay(dl).getTime() < startOfLocalDay(asOfDate).getTime();
}

export function normalizeBoardColumn(raw) {
  const v = String(raw || 'todo').toLowerCase();
  if (v === 'todo' || v === 'in_progress' || v === 'review' || v === 'completed') return v;
  return 'todo';
}

/**
 * One bucket per project for manager dashboards.
 * Priority: cancelled → late → done → review → active → pending
 */
export function classifyProjectPipeline(project, rootTasks, asOfDate = new Date()) {
  const tasks = rootTasks || [];
  if (projectIsCancelled(tasks)) return 'cancelled';
  const complete = projectIsComplete(tasks);
  if (projectIsLate(project?.deadline_date, asOfDate, complete)) return 'late';
  if (complete || normalizeBoardColumn(project?.board_column) === 'completed') return 'done';
  const col = normalizeBoardColumn(project?.board_column);
  if (col === 'review') return 'review';
  if (col === 'in_progress') return 'active';
  return 'pending';
}

export const PIPELINE_LABELS = {
  pending: 'Pending',
  active: 'Active',
  review: 'Review',
  done: 'Done',
  late: 'Late',
  cancelled: 'Cancelled',
};

export const PIPELINE_ORDER = ['pending', 'active', 'review', 'done', 'late', 'cancelled'];
