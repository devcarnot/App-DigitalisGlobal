'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { logErpTaskStatusChange } from '../../lib/erp-activity-client';
import { useErpSession } from './useErpSession';
import {
  parseDateOnlyLocal,
  startOfLocalDay,
  formatTaskDueDate,
  taskDueColorClasses,
  taskDueStatus,
} from '../../lib/task-dates';
import { ERP_TASK_STATUS_LABELS, normalizeTaskStatus } from '../../lib/erp-task-status';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import { ERP_LIST_SEARCH_INPUT_CLASS, filterListBySearch } from '../../lib/erp-list-search';
import ErpNativeSelect from './ErpNativeSelect';

const SECTION_ORDER = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'Next 7 days' },
  { id: 'later', label: 'Later' },
  { id: 'no_date', label: 'No due date' },
];

function bucketForDue(dueStr, todayStart, weekEndStart) {
  if (!dueStr) return 'no_date';
  const d = parseDateOnlyLocal(dueStr);
  if (!d) return 'no_date';
  const td = startOfLocalDay(d).getTime();
  const t0 = todayStart.getTime();
  if (td < t0) return 'overdue';
  if (td === t0) return 'today';
  if (td <= weekEndStart.getTime()) return 'this_week';
  return 'later';
}

export default function ErpDashboardAssignedList() {
  const { session } = useErpSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [statusSavingId, setStatusSavingId] = useState(null);
  const [taskSearch, setTaskSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const uid = session?.user?.id;
      if (!uid) {
        setRows([]);
        return;
      }
      const { data: tasks, error: tErr } = await supabase
        .from('erp_tasks')
        .select('id, title, status, priority, due_date, project_id, parent_task_id')
        .eq('assignee_id', uid)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200);
      if (tErr) throw new Error(tErr.message);
      const active = (tasks || []).filter((t) => t.status !== 'done' && t.status !== 'cancelled');
      const pids = [...new Set(active.map((t) => t.project_id).filter(Boolean))];
      let nameById = {};
      if (pids.length) {
        const CHUNK = 80;
        const slices = [];
        for (let i = 0; i < pids.length; i += CHUNK) {
          slices.push(pids.slice(i, i + CHUNK));
        }
        const projResults = await Promise.all(
          slices.map((slice) => supabase.from('erp_projects').select('id, name').in('id', slice)),
        );
        for (const { data: projs } of projResults) {
          (projs || []).forEach((p) => {
            if (p?.id) nameById[p.id] = p.name || 'Project';
          });
        }
      }
      setRows(
        active.map((t) => ({
          ...t,
          projectName: nameById[t.project_id] || 'Project',
        })),
      );
    } catch (e) {
      setError(e?.message || 'Could not load tasks');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setTaskStatus = useCallback(
    async (taskId, nextStatus) => {
      if (!taskId) return;
      const normalized = normalizeTaskStatus(nextStatus);
      const t = rows.find((x) => x.id === taskId);
      const prev = t?.status ?? null;
      const uid = session?.user?.id;
      setStatusSavingId(taskId);
      setError('');
      try {
        const { error: upErr } = await supabase
          .from('erp_tasks')
          .update({ status: normalized, updated_at: new Date().toISOString() })
          .eq('id', taskId);
        if (upErr) {
          setError(upErr.message || 'Could not update');
          return;
        }
        if (uid && t?.project_id) {
          void logErpTaskStatusChange({
            projectId: t.project_id,
            userId: uid,
            taskId,
            title: t.title,
            previousStatus: prev,
            nextStatus: normalized,
          });
        }
        await load();
      } finally {
        setStatusSavingId(null);
      }
    },
    [load, rows, session?.user?.id],
  );

  const rowsFiltered = useMemo(
    () => filterListBySearch(rows, taskSearch, (t) => [t.title, t.projectName]),
    [rows, taskSearch],
  );

  const grouped = useMemo(() => {
    const todayStart = startOfLocalDay(new Date());
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const buckets = Object.fromEntries(SECTION_ORDER.map((s) => [s.id, []]));
    for (const t of rowsFiltered) {
      const b = bucketForDue(t.due_date, todayStart, weekEnd);
      buckets[b].push(t);
    }
    return buckets;
  }, [rowsFiltered]);

  const sectionBarClass = (id) => {
    if (id === 'overdue') return 'bg-gradient-to-r from-rose-900 to-red-800 text-rose-50';
    if (id === 'today') return 'bg-gradient-to-r from-amber-700 to-orange-600 text-amber-50';
    if (id === 'this_week') return 'bg-gradient-to-r from-[#103D4D] to-teal-700 text-cyan-50';
    if (id === 'later') return 'bg-gradient-to-r from-violet-800 to-indigo-800 text-violet-50';
    return 'bg-gradient-to-r from-slate-800 to-slate-700 text-slate-100';
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs font-medium text-teal-800/60">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] border-r-violet-500" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-rose-200/80 bg-rose-50/90 py-2 text-xs font-medium text-red-800">{error}</p>
    );
  }

  const total = rows.length;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-emerald-300/50 bg-gradient-to-br from-slate-900/[0.02] via-white to-cyan-50/40 px-3 py-6 text-center shadow-inner dark:border-teal-800/50 dark:from-[#081018]/90 dark:via-[#0a1420]/95 dark:to-cyan-950/40 dark:shadow-inner dark:shadow-black/40">
        <p className="text-xs font-semibold text-teal-900/80 dark:text-teal-100/95">Nothing assigned to you yet.</p>
        <p className="mt-1 text-[11px] text-teal-800/55 dark:text-slate-400">Set yourself as assignee on a task in a project.</p>
        <Link
          href="/erp/projects"
          className="mt-2 inline-block text-xs font-bold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
        >
          Browse projects
        </Link>
      </div>
    );
  }

  const anyFiltered =
    SECTION_ORDER.some((sec) => (grouped[sec.id] || []).length > 0);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Search assigned tasks</span>
        <input
          type="search"
          value={taskSearch}
          onChange={(e) => setTaskSearch(e.target.value)}
          placeholder="Search task or project…"
          className={ERP_LIST_SEARCH_INPUT_CLASS}
          autoComplete="off"
        />
      </label>

      {!anyFiltered ? (
        <p className="rounded-xl border border-dashed border-cyan-200/60 bg-cyan-50/30 py-4 text-center text-[11px] font-medium text-teal-800/70">
          {taskSearch.trim() ? 'No tasks match your search.' : 'Nothing to show.'}
        </p>
      ) : (
    <div className="divide-y divide-cyan-100/70 overflow-hidden rounded-xl border border-cyan-100/60 bg-white/90 shadow-inner ring-1 ring-cyan-900/[0.04]">
      {SECTION_ORDER.map((sec) => {
        const items = grouped[sec.id] || [];
        if (items.length === 0) return null;
        return (
          <div key={sec.id} className="px-0">
            <div className={`sticky top-0 z-[1] px-2.5 py-1.5 shadow-sm ${sectionBarClass(sec.id)}`}>
              <h3 className="text-[10px] font-bold uppercase tracking-wider">{sec.label}</h3>
            </div>
            <ul className="divide-y divide-cyan-50/90">
              {items.map((t) => (
                <li
                  key={t.id}
                  className="group flex flex-col gap-1.5 px-2.5 py-1.5 transition-colors hover:bg-gradient-to-r hover:from-cyan-50/50 hover:to-violet-50/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 opacity-90 shadow-sm"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/erp/projects/${t.project_id}`}
                        className="line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 hover:text-[#103D4D]"
                      >
                        {t.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mt-0.5 text-[10px] text-slate-500">
                        <span className="truncate">{t.projectName}</span>
                        {t.parent_task_id ? (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">Task</span>
                          </>
                        ) : null}
                        {t.due_date ? (
                          <>
                            <span className="text-slate-300">·</span>
                            {(() => {
                              const c = taskDueColorClasses(taskDueStatus(t.due_date));
                              return (
                                <span className={`${c.value} font-medium`}>{formatTaskDueDate(t.due_date)}</span>
                              );
                            })()}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pl-6 sm:pl-0">
                    <ReadOnlyPriorityPill size="sm" priority={t.priority} />
                    <ErpNativeSelect
                      zoneSize="sm"
                      value={normalizeTaskStatus(t.status)}
                      disabled={statusSavingId === t.id}
                      onChange={(e) => void setTaskStatus(t.id, e.target.value)}
                      aria-label="Status"
                      className="rounded-lg border border-cyan-200/70 bg-white !pl-1.5 !pr-8 py-0.5 text-[10px] font-semibold text-slate-800 outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/25"
                    >
                      <option value="open">{ERP_TASK_STATUS_LABELS.open}</option>
                      <option value="in_progress">{ERP_TASK_STATUS_LABELS.in_progress}</option>
                      <option value="in_review">{ERP_TASK_STATUS_LABELS.in_review}</option>
                      <option value="done">{ERP_TASK_STATUS_LABELS.done}</option>
                      <option value="cancelled">{ERP_TASK_STATUS_LABELS.cancelled}</option>
                    </ErpNativeSelect>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
      )}
    </div>
  );
}
