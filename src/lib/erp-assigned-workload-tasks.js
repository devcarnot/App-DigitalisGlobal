/**
 * Helpers for ERP member workload / projects filters: assignments on open child tasks only.
 */

import { parseDateOnlyLocal, startOfLocalDay } from './task-dates';

/** @param {unknown} task */
export function assigneeIdsOnTask(task) {
  const ids = new Set();
  if (task?.assignee_id) ids.add(String(task.assignee_id));
  if (Array.isArray(task?.assignee_ids)) {
    for (const x of task.assignee_ids) if (x) ids.add(String(x));
  }
  return ids;
}

/** Under anchor: real workload row, excluding done/cancelled. */
export function isOpenWorkloadChildTask(task) {
  if (!task?.parent_task_id) return false;
  const st = String(task.status || '').toLowerCase();
  if (st === 'done' || st === 'cancelled') return false;
  return true;
}

/** @param {Date} todayStart startOfLocalDay(today)
 * @param {Date} weekEndStart inclusive end of window (today + 7, start of day) */
export function openWorkloadChildTaskDueBucket(task, todayStart, weekEndStart) {
  if (!task?.due_date) return null;
  const d = parseDateOnlyLocal(task.due_date);
  if (!d) return null;
  const day = startOfLocalDay(d);
  const t0 = todayStart.getTime();
  if (day.getTime() < t0) return 'overdue';
  if (day.getTime() <= weekEndStart.getTime()) return 'dueSoon';
  return null;
}

/**
 * @param {unknown} task
 * @param {string} memberUserId
 * @param {'overdue'|'due7'} mode URL param aligned with Projects grid (`taskDue`)
 */
export function workloadOpenAssignedChildMatchesTaskDueMode(task, memberUserId, mode, todayStart, weekEndStart) {
  if (!memberUserId) return false;
  if (!isOpenWorkloadChildTask(task)) return false;
  const assignees = assigneeIdsOnTask(task);
  if (!assignees.has(String(memberUserId))) return false;
  const b = openWorkloadChildTaskDueBucket(task, todayStart, weekEndStart);
  if (mode === 'overdue') return b === 'overdue';
  if (mode === 'due7') return b === 'dueSoon';
  return false;
}
