'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { filterActiveErpProjectIds } from '../../../lib/erp-active-projects';
import {
  assigneeIdsOnTask,
  isOpenWorkloadChildTask,
  openWorkloadChildTaskDueBucket,
} from '../../../lib/erp-assigned-workload-tasks';
import { normalizeTaskStatus } from '../../../lib/erp-task-status';
import { startOfLocalDay } from '../../../lib/task-dates';

const CHUNK = 80;

function normalizeBoardColumn(v) {
  const x = String(v || '').toLowerCase();
  if (x === 'todo' || x === 'in_progress' || x === 'review' || x === 'completed' || x === 'icebox') return x;
  return 'in_progress';
}

/**
 * Open assigned tasks + active projects for one member (team sidebar detail).
 * @param {string | null} memberId
 */
export function useTeamMemberTaskDetail(memberId) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!memberId) {
      setTasks([]);
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: memberships, error: memErr } = await supabase
        .from('erp_project_members')
        .select('project_id')
        .eq('user_id', memberId);
      if (memErr) throw memErr;

      const memberProjectIds = [...new Set((memberships || []).map((r) => r.project_id).filter(Boolean))];
      const activeProjectIds = await filterActiveErpProjectIds(supabase, memberProjectIds);

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

      const openTasks = [];
      for (const t of allTasks) {
        if (!isOpenWorkloadChildTask(t)) continue;
        const assignees = assigneeIdsOnTask(t);
        if (!assignees.has(String(memberId))) continue;
        const project = projectMetaById.get(t.project_id);
        if (!project) continue;
        const dueBucket = openWorkloadChildTaskDueBucket(t, today, weekEnd);
        openTasks.push({
          id: t.id,
          title: String(t.title || 'Task').trim() || 'Task',
          dueDate: t.due_date || null,
          status: normalizeTaskStatus(t.status),
          projectId: t.project_id,
          projectName: String(project.name || 'Project').trim() || 'Project',
          dueBucket,
        });
      }

      openTasks.sort((a, b) => {
        const rank = (x) => (x.dueBucket === 'overdue' ? 0 : x.dueBucket === 'dueSoon' ? 1 : 2);
        const dr = rank(a) - rank(b);
        if (dr !== 0) return dr;
        const da = a.dueDate ? String(a.dueDate) : '9999';
        const db = b.dueDate ? String(b.dueDate) : '9999';
        return da.localeCompare(db);
      });

      const projectRows = [];
      for (const pid of activeProjectIds) {
        const meta = projectMetaById.get(pid);
        if (!meta) continue;
        const col = normalizeBoardColumn(meta.board_column);
        projectRows.push({
          id: pid,
          name: String(meta.name || 'Project').trim() || 'Project',
          boardColumn: col,
          deadlineDate: meta.deadline_date || null,
          isActive: col !== 'completed',
        });
      }
      projectRows.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setTasks(openTasks);
      setProjects(projectRows);
    } catch {
      setTasks([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tasks, projects, loading, reload: load };
}
