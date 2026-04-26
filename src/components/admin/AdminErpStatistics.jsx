'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import { normalizeBoardColumn } from '../../lib/erp-project-pipeline';
import { ERP_TASK_STATUS_LABELS } from '../../lib/erp-task-status';
import { ERP_LIST_SEARCH_INPUT_CLASS } from '../../lib/erp-list-search';

const inputClass =
  'w-full rounded-xl border border-violet-200/60 bg-white/90 px-4 py-2.5 text-sm text-slate-900 shadow-inner shadow-violet-900/[0.04] transition-all duration-200 focus:border-[#103D4D]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-400/18';

const labelClass =
  'mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-teal-900/75';

function endOfLocalDay(d) {
  const s = startOfLocalDay(d);
  const x = new Date(s);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Every root task is cancelled (project shut down). */
function projectIsCancelled(taskRows) {
  if (!taskRows?.length) return false;
  return taskRows.every((t) => t.status === 'cancelled');
}

/** At least one done, none open/in_progress/in_review. */
function projectIsComplete(taskRows) {
  if (!taskRows?.length) return false;
  if (taskRows.some((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'in_review')) return false;
  return taskRows.some((t) => t.status === 'done');
}

function projectIsLate(deadlineStr, asOfDate, complete) {
  if (complete) return false;
  if (!deadlineStr) return false;
  const dl = parseDateOnlyLocal(deadlineStr);
  if (!dl) return false;
  return startOfLocalDay(dl).getTime() < startOfLocalDay(asOfDate).getTime();
}

function donutSegment(cx, cy, r0, r1, a0, a1) {
  const p0o = { x: cx + r1 * Math.cos(a0), y: cy + r1 * Math.sin(a0) };
  const p1o = { x: cx + r1 * Math.cos(a1), y: cy + r1 * Math.sin(a1) };
  const p0i = { x: cx + r0 * Math.cos(a1), y: cy + r0 * Math.sin(a1) };
  const p1i = { x: cx + r0 * Math.cos(a0), y: cy + r0 * Math.sin(a0) };
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p0o.x} ${p0o.y} A ${r1} ${r1} 0 ${large} 1 ${p1o.x} ${p1o.y} L ${p0i.x} ${p0i.y} A ${r0} ${r0} 0 ${large} 0 ${p1i.x} ${p1i.y} Z`;
}

function ProjectStatusPie({ complete, pending, late, cancelled }) {
  const segments = useMemo(() => {
    const entries = [
      { n: complete, color: '#10b981', label: 'Complete' },
      { n: pending, color: '#0d9488', label: 'Pending' },
      { n: late, color: '#f43f5e', label: 'Late' },
      { n: cancelled, color: '#64748b', label: 'Cancelled' },
    ];
    const total = entries.reduce((s, e) => s + e.n, 0);
    if (total === 0) return { paths: [], total: 0, entries };
    let a = -Math.PI / 2;
    const cx = 100;
    const cy = 100;
    const r0 = 54;
    const r1 = 92;
    const paths = [];
    const positive = entries.filter((e) => e.n > 0);
    for (const e of entries) {
      if (e.n <= 0) continue;
      const span = (e.n / total) * 2 * Math.PI;
      if (positive.length === 1 && e.n === total) {
        paths.push(
          { d: donutSegment(cx, cy, r0, r1, -Math.PI / 2, Math.PI / 2), color: e.color, label: e.label, n: e.n },
          { d: donutSegment(cx, cy, r0, r1, Math.PI / 2, (3 * Math.PI) / 2), color: e.color, label: e.label, n: e.n }
        );
        break;
      }
      const a1 = a + span;
      paths.push({
        d: donutSegment(cx, cy, r0, r1, a, a1),
        color: e.color,
        label: e.label,
        n: e.n,
      });
      a = a1;
    }
    return { paths, total, entries };
  }, [complete, pending, late, cancelled]);

  if (segments.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet-300/50 bg-gradient-to-br from-slate-900/[0.04] via-white/90 to-amber-50/40 py-14 text-center text-sm font-medium text-teal-900/65 backdrop-blur-sm">
        No projects match the current filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-center sm:gap-12">
      <div className="relative shrink-0" style={{ width: 220, height: 220 }}>
        <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-md">
          {segments.paths.map((p, i) => (
            <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="1" className="transition-opacity hover:opacity-90" />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700/80">Total</p>
          <p className="bg-gradient-to-r from-slate-900 via-[#103D4D] to-violet-700 bg-clip-text text-3xl font-bold tabular-nums text-transparent">
            {segments.total}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-teal-800/60">projects</p>
        </div>
      </div>
      <ul className="space-y-3 text-sm min-w-[200px]">
        {segments.entries.map((e) => (
          <li
            key={e.label}
            className="flex items-center justify-between gap-4 rounded-xl border border-cyan-200/35 bg-gradient-to-r from-white/95 to-slate-50/80 px-4 py-2.5 shadow-sm ring-1 ring-slate-900/[0.04]"
          >
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              <span
                className="h-3 w-3 shrink-0 rounded-full shadow ring-2 ring-white"
                style={{ backgroundColor: e.color, boxShadow: `0 0 0 1px ${e.color}40` }}
              />
              {e.label}
            </span>
            <span className="tabular-nums text-lg font-bold text-slate-900">{e.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminErpStatistics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [nameQuery, setNameQuery] = useState('');

  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: projs, error: pErr } = await supabase
        .from('erp_projects')
        .select('id, name, created_at, deadline_date, board_column')
        .order('created_at', { ascending: false })
        .limit(500);
      if (pErr) throw new Error(pErr.message);
      const list = projs || [];
      const ids = list.map((p) => p.id).filter(Boolean);
      const taskMap = {};
      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: taskRows, error: tErr } = await supabase
          .from('erp_tasks')
          .select('project_id, status')
          .in('project_id', slice)
          .is('parent_task_id', null);
        if (tErr) throw new Error(tErr.message);
        for (const row of taskRows || []) {
          const pid = row.project_id;
          if (!pid) continue;
          if (!taskMap[pid]) taskMap[pid] = [];
          taskMap[pid].push(row);
        }
      }
      setProjects(list);
      setTasksByProject(taskMap);
    } catch (e) {
      setError(e?.message || 'Could not load analytics');
      setProjects([]);
      setTasksByProject({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const nq = nameQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (nq && !(String(p.name || '').toLowerCase().includes(nq))) return false;
      const created = new Date(p.created_at);
      if (createdFrom) {
        const from = startOfLocalDay(parseDateOnlyLocal(createdFrom) || new Date(createdFrom));
        if (created < from) return false;
      }
      if (createdTo) {
        const to = endOfLocalDay(parseDateOnlyLocal(createdTo) || new Date(createdTo));
        if (created > to) return false;
      }
      return true;
    });
  }, [projects, createdFrom, createdTo, nameQuery]);

  const counts = useMemo(() => {
    const asOfDate = new Date();
    let complete = 0;
    let late = 0;
    let pending = 0;
    let cancelled = 0;
    for (const p of filtered) {
      const ts = tasksByProject[p.id] || [];
      if (projectIsCancelled(ts)) {
        cancelled += 1;
        continue;
      }
      const comp = projectIsComplete(ts);
      const lat = projectIsLate(p.deadline_date, asOfDate, comp);
      if (comp) complete += 1;
      else if (lat) late += 1;
      else pending += 1;
    }
    return { complete, late, pending, cancelled, total: filtered.length };
  }, [filtered, tasksByProject]);

  const deadlineKpis = useMemo(() => {
    let due7 = 0;
    let due30 = 0;
    let noDeadline = 0;
    const day0 = startOfLocalDay(new Date());
    for (const p of filtered) {
      const ts = tasksByProject[p.id] || [];
      if (projectIsCancelled(ts)) continue;
      const comp = projectIsComplete(ts);
      if (comp) continue;
      if (!p.deadline_date) {
        noDeadline += 1;
        continue;
      }
      const dl = parseDateOnlyLocal(p.deadline_date);
      if (!dl) continue;
      const diffDays = Math.round((startOfLocalDay(dl).getTime() - day0.getTime()) / 86400000);
      if (diffDays < 0) continue;
      if (diffDays <= 7) due7 += 1;
      if (diffDays <= 30) due30 += 1;
    }
    return { due7, due30, noDeadline };
  }, [filtered, tasksByProject]);

  const rootTaskTotal = useMemo(() => {
    let n = 0;
    for (const p of filtered) {
      n += (tasksByProject[p.id] || []).length;
    }
    return n;
  }, [filtered, tasksByProject]);

  const taskStatusCounts = useMemo(() => {
    const m = { open: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0, other: 0 };
    for (const p of filtered) {
      for (const t of tasksByProject[p.id] || []) {
        const s = String(t.status || 'open');
        if (s === 'open' || s === 'in_progress' || s === 'in_review' || s === 'done' || s === 'cancelled') m[s] += 1;
        else m.other += 1;
      }
    }
    return m;
  }, [filtered, tasksByProject]);

  const boardColumnCounts = useMemo(() => {
    const m = { todo: 0, in_progress: 0, review: 0, completed: 0 };
    for (const p of filtered) {
      const col = normalizeBoardColumn(p.board_column);
      if (col in m) m[col] += 1;
      else m.todo += 1;
    }
    return m;
  }, [filtered]);

  const taskStatusBarTotal = useMemo(
    () => Object.values(taskStatusCounts).reduce((s, n) => s + n, 0),
    [taskStatusCounts],
  );

  const taskBarDefs = [
    { key: 'open', color: '#0ea5e9', label: ERP_TASK_STATUS_LABELS.open },
    { key: 'in_progress', color: '#6366f1', label: ERP_TASK_STATUS_LABELS.in_progress },
    { key: 'in_review', color: '#8b5cf6', label: ERP_TASK_STATUS_LABELS.in_review },
    { key: 'done', color: '#10b981', label: ERP_TASK_STATUS_LABELS.done },
    { key: 'cancelled', color: '#94a3b8', label: ERP_TASK_STATUS_LABELS.cancelled },
    { key: 'other', color: '#f59e0b', label: 'Other' },
  ];

  const boardBarDefs = [
    { key: 'todo', color: '#06b6d4', label: 'To do' },
    { key: 'in_progress', color: '#3b82f6', label: 'In progress' },
    { key: 'review', color: '#8b5cf6', label: 'Review' },
    { key: 'completed', color: '#10b981', label: 'Completed' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="rounded-2xl border border-cyan-200/40 bg-white/90 p-6 shadow-[0_12px_40px_-16px_rgba(16,61,77,0.15)] ring-1 ring-cyan-900/[0.06] backdrop-blur-sm sm:p-8">
        <h2 className="bg-gradient-to-r from-slate-900 via-[#103D4D] to-violet-700 bg-clip-text text-xl font-bold text-transparent">
          Project analytics
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelClass}>Search project name</label>
            <input
              type="search"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Filter by project name…"
              className={ERP_LIST_SEARCH_INPUT_CLASS}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>Created from</label>
            <input
              type="date"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Created to</label>
            <input
              type="date"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={() => {
                setCreatedFrom('');
                setCreatedTo('');
              }}
              className="w-full rounded-xl border border-violet-200/70 bg-gradient-to-r from-slate-100/90 to-violet-50/60 px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-all hover:border-cyan-300/60 hover:from-white hover:to-cyan-50/50"
            >
              Clear dates
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-200/40 bg-white/90 p-6 shadow-[0_12px_40px_-16px_rgba(16,61,77,0.15)] ring-1 ring-cyan-900/[0.06] backdrop-blur-sm sm:p-8">
        {error && (
          <p className="mb-4 rounded-xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50/70 px-4 py-2.5 text-sm font-medium text-red-800">
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-600 animate-spin shadow-md" />
          </div>
        ) : (
          <div className="space-y-10">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-teal-900/75">At a glance</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50/80 to-white p-4 shadow-sm ring-1 ring-cyan-900/[0.04]">
                  <p className="text-[11px] font-semibold text-slate-500">Projects (filtered)</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{counts.total}</p>
                </div>
                <div className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/70 to-white p-4 shadow-sm ring-1 ring-violet-900/[0.05]">
                  <p className="text-[11px] font-semibold text-slate-500">Main tasks (anchor)</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{rootTaskTotal}</p>
                </div>
                <div className="rounded-2xl border border-amber-200/55 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm ring-1 ring-amber-900/[0.06]">
                  <p className="text-[11px] font-semibold text-amber-900/75">Deadline in 7 days</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{deadlineKpis.due7}</p>
                  <p className="mt-0.5 text-[11px] text-amber-900/60">Active, not complete</p>
                </div>
                <div className="rounded-2xl border border-teal-200/50 bg-gradient-to-br from-teal-50/70 to-white p-4 shadow-sm ring-1 ring-teal-900/[0.05]">
                  <p className="text-[11px] font-semibold text-teal-900/75">Deadline in 30 days</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-teal-950">{deadlineKpis.due30}</p>
                  <p className="mt-0.5 text-[11px] text-teal-800/65">Same scope · forward-looking</p>
                </div>
              </div>
              <p className="mt-3 text-[12px] text-slate-600">
                <span className="font-semibold text-slate-700">{deadlineKpis.noDeadline}</span> active filtered projects
                have no deadline set yet.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-teal-900/75">Project status mix</h3>
              <p className="mt-1 text-[12px] text-slate-600">Derived from main tasks per project (same as the donut).</p>
              <div className="mt-4">
                <ProjectStatusPie
                  complete={counts.complete}
                  pending={counts.pending}
                  late={counts.late}
                  cancelled={counts.cancelled}
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-teal-900/75">Main tasks by status</h3>
              <p className="mt-1 text-[12px] text-slate-600">
                Counts of anchor tasks across filtered projects (subtasks excluded).
              </p>
              {taskStatusBarTotal === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-violet-300/50 bg-slate-50/80 py-8 text-center text-sm text-slate-600">
                  No main tasks in the filtered set.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                    {taskBarDefs.map(({ key, color }) => {
                      const n = taskStatusCounts[key];
                      if (!n) return null;
                      const pct = (n / taskStatusBarTotal) * 100;
                      return (
                        <div
                          key={key}
                          className="h-full min-w-0 transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                          title={`${key}: ${n}`}
                        />
                      );
                    })}
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[12px]">
                    {taskBarDefs.map(({ key, color, label }) => {
                      const n = taskStatusCounts[key];
                      if (!n) return null;
                      return (
                        <li key={key} className="flex items-center gap-2 font-medium text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ backgroundColor: color }} />
                          {label}: <span className="tabular-nums font-bold text-slate-900">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-teal-900/75">Projects by board column</h3>
              <p className="mt-1 text-[12px] text-slate-600">
                Kanban column on each project (My tasks). Filtered by name and created date like above.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {boardBarDefs.map(({ key, color, label }) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />
                      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{boardColumnCounts[key]}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
