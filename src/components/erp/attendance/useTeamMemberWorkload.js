'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { filterActiveErpProjectIds } from '../../../lib/erp-active-projects';
import {
  assigneeIdsOnTask,
  isOpenWorkloadChildTask,
  openWorkloadChildTaskDueBucket,
} from '../../../lib/erp-assigned-workload-tasks';
import { parseDateOnlyLocal, startOfLocalDay } from '../../../lib/task-dates';

const CHUNK = 80;

function normalizeBoardColumn(v) {
  const x = String(v || '').toLowerCase();
  if (x === 'todo' || x === 'in_progress' || x === 'review' || x === 'completed' || x === 'icebox') return x;
  return 'in_progress';
}

/**
 * @typedef {{
 *   total: number,
 *   active: number,
 *   completed: number,
 *   openTasks: number,
 *   overdue: number,
 *   dueSoon: number,
 *   activeProjects: { id: string, name: string }[],
 * }} TeamMemberWorkloadSummary
 */

/**
 * Project + open-task summary for team roster / member detail.
 * @param {string[]} memberIds
 */
export function useTeamMemberWorkload(memberIds) {
  const [byUserId, setByUserId] = useState(() => new Map());
  const [loading, setLoading] = useState(false);

  const idsKey = (memberIds || []).slice().sort().join(',');

  const load = useCallback(async () => {
    const ids = (memberIds || []).filter(Boolean);
    if (ids.length === 0) {
      setByUserId(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const memberProjectSet = {};
      for (const id of ids) memberProjectSet[id] = new Set();

      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('erp_project_members')
          .select('user_id, project_id')
          .in('user_id', slice);
        if (error) throw error;
        for (const row of data || []) {
          if (!row.user_id || !row.project_id) continue;
          if (!memberProjectSet[row.user_id]) memberProjectSet[row.user_id] = new Set();
          memberProjectSet[row.user_id].add(row.project_id);
        }
      }

      const allProjectIds = [...new Set(Object.values(memberProjectSet).flatMap((s) => [...s]))];
      const activeProjectIds = await filterActiveErpProjectIds(supabase, allProjectIds);

      const projectMetaById = new Map();
      for (let i = 0; i < activeProjectIds.length; i += CHUNK) {
        const slice = activeProjectIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('erp_projects')
          .select('id, name, board_column, deadline_date')
          .in('id', slice)
          .is('deleted_at', null);
        if (error) throw error;
        for (const p of data || []) {
          if (p?.id) projectMetaById.set(p.id, p);
        }
      }

      let allTasks = [];
      for (let i = 0; i < activeProjectIds.length; i += CHUNK) {
        const slice = activeProjectIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('erp_tasks')
          .select('id, title, due_date, status, project_id, assignee_id, assignee_ids, parent_task_id')
          .in('project_id', slice);
        if (error) throw error;
        allTasks.push(...(data || []));
      }

      const today = startOfLocalDay(new Date());
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const openTasksByUser = {};
      const overdueByUser = {};
      const dueSoonByUser = {};
      for (const id of ids) {
        openTasksByUser[id] = 0;
        overdueByUser[id] = 0;
        dueSoonByUser[id] = 0;
      }

      for (const t of allTasks) {
        if (!isOpenWorkloadChildTask(t)) continue;
        const assignees = assigneeIdsOnTask(t);
        const bucket = openWorkloadChildTaskDueBucket(t, today, weekEnd);
        for (const uid of assignees) {
          if (!Object.hasOwn(openTasksByUser, uid)) continue;
          openTasksByUser[uid] += 1;
          if (bucket === 'overdue') overdueByUser[uid] += 1;
          else if (bucket === 'dueSoon') dueSoonByUser[uid] += 1;
        }
      }

      const next = new Map();
      for (const userId of ids) {
        const pids = memberProjectSet[userId] ? [...memberProjectSet[userId]].filter((pid) => projectMetaById.has(pid)) : [];
        let total = 0;
        let active = 0;
        let completed = 0;
        const activeProjects = [];
        for (const pid of pids) {
          const meta = projectMetaById.get(pid);
          if (!meta) continue;
          total += 1;
          const col = normalizeBoardColumn(meta.board_column);
          const name = String(meta.name || 'Project').trim() || 'Project';
          if (col === 'completed') completed += 1;
          else {
            active += 1;
            activeProjects.push({ id: pid, name });
          }
        }
        activeProjects.sort((a, b) => a.name.localeCompare(b.name));
        next.set(userId, {
          total,
          active,
          completed,
          openTasks: openTasksByUser[userId] || 0,
          overdue: overdueByUser[userId] || 0,
          dueSoon: dueSoonByUser[userId] || 0,
          activeProjects,
        });
      }
      setByUserId(next);
    } catch {
      setByUserId(new Map());
    } finally {
      setLoading(false);
    }
  }, [idsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { byUserId, loading, reload: load };
}
