'use client';

import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import { classifyProjectPipeline, normalizeBoardColumn } from '../../lib/erp-project-pipeline';
import { ERP_TASK_STATUS_LABELS } from '../../lib/erp-task-status';
import { ERP_LIST_SEARCH_INPUT_CLASS } from '../../lib/erp-list-search';
import { assigneeIdsOnTask } from '../../lib/erp-assigned-workload-tasks';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';
import { buildMultiSectionCsv, triggerCsvDownload } from '../../lib/erp-export-csv';
import ErpExportCsvButton from '../erp/ErpExportCsvButton';
import ErpDateInput from '../erp/ErpDateInput';
import {
  ERP_DARK_RING_SUBTLE_KPI,
  ERP_DARK_SECTION_MAIN_PANEL,
  ERP_DARK_STAT_AMBER_HOT,
  ERP_DARK_STAT_CYAN,
  ERP_DARK_STAT_EMERALD,
  ERP_DARK_STAT_VIOLET,
} from '../../lib/erp-dark-surfaces';

const ErpStatisticsAssigneeSheet = dynamic(() => import('./ErpStatisticsAssigneeSheet'), { ssr: false });

const inputClass =
  'w-full rounded-xl border border-violet-200/60 bg-white/90 px-4 py-2.5 text-sm text-slate-900 shadow-inner shadow-violet-900/[0.04] transition-all duration-200 focus:border-[#103D4D]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-400/18 ' +
  'dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-black/35 dark:focus:border-teal-600/55 dark:focus:bg-[#141f26] dark:focus:ring-teal-500/20';

const labelClass =
  'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-teal-900/75 dark:text-teal-200';

const kpiCardClass =
  'rounded-xl border px-3 py-2 shadow-sm ring-1 ring-slate-900/[0.03] dark:ring-teal-900/20';
const kpiClickableClass = `${kpiCardClass} cursor-pointer text-left transition hover:border-cyan-300/70 hover:bg-cyan-50/50 dark:hover:border-teal-600/50 dark:hover:bg-teal-950/35`;
const kpiActiveClass =
  'border-cyan-300/80 bg-cyan-50/90 ring-1 ring-cyan-400/30 dark:border-teal-500/55 dark:bg-teal-950/45 dark:ring-teal-500/25';
const kpiLabelClass = 'text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400';
const kpiValueClass = 'mt-0.5 text-lg font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50';
const kpiHintClass = 'mt-0.5 text-[9px] leading-tight text-slate-500 dark:text-slate-400';

const CSV_COL_METRIC_VALUE = [
  { header: 'Metric', value: (r) => r.metric },
  { header: 'Value', value: (r) => r.value },
];

const CSV_COL_STATUS_COUNT = [
  { header: 'Status', value: (r) => r.status },
  { header: 'Count', value: (r) => r.count },
  { header: 'Share %', value: (r) => r.share },
];

const CSV_COL_ASSIGNEE_TASKS = [
  { header: 'Assignee', value: (r) => r.assignee },
  { header: 'Total tasks', value: (r) => r.total },
  { header: 'Open tasks', value: (r) => r.open },
  { header: 'Share %', value: (r) => r.share },
];

const CSV_COL_ASSIGNEE_OPEN = [
  { header: 'Assignee', value: (r) => r.assignee },
  { header: 'Open tasks', value: (r) => r.open },
  { header: 'Share %', value: (r) => r.share },
];

const CSV_COL_BOARD = [
  { header: 'Board column', value: (r) => r.column },
  { header: 'Projects', value: (r) => r.count },
];

const CSV_COL_PROJECTS = [
  { header: 'Project', value: (r) => r.name },
  { header: 'Board column', value: (r) => r.boardColumn },
  { header: 'Pipeline status', value: (r) => r.pipeline },
  { header: 'Deadline', value: (r) => r.deadline },
  { header: 'Main tasks', value: (r) => r.mainTasks },
];

function StatsSectionHeading({ title, subtitle, filename, columns, rows, exportLabel = 'Export CSV' }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-teal-900/75 dark:text-teal-200">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <ErpExportCsvButton filename={filename} columns={columns} rows={rows} label={exportLabel} />
    </div>
  );
}

function ChartCardHeading({ title, subtitle, filename, columns, rows }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-teal-900/70 dark:text-teal-200/90">{title}</h4>
        {subtitle ? <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <ErpExportCsvButton filename={filename} columns={columns} rows={rows} />
    </div>
  );
}

function endOfLocalDay(d) {
  const s = startOfLocalDay(d);
  const x = new Date(s);
  x.setHours(23, 59, 59, 999);
  return x;
}

function donutSegment(cx, cy, r0, r1, a0, a1) {
  const p0o = { x: cx + r1 * Math.cos(a0), y: cy + r1 * Math.sin(a0) };
  const p1o = { x: cx + r1 * Math.cos(a1), y: cy + r1 * Math.sin(a1) };
  const p0i = { x: cx + r0 * Math.cos(a1), y: cy + r0 * Math.sin(a1) };
  const p1i = { x: cx + r0 * Math.cos(a0), y: cy + r0 * Math.sin(a0) };
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p0o.x} ${p0o.y} A ${r1} ${r1} 0 ${large} 1 ${p1o.x} ${p1o.y} L ${p0i.x} ${p0i.y} A ${r0} ${r0} 0 ${large} 0 ${p1i.x} ${p1i.y} Z`;
}

const ASSIGNEE_SLICE_COLORS = [
  '#64748b',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#eab308',
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
  '#10b981',
  '#ef4444',
  '#3b82f6',
  '#a855f7',
];

function isOpenTaskStatus(status) {
  const s = String(status || '').toLowerCase();
  return s !== 'done' && s !== 'cancelled';
}

function buildDonutPaths(entries, { cx = 200, cy = 200, r0 = 68, r1 = 118 } = {}) {
  const total = entries.reduce((s, e) => s + e.n, 0);
  if (total === 0) return { paths: [], total: 0 };
  let a = -Math.PI / 2;
  const paths = [];
  const positive = entries.filter((e) => e.n > 0);
  for (const e of entries) {
    if (e.n <= 0) continue;
    const span = (e.n / total) * 2 * Math.PI;
    if (positive.length === 1 && e.n === total) {
      paths.push(
        { ...e, d: donutSegment(cx, cy, r0, r1, -Math.PI / 2, Math.PI / 2), mid: 0 },
        { ...e, d: donutSegment(cx, cy, r0, r1, Math.PI / 2, (3 * Math.PI) / 2), mid: Math.PI },
      );
      break;
    }
    const a1 = a + span;
    paths.push({ ...e, d: donutSegment(cx, cy, r0, r1, a, a1), mid: (a + a1) / 2 });
    a = a1;
  }
  return { paths, total };
}

function formatAssigneeDisplayName(label) {
  const s = String(label || '').trim() || 'Unknown';
  if (s === 'Unassigned') return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatAssigneeShortName(label) {
  const name = formatAssigneeDisplayName(label);
  if (name === 'Unassigned') return name;
  const parts = name.split(/\s+/);
  const first = parts[0] || name;
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}

function scrollToStatsSection(sectionId) {
  if (typeof document === 'undefined') return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function useDebouncedValue(value, delayMs = 280) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function computeStatistics(filtered, tasksByProject, filteredTasks, profilesById) {
  const asOfDate = new Date();
  const day0 = startOfLocalDay(asOfDate);
  let complete = 0;
  let late = 0;
  let pending = 0;
  let cancelled = 0;
  let due7 = 0;
  let due30 = 0;
  let noDeadline = 0;
  let rootTaskTotal = 0;
  let unassigned = 0;
  let inProgress = 0;
  let taskCompleted = 0;
  const taskStatusCounts = { open: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0, other: 0 };
  const boardColumnCounts = { todo: 0, in_progress: 0, review: 0, completed: 0, icebox: 0 };
  const allTaskStatusCounts = { open: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0, other: 0 };
  const assigneeCounts = new Map();

  for (const p of filtered) {
    const ts = tasksByProject[p.id] || [];
    rootTaskTotal += ts.length;
    const bucket = classifyProjectPipeline(p, ts, asOfDate);
    if (bucket === 'done') complete += 1;
    else if (bucket === 'late') late += 1;
    else if (bucket === 'cancelled') cancelled += 1;
    else pending += 1;

    if (bucket !== 'cancelled' && bucket !== 'done') {
      if (!p.deadline_date) {
        noDeadline += 1;
      } else {
        const dl = parseDateOnlyLocal(p.deadline_date);
        if (dl) {
          const diffDays = Math.round((startOfLocalDay(dl).getTime() - day0.getTime()) / 86400000);
          if (diffDays >= 0) {
            if (diffDays <= 7) due7 += 1;
            if (diffDays <= 30) due30 += 1;
          }
        }
      }
    }

    const col = normalizeBoardColumn(p.board_column);
    if (col in boardColumnCounts) boardColumnCounts[col] += 1;
    else boardColumnCounts.todo += 1;

    for (const t of ts) {
      const s = String(t.status || 'open');
      if (s in taskStatusCounts) taskStatusCounts[s] += 1;
      else taskStatusCounts.other += 1;
    }
  }

  for (const task of filteredTasks) {
    const s = String(task.status || 'open');
    const ids = assigneeIdsOnTask(task);
    const open = isOpenTaskStatus(s);

    if (s in allTaskStatusCounts) allTaskStatusCounts[s] += 1;
    else allTaskStatusCounts.other += 1;

    if (s === 'done') {
      taskCompleted += 1;
    } else if (s !== 'cancelled') {
      if (ids.size === 0) unassigned += 1;
      if (s === 'in_progress' || s === 'in_review') inProgress += 1;
    }

    if (ids.size === 0) {
      const row = assigneeCounts.get('__unassigned__') || {
        id: '__unassigned__',
        label: 'Unassigned',
        displayName: 'Unassigned',
        total: 0,
        open: 0,
      };
      row.total += 1;
      if (open) row.open += 1;
      assigneeCounts.set('__unassigned__', row);
      continue;
    }
    for (const id of ids) {
      let row = assigneeCounts.get(id);
      if (!row) {
        const label = profilesById[id]?.full_name?.trim() || `Member ${String(id).slice(0, 6)}`;
        row = { id, label, displayName: formatAssigneeDisplayName(label), total: 0, open: 0 };
        assigneeCounts.set(id, row);
      }
      row.total += 1;
      if (open) row.open += 1;
    }
  }

  const assigneeSegments = [...assigneeCounts.values()]
    .sort((a, b) => b.total - a.total)
    .map((row, index) => ({
      ...row,
      n: row.total,
      color:
        row.id === '__unassigned__'
          ? '#64748b'
          : ASSIGNEE_SLICE_COLORS[(index % (ASSIGNEE_SLICE_COLORS.length - 1)) + 1],
    }));

  const openAssigneeSegments = assigneeSegments
    .filter((row) => row.open > 0)
    .map((row) => ({ ...row, n: row.open }))
    .sort((a, b) => b.n - a.n);

  return {
    counts: { complete, late, pending, cancelled, total: filtered.length },
    deadlineKpis: { due7, due30, noDeadline },
    rootTaskTotal,
    taskStatusCounts,
    boardColumnCounts,
    allTaskStatusCounts,
    workloadKpis: { unassigned, inProgress, completed: taskCompleted },
    assigneeSegments,
    openAssigneeSegments,
  };
}

const AssigneeLegend = memo(function AssigneeLegend({ items, total, selectedId, onSelect, valueKey = 'n' }) {
  return (
    <ul className="max-h-[320px] space-y-0.5 overflow-y-auto pr-1 [scrollbar-width:thin] sm:grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-0.5">
      {items.map((item) => {
        const val = item[valueKey] ?? item.n;
        const pct = total ? ((val / total) * 100).toFixed(1) : '0.0';
        const active = selectedId === item.id;
        const dimmed = selectedId && !active;
        const name = item.displayName || formatAssigneeDisplayName(item.label);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect?.(item.id)}
              title={`${name}, ${val} tasks (${pct}%)`}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                active
                  ? 'border-cyan-300/70 bg-cyan-50/90 ring-1 ring-cyan-400/25 dark:border-teal-600/50 dark:bg-teal-950/45 dark:ring-teal-500/20'
                  : dimmed
                    ? 'border-transparent opacity-45 hover:opacity-75'
                    : 'border-transparent hover:border-slate-200/80 hover:bg-slate-50/90 dark:hover:border-teal-900/45 dark:hover:bg-[#121f28]'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/80 dark:ring-slate-700"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight text-slate-700 dark:text-slate-300">
                {name}
              </span>
              <span className="shrink-0 tabular-nums text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                {val}
                <span className="mx-0.5 opacity-40">·</span>
                {pct}%
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
});

const AssigneeDonutChart = memo(function AssigneeDonutChart({ segments, selectedId, onSelect }) {
  const cx = 100;
  const cy = 100;
  const { paths, total } = useMemo(
    () => buildDonutPaths(segments, { cx, cy, r0: 56, r1: 86 }),
    [segments],
  );

  if (total === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-violet-300/50 bg-slate-50/80 py-12 text-center text-sm text-slate-600 dark:border-teal-800/45 dark:bg-slate-900/55 dark:text-slate-400">
        No assigned tasks in this filter set.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
      <div className="mx-auto shrink-0 xl:mx-0">
        <div className="relative h-[196px] w-[196px]">
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full overflow-visible drop-shadow-sm"
            role="img"
            aria-label="Total tasks by assignee"
          >
            {paths.map((p) => {
              const dimmed = selectedId && selectedId !== p.id;
              return (
                <path
                  key={p.id}
                  d={p.d}
                  fill={p.color}
                  stroke="rgba(255,255,255,0.92)"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-95"
                  style={{ opacity: dimmed ? 0.38 : 1 }}
                  onClick={() => onSelect?.(p.id)}
                >
                  <title>
                    {p.displayName || formatAssigneeDisplayName(p.label)}: {p.n} ({total ? ((p.n / total) * 100).toFixed(1) : '0'}%)
                  </title>
                </path>
              );
            })}
            <circle cx={cx} cy={cy} r="36" className="fill-white dark:fill-[#0e1824]" />
            <text
              x={cx}
              y={cy - 10}
              textAnchor="middle"
              fill="currentColor"
              className="fill-slate-500 dark:fill-slate-400"
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em' }}
            >
              TASKS
            </text>
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              className="fill-slate-900 dark:fill-slate-50"
              style={{ fontSize: 24, fontWeight: 800 }}
            >
              {total}
            </text>
          </svg>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400 xl:text-left">
          Click a slice or name to drill down.
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
          All assignees ({paths.length})
        </p>
        <AssigneeLegend items={paths} total={total} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  );
});

const OpenTasksBarChart = memo(function OpenTasksBarChart({ segments, selectedId, onSelect }) {
  const max = useMemo(() => Math.max(1, ...segments.map((s) => s.n)), [segments]);
  const chartHeight = 240;
  const barMaxHeight = chartHeight - 52;

  if (!segments.length) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-violet-300/50 bg-slate-50/80 py-8 text-center text-sm text-slate-600 dark:border-teal-800/45 dark:bg-slate-900/55 dark:text-slate-400">
        No open tasks by assignee.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-xl border border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white px-2 py-3 dark:border-teal-900/45 dark:from-[#0a1218] dark:to-[#0e1824] [scrollbar-width:thin]">
        <div
          className="flex min-w-min items-end gap-1.5 sm:gap-2"
          style={{ minHeight: chartHeight }}
        >
          {segments.map((s) => {
            const fullName = s.displayName || formatAssigneeDisplayName(s.label);
            const shortName = formatAssigneeShortName(s.label);
            const barH = Math.max(16, Math.round((s.n / max) * barMaxHeight));
            const active = selectedId === s.id;
            const dimmed = selectedId && !active;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect?.(s.id)}
                title={`${fullName}: ${s.n} open tasks`}
                className={`flex h-full min-h-0 w-11 shrink-0 flex-col justify-end gap-1 sm:w-[3.25rem] ${
                  dimmed ? 'opacity-45 hover:opacity-80' : 'opacity-100'
                } ${active ? kpiActiveClass : 'rounded-lg border border-transparent px-0.5 pb-0.5 hover:border-slate-200/80 dark:hover:border-teal-800/45'}`}
                style={{ minHeight: chartHeight }}
              >
                <span
                  className="line-clamp-2 min-h-[1.35rem] w-full shrink-0 text-center text-[8px] font-semibold leading-tight text-slate-600 dark:text-slate-400"
                  title={fullName}
                >
                  {shortName}
                </span>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.n}</span>
                <span
                  className="mt-auto w-full shrink-0 rounded-t-md shadow-[0_-2px_10px_-4px_rgba(0,0,0,0.35)]"
                  style={{ height: barH, backgroundColor: s.color, minWidth: 22 }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        Name · count · bar: click any column to open that member&apos;s tasks.
      </p>
    </div>
  );
});

const ProjectStatusPie = memo(function ProjectStatusPie({ complete, pending, late, cancelled }) {
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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet-300/50 bg-gradient-to-br from-slate-900/[0.04] via-white/90 to-amber-50/40 py-14 text-center text-sm font-medium text-teal-900/65 backdrop-blur-sm dark:border-teal-800/45 dark:from-[#081018]/90 dark:via-[#0c1420]/95 dark:to-amber-950/30 dark:text-slate-300">
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
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700/80 dark:text-violet-300">Total</p>
          <p className="bg-gradient-to-r from-slate-900 via-[#103D4D] to-violet-700 bg-clip-text text-3xl font-bold tabular-nums text-transparent dark:bg-none dark:text-teal-50">
            {segments.total}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-teal-800/60 dark:text-slate-400">projects</p>
        </div>
      </div>
      <ul className="space-y-3 text-sm min-w-[200px]">
        {segments.entries.map((e) => (
          <li
            key={e.label}
            className="flex items-center justify-between gap-4 rounded-xl border border-cyan-200/35 bg-gradient-to-r from-white/95 to-slate-50/80 px-4 py-2.5 shadow-sm ring-1 ring-slate-900/[0.04] dark:border-teal-800/45 dark:bg-[#101a22] dark:[background-image:none] dark:ring-teal-900/35"
          >
            <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <span
                className="h-3 w-3 shrink-0 rounded-full shadow ring-2 ring-white dark:ring-slate-600"
                style={{ backgroundColor: e.color, boxShadow: `0 0 0 1px ${e.color}40` }}
              />
              {e.label}
            </span>
            <span className="tabular-nums text-lg font-bold text-slate-900 dark:text-teal-50">{e.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

const TASK_STATS_SELECT = 'id, status, project_id, assignee_id, assignee_ids, parent_task_id';
const TASK_SHEET_SELECT = 'id, title, status, start_date, due_date, project_id';
const LOAD_CHUNK = 80;

const STATS_CACHE_KEY = 'admin:statistics';

export default function AdminErpStatistics() {
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(STATS_CACHE_KEY));
  const [error, setError] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const debouncedNameQuery = useDebouncedValue(nameQuery);

  const [projects, setProjects] = useState(() => pickErpCache(STATS_CACHE_KEY, (c) => c.projects ?? [], []));
  const [allTasks, setAllTasks] = useState(() => pickErpCache(STATS_CACHE_KEY, (c) => c.allTasks ?? [], []));
  const [tasksByProject, setTasksByProject] = useState(() =>
    pickErpCache(STATS_CACHE_KEY, (c) => c.tasksByProject ?? {}, {}),
  );
  const [profilesById, setProfilesById] = useState(() =>
    pickErpCache(STATS_CACHE_KEY, (c) => c.profilesById ?? {}, {}),
  );
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(null);
  const [statusDrilldown, setStatusDrilldown] = useState(null);
  const [sheetTasks, setSheetTasks] = useState([]);

  const load = useCallback(async () => {
    beginErpCachedLoad(STATS_CACHE_KEY, (cached) => {
      setProjects(Array.isArray(cached?.projects) ? cached.projects : []);
      setAllTasks(Array.isArray(cached?.allTasks) ? cached.allTasks : []);
      setTasksByProject(cached?.tasksByProject && typeof cached.tasksByProject === 'object' ? cached.tasksByProject : {});
      setProfilesById(cached?.profilesById && typeof cached.profilesById === 'object' ? cached.profilesById : {});
    }, setLoading);
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
      const tasks = [];
      const chunks = [];
      for (let i = 0; i < ids.length; i += LOAD_CHUNK) {
        chunks.push(ids.slice(i, i + LOAD_CHUNK));
      }
      const taskResults = await Promise.all(
        chunks.map((slice) =>
          supabase.from('erp_tasks').select(TASK_STATS_SELECT).in('project_id', slice),
        ),
      );
      for (const { data: taskRows, error: tErr } of taskResults) {
        if (tErr) throw new Error(tErr.message);
        for (const row of taskRows || []) {
          tasks.push(row);
          const pid = row.project_id;
          if (!pid || row.parent_task_id) continue;
          if (!taskMap[pid]) taskMap[pid] = [];
          taskMap[pid].push(row);
        }
      }

      const assigneeIds = new Set();
      for (const task of tasks) {
        for (const id of assigneeIdsOnTask(task)) assigneeIds.add(id);
      }
      const profileMap = {};
      const idList = [...assigneeIds];
      const profileChunks = [];
      for (let i = 0; i < idList.length; i += LOAD_CHUNK) {
        profileChunks.push(idList.slice(i, i + LOAD_CHUNK));
      }
      const profileResults = await Promise.all(
        profileChunks.map((slice) =>
          supabase.from('erp_profiles').select('id, full_name, avatar_path, role').in('id', slice),
        ),
      );
      for (const { data: profRows, error: profErr } of profileResults) {
        if (profErr) throw new Error(profErr.message);
        for (const p of profRows || []) profileMap[p.id] = p;
      }

      writeErpDataCache(STATS_CACHE_KEY, {
        projects: list,
        allTasks: tasks,
        tasksByProject: taskMap,
        profilesById: profileMap,
      });
      setProjects(list);
      setAllTasks(tasks);
      setTasksByProject(taskMap);
      setProfilesById(profileMap);
    } catch (e) {
      setError(e?.message || 'Could not load analytics');
      if (!hasErpDataCache(STATS_CACHE_KEY)) {
        setProjects([]);
        setAllTasks([]);
        setTasksByProject({});
        setProfilesById({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const nq = debouncedNameQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (nq && !String(p.name || '').toLowerCase().includes(nq)) return false;
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
  }, [projects, createdFrom, createdTo, debouncedNameQuery]);

  const filteredProjectIds = useMemo(() => {
    const ids = new Set();
    for (const p of filtered) ids.add(p.id);
    return ids;
  }, [filtered]);

  const filteredTasks = useMemo(
    () => allTasks.filter((t) => filteredProjectIds.has(t.project_id)),
    [allTasks, filteredProjectIds],
  );

  const stats = useMemo(
    () => computeStatistics(filtered, tasksByProject, filteredTasks, profilesById),
    [filtered, tasksByProject, filteredTasks, profilesById],
  );

  const {
    counts,
    deadlineKpis,
    rootTaskTotal,
    taskStatusCounts,
    boardColumnCounts,
    allTaskStatusCounts,
    workloadKpis,
    assigneeSegments,
    openAssigneeSegments,
  } = stats;

  const projectNameById = useMemo(() => {
    const m = {};
    for (const p of filtered) m[p.id] = p.name || 'Project';
    return m;
  }, [filtered]);

  useEffect(() => {
    const drilldownOpen = selectedAssigneeId || statusDrilldown;
    if (!drilldownOpen) {
      setSheetTasks([]);
      return undefined;
    }
    let alive = true;
    const matchingIds = [];
    if (selectedAssigneeId) {
      for (const task of filteredTasks) {
        const ids = assigneeIdsOnTask(task);
        if (selectedAssigneeId === '__unassigned__') {
          if (ids.size === 0) matchingIds.push(task.id);
        } else if (ids.has(selectedAssigneeId)) {
          matchingIds.push(task.id);
        }
      }
    } else if (statusDrilldown === 'in_progress') {
      for (const task of filteredTasks) {
        const s = String(task.status || 'open');
        if (s === 'in_progress' || s === 'in_review') matchingIds.push(task.id);
      }
    } else if (statusDrilldown === 'done') {
      for (const task of filteredTasks) {
        if (String(task.status || 'open') === 'done') matchingIds.push(task.id);
      }
    }
    if (!matchingIds.length) {
      setSheetTasks([]);
      return undefined;
    }
    (async () => {
      try {
        const rows = [];
        for (let i = 0; i < matchingIds.length; i += LOAD_CHUNK) {
          const slice = matchingIds.slice(i, i + LOAD_CHUNK);
          const { data, error: fetchErr } = await supabase.from('erp_tasks').select(TASK_SHEET_SELECT).in('id', slice);
          if (fetchErr) throw fetchErr;
          rows.push(...(data || []));
        }
        if (alive) setSheetTasks(rows);
      } catch {
        if (alive) setSheetTasks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedAssigneeId, statusDrilldown, filteredTasks]);

  const selectedAssigneeLabel = useMemo(() => {
    if (statusDrilldown === 'in_progress') return 'In progress tasks';
    if (statusDrilldown === 'done') return 'Completed tasks';
    if (!selectedAssigneeId) return '';
    if (selectedAssigneeId === '__unassigned__') return 'Unassigned';
    return profilesById[selectedAssigneeId]?.full_name?.trim() || 'Member';
  }, [selectedAssigneeId, statusDrilldown, profilesById]);

  const sheetAssigneeId = selectedAssigneeId || (statusDrilldown ? `__status_${statusDrilldown}` : null);

  const selectAssignee = useCallback((id) => {
    setStatusDrilldown(null);
    setSelectedAssigneeId((prev) => (prev === id ? null : id));
  }, []);

  const openStatusDrilldown = useCallback((status) => {
    setSelectedAssigneeId(null);
    setStatusDrilldown((prev) => (prev === status ? null : status));
  }, []);

  const closeAssigneeSheet = useCallback(() => {
    setSelectedAssigneeId(null);
    setStatusDrilldown(null);
  }, []);

  const allTaskStatusBarTotal = useMemo(
    () => Object.values(allTaskStatusCounts).reduce((s, n) => s + n, 0),
    [allTaskStatusCounts],
  );

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
    { key: 'icebox', color: '#38bdf8', label: 'Ice Box' },
    { key: 'completed', color: '#10b981', label: 'Completed' },
  ];

  const exportDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const assigneeTotalTasks = useMemo(
    () => assigneeSegments.reduce((s, row) => s + row.total, 0),
    [assigneeSegments],
  );

  const openAssigneeTotal = useMemo(
    () => openAssigneeSegments.reduce((s, row) => s + row.n, 0),
    [openAssigneeSegments],
  );

  const glanceExportRows = useMemo(
    () => [
      { metric: 'Projects (filtered)', value: counts.total },
      { metric: 'Main tasks (anchor)', value: rootTaskTotal },
      { metric: 'Deadline in 7 days', value: deadlineKpis.due7 },
      { metric: 'Deadline in 30 days', value: deadlineKpis.due30 },
      { metric: 'Active projects without deadline', value: deadlineKpis.noDeadline },
    ],
    [counts.total, rootTaskTotal, deadlineKpis],
  );

  const workloadExportRows = useMemo(
    () => [
      { metric: 'Unassigned open tasks', value: workloadKpis.unassigned },
      { metric: 'In progress / in review', value: workloadKpis.inProgress },
      { metric: 'Completed tasks', value: workloadKpis.completed },
    ],
    [workloadKpis],
  );

  const allTaskStatusExportRows = useMemo(
    () =>
      taskBarDefs
        .map(({ key, label }) => {
          const count = allTaskStatusCounts[key] || 0;
          if (!count) return null;
          return {
            status: label,
            count,
            share: allTaskStatusBarTotal ? ((count / allTaskStatusBarTotal) * 100).toFixed(1) : '0.0',
          };
        })
        .filter(Boolean),
    [allTaskStatusCounts, allTaskStatusBarTotal, taskBarDefs],
  );

  const assigneeExportRows = useMemo(
    () =>
      assigneeSegments.map((row) => ({
        assignee: row.displayName || formatAssigneeDisplayName(row.label),
        total: row.total,
        open: row.open,
        share: assigneeTotalTasks ? ((row.total / assigneeTotalTasks) * 100).toFixed(1) : '0.0',
      })),
    [assigneeSegments, assigneeTotalTasks],
  );

  const openAssigneeExportRows = useMemo(
    () =>
      openAssigneeSegments.map((row) => ({
        assignee: row.displayName || formatAssigneeDisplayName(row.label),
        open: row.n,
        share: openAssigneeTotal ? ((row.n / openAssigneeTotal) * 100).toFixed(1) : '0.0',
      })),
    [openAssigneeSegments, openAssigneeTotal],
  );

  const projectStatusExportRows = useMemo(
    () => {
      const total = counts.complete + counts.pending + counts.late + counts.cancelled;
      const rows = [
        { status: 'Complete', count: counts.complete },
        { status: 'Pending', count: counts.pending },
        { status: 'Late', count: counts.late },
        { status: 'Cancelled', count: counts.cancelled },
      ].filter((r) => r.count > 0);
      return rows.map((r) => ({
        ...r,
        share: total ? ((r.count / total) * 100).toFixed(1) : '0.0',
      }));
    },
    [counts],
  );

  const mainTaskStatusExportRows = useMemo(
    () =>
      taskBarDefs
        .map(({ key, label }) => {
          const count = taskStatusCounts[key] || 0;
          if (!count) return null;
          return {
            status: label,
            count,
            share: taskStatusBarTotal ? ((count / taskStatusBarTotal) * 100).toFixed(1) : '0.0',
          };
        })
        .filter(Boolean),
    [taskStatusCounts, taskStatusBarTotal, taskBarDefs],
  );

  const boardColumnExportRows = useMemo(
    () =>
      boardBarDefs.map(({ key, label }) => ({
        column: label,
        count: boardColumnCounts[key] || 0,
      })),
    [boardColumnCounts, boardBarDefs],
  );

  const projectsExportRows = useMemo(() => {
    const asOfDate = new Date();
    return filtered.map((p) => ({
      name: p.name || 'Project',
      boardColumn: boardBarDefs.find((b) => b.key === normalizeBoardColumn(p.board_column))?.label || 'To do',
      pipeline: classifyProjectPipeline(p, tasksByProject[p.id] || [], asOfDate),
      deadline: p.deadline_date || '',
      mainTasks: (tasksByProject[p.id] || []).length,
    }));
  }, [filtered, tasksByProject, boardBarDefs]);

  const exportAllSections = useMemo(
    () => [
      { title: 'At a glance', columns: CSV_COL_METRIC_VALUE, rows: glanceExportRows },
      { title: 'Task workload', columns: CSV_COL_METRIC_VALUE, rows: workloadExportRows },
      { title: 'All tasks by status', columns: CSV_COL_STATUS_COUNT, rows: allTaskStatusExportRows },
      { title: 'Total tasks by assignee', columns: CSV_COL_ASSIGNEE_TASKS, rows: assigneeExportRows },
      { title: 'Open tasks by assignee', columns: CSV_COL_ASSIGNEE_OPEN, rows: openAssigneeExportRows },
      { title: 'Project status mix', columns: CSV_COL_STATUS_COUNT, rows: projectStatusExportRows },
      { title: 'Main tasks by status', columns: CSV_COL_STATUS_COUNT, rows: mainTaskStatusExportRows },
      { title: 'Projects by board column', columns: CSV_COL_BOARD, rows: boardColumnExportRows },
      { title: 'Filtered projects', columns: CSV_COL_PROJECTS, rows: projectsExportRows },
    ],
    [
      glanceExportRows,
      workloadExportRows,
      allTaskStatusExportRows,
      assigneeExportRows,
      openAssigneeExportRows,
      projectStatusExportRows,
      mainTaskStatusExportRows,
      boardColumnExportRows,
      projectsExportRows,
    ],
  );

  const exportAllStatistics = useCallback(() => {
    const csv = buildMultiSectionCsv(exportAllSections);
    if (!csv) return;
    triggerCsvDownload(`erp-statistics-all-${exportDate}`, csv);
  }, [exportAllSections, exportDate]);

  const canExportAll = exportAllSections.some((s) => s.rows.length > 0);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border border-cyan-200/40 bg-white/90 p-4 shadow-[0_12px_40px_-16px_rgba(16,61,77,0.15)] ring-1 ring-cyan-900/[0.06] sm:p-5 ${ERP_DARK_SECTION_MAIN_PANEL}`}
      >
        <h2 className="bg-gradient-to-r from-slate-900 via-[#103D4D] to-violet-700 bg-clip-text text-lg font-bold text-transparent dark:bg-none dark:text-teal-100">
          Project analytics
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
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
            <ErpDateInput
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Created to</label>
            <ErpDateInput
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={() => {
                setCreatedFrom('');
                setCreatedTo('');
              }}
              className="w-full rounded-lg border border-violet-200/70 bg-gradient-to-r from-slate-100/90 to-violet-50/60 px-3 py-2 text-xs font-bold text-slate-800 shadow-sm hover:border-cyan-300/60 dark:border-teal-700/50 dark:bg-[#161e29] dark:[background-image:none] dark:text-slate-100"
            >
              Clear dates
            </button>
          </div>
        </div>
      </div>

      <div
        className={`rounded-2xl border border-cyan-200/40 bg-white/90 p-4 shadow-[0_12px_40px_-16px_rgba(16,61,77,0.15)] ring-1 ring-cyan-900/[0.06] sm:p-5 ${ERP_DARK_SECTION_MAIN_PANEL}`}
      >
        {error && (
          <p className="mb-4 rounded-xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50/70 px-4 py-2.5 text-sm font-medium text-red-800 dark:border-rose-900/50 dark:from-rose-950/45 dark:to-red-950/40 dark:text-rose-200">
            {error}
          </p>
        )}
        {loading && projects.length === 0 ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-600 animate-spin shadow-md" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-200/70 pb-3 dark:border-teal-900/40">
              <button
                type="button"
                disabled={!canExportAll}
                onClick={exportAllStatistics}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-300/60 bg-cyan-50/80 px-3 py-1.5 text-[11px] font-bold text-[#103D4D] shadow-sm hover:bg-cyan-100/90 disabled:pointer-events-none disabled:opacity-40 dark:border-teal-600/50 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-900/50"
              >
                Export all CSV
              </button>
            </div>

            <div>
              <StatsSectionHeading
                title="At a glance"
                filename={`erp-statistics-at-a-glance-${exportDate}`}
                columns={CSV_COL_METRIC_VALUE}
                rows={glanceExportRows}
              />
              <div className="mt-2 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => scrollToStatsSection('stats-board-column')}
                  className={`${kpiClickableClass} border-cyan-200/50 bg-gradient-to-br from-cyan-50/80 to-white dark:border-teal-800/45 ${ERP_DARK_STAT_CYAN} ${ERP_DARK_RING_SUBTLE_KPI}`}
                >
                  <p className={kpiLabelClass}>Projects (filtered)</p>
                  <p className={`${kpiValueClass} dark:text-cyan-50`}>{counts.total}</p>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToStatsSection('stats-main-tasks')}
                  className={`${kpiClickableClass} border-violet-200/50 bg-gradient-to-br from-violet-50/70 to-white dark:border-violet-900/45 ${ERP_DARK_STAT_VIOLET} ${ERP_DARK_RING_SUBTLE_KPI}`}
                >
                  <p className={kpiLabelClass}>Main tasks (anchor)</p>
                  <p className={`${kpiValueClass} dark:text-violet-100`}>{rootTaskTotal}</p>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToStatsSection('stats-project-status')}
                  className={`${kpiClickableClass} border-amber-200/55 bg-gradient-to-br from-amber-50/80 to-white dark:border-amber-900/45 ${ERP_DARK_STAT_AMBER_HOT} ${ERP_DARK_RING_SUBTLE_KPI}`}
                >
                  <p className={`${kpiLabelClass} text-amber-900/75 dark:text-amber-200/90`}>Deadline in 7 days</p>
                  <p className={`${kpiValueClass} text-amber-950 dark:text-amber-100`}>{deadlineKpis.due7}</p>
                  <p className={`${kpiHintClass} text-amber-900/60 dark:text-amber-200/70`}>Active, not complete</p>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToStatsSection('stats-project-status')}
                  className={`${kpiClickableClass} border-teal-200/50 bg-gradient-to-br from-teal-50/70 to-white dark:border-teal-900/45 ${ERP_DARK_STAT_EMERALD} ${ERP_DARK_RING_SUBTLE_KPI}`}
                >
                  <p className={`${kpiLabelClass} text-teal-900/75 dark:text-emerald-200`}>Deadline in 30 days</p>
                  <p className={`${kpiValueClass} text-teal-950 dark:text-emerald-100`}>{deadlineKpis.due30}</p>
                  <p className={`${kpiHintClass} text-teal-800/65 dark:text-emerald-200/65`}>Forward-looking</p>
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{deadlineKpis.noDeadline}</span> active filtered projects
                have no deadline set yet.
              </p>
            </div>

            <div>
              <StatsSectionHeading
                title="Task workload"
                subtitle="All tasks in filtered projects. Click a team member below to drill down."
                filename={`erp-statistics-task-workload-${exportDate}`}
                columns={CSV_COL_METRIC_VALUE}
                rows={workloadExportRows}
              />
              <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => selectAssignee('__unassigned__')}
                  className={`${kpiClickableClass} border-slate-200/80 bg-white dark:border-teal-900/45 dark:bg-[#0e1824] ${
                    selectedAssigneeId === '__unassigned__' ? kpiActiveClass : ''
                  }`}
                >
                  <p className={kpiLabelClass}>Unassigned</p>
                  <p className={kpiValueClass}>{workloadKpis.unassigned}</p>
                </button>
                <button
                  type="button"
                  onClick={() => openStatusDrilldown('in_progress')}
                  className={`${kpiClickableClass} border-indigo-200/55 bg-gradient-to-br from-indigo-50/70 to-white dark:border-indigo-900/45 dark:from-[#121828] dark:to-[#0e1420] ${
                    statusDrilldown === 'in_progress' ? kpiActiveClass : ''
                  }`}
                >
                  <p className={kpiLabelClass}>In progress</p>
                  <p className={`${kpiValueClass} dark:text-indigo-100`}>{workloadKpis.inProgress}</p>
                </button>
                <button
                  type="button"
                  onClick={() => openStatusDrilldown('done')}
                  className={`${kpiClickableClass} border-emerald-200/55 bg-gradient-to-br from-emerald-50/70 to-white dark:border-emerald-900/45 dark:from-[#0a1a14] dark:to-[#0c1410] ${
                    statusDrilldown === 'done' ? kpiActiveClass : ''
                  }`}
                >
                  <p className={kpiLabelClass}>Completed</p>
                  <p className={`${kpiValueClass} dark:text-emerald-100`}>{workloadKpis.completed}</p>
                </button>
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-teal-900/70 dark:text-teal-200/90">Workload by status</h4>
                  <ErpExportCsvButton
                    filename={`erp-statistics-all-tasks-by-status-${exportDate}`}
                    columns={CSV_COL_STATUS_COUNT}
                    rows={allTaskStatusExportRows}
                  />
                </div>
                {allTaskStatusBarTotal === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-violet-300/50 bg-slate-50/80 py-6 text-center text-sm text-slate-600 dark:border-teal-800/45 dark:bg-slate-900/55 dark:text-slate-400">
                    No tasks in the filtered set.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 dark:bg-slate-950/90 dark:ring-teal-900/40">
                      {taskBarDefs.map(({ key, color }) => {
                        const n = allTaskStatusCounts[key];
                        if (!n) return null;
                        const pct = (n / allTaskStatusBarTotal) * 100;
                        return (
                          <div
                            key={key}
                            className="h-full min-w-0"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                            title={`${key}: ${n}`}
                          />
                        );
                      })}
                    </div>
                    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
                      {taskBarDefs.map(({ key, color, label }) => {
                        const n = allTaskStatusCounts[key];
                        if (!n) return null;
                        const clickable = key === 'in_progress' || key === 'in_review' || key === 'done';
                        const onClick =
                          key === 'done'
                            ? () => openStatusDrilldown('done')
                            : key === 'in_progress' || key === 'in_review'
                              ? () => openStatusDrilldown('in_progress')
                              : undefined;
                        return (
                          <li key={key}>
                            {clickable ? (
                              <button
                                type="button"
                                onClick={onClick}
                                className="flex items-center gap-1.5 font-medium text-slate-700 hover:text-cyan-700 dark:text-slate-300 dark:hover:text-teal-200"
                              >
                                <span className="h-2 w-2 rounded-full ring-1 ring-white dark:ring-slate-600" style={{ backgroundColor: color }} />
                                {label}: <span className="tabular-nums font-bold text-slate-900 dark:text-white">{n}</span>
                              </button>
                            ) : (
                              <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                                <span className="h-2 w-2 rounded-full ring-1 ring-white dark:ring-slate-600" style={{ backgroundColor: color }} />
                                {label}: <span className="tabular-nums font-bold text-slate-900 dark:text-white">{n}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div id="stats-assignee-charts" className="mt-6 grid scroll-mt-24 gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-teal-900/45 dark:bg-[#0e1824]">
                  <ChartCardHeading
                    title="Total tasks by assignee"
                    subtitle="Every team member listed: select to view tasks."
                    filename={`erp-statistics-total-by-assignee-${exportDate}`}
                    columns={CSV_COL_ASSIGNEE_TASKS}
                    rows={assigneeExportRows}
                  />
                  <div className="mt-4">
                    <AssigneeDonutChart
                      segments={assigneeSegments}
                      selectedId={selectedAssigneeId}
                      onSelect={selectAssignee}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-teal-900/45 dark:bg-[#0e1824]">
                  <ChartCardHeading
                    title="Open tasks by assignee"
                    subtitle="Click bars or legend: first name on each bar, full name in legend."
                    filename={`erp-statistics-open-by-assignee-${exportDate}`}
                    columns={CSV_COL_ASSIGNEE_OPEN}
                    rows={openAssigneeExportRows}
                  />
                  <div className="mt-4">
                    <OpenTasksBarChart
                      segments={openAssigneeSegments}
                      selectedId={selectedAssigneeId}
                      onSelect={selectAssignee}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div id="stats-project-status" className="scroll-mt-24">
              <StatsSectionHeading
                title="Project status mix"
                subtitle="Main tasks plus board status: matches project grid and performance dashboard."
                filename={`erp-statistics-project-status-${exportDate}`}
                columns={CSV_COL_STATUS_COUNT}
                rows={projectStatusExportRows}
              />
              <div className="mt-4">
                <ProjectStatusPie
                  complete={counts.complete}
                  pending={counts.pending}
                  late={counts.late}
                  cancelled={counts.cancelled}
                />
              </div>
            </div>

            <div id="stats-main-tasks" className="scroll-mt-24">
              <StatsSectionHeading
                title="Main tasks by status"
                subtitle="Counts of anchor tasks across filtered projects (subtasks excluded)."
                filename={`erp-statistics-main-tasks-by-status-${exportDate}`}
                columns={CSV_COL_STATUS_COUNT}
                rows={mainTaskStatusExportRows}
              />
              {taskStatusBarTotal === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-violet-300/50 bg-slate-50/80 py-8 text-center text-sm text-slate-600 dark:border-teal-800/45 dark:bg-slate-900/55 dark:text-slate-400">
                  No main tasks in the filtered set.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 dark:bg-slate-950/90 dark:ring-teal-900/40">
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
                        <li key={key} className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                          <span
                            className="h-2.5 w-2.5 rounded-full ring-1 ring-white dark:ring-slate-600"
                            style={{ backgroundColor: color }}
                          />
                          {label}: <span className="tabular-nums font-bold text-slate-900 dark:text-white">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div id="stats-board-column" className="scroll-mt-24">
              <StatsSectionHeading
                title="Projects by board column"
                subtitle="Kanban column on each project (My tasks). Filtered by name and created date like above."
                filename={`erp-statistics-board-column-${exportDate}`}
                columns={CSV_COL_BOARD}
                rows={boardColumnExportRows}
              />
              <div className="mt-1 flex justify-end">
                <ErpExportCsvButton
                  filename={`erp-statistics-projects-${exportDate}`}
                  columns={CSV_COL_PROJECTS}
                  rows={projectsExportRows}
                  label="Export projects CSV"
                />
              </div>
              <div className="mt-3 grid max-w-2xl grid-cols-2 gap-2 lg:grid-cols-4">
                {boardBarDefs.map(({ key, color, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => scrollToStatsSection('stats-project-status')}
                    className={`${kpiClickableClass} border-slate-200/80 bg-white dark:border-teal-900/45 dark:bg-[#0e1824]`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white dark:ring-slate-700"
                        style={{ backgroundColor: color }}
                      />
                      <span className={kpiLabelClass}>{label}</span>
                    </div>
                    <p className={kpiValueClass}>{boardColumnCounts[key]}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {sheetAssigneeId ? (
        <ErpStatisticsAssigneeSheet
          open
          assigneeId={sheetAssigneeId}
          assigneeLabel={selectedAssigneeLabel}
          profile={selectedAssigneeId && selectedAssigneeId !== '__unassigned__' ? profilesById[selectedAssigneeId] : null}
          tasks={sheetTasks}
          projectNameById={projectNameById}
          onClose={closeAssigneeSheet}
        />
      ) : null}
    </div>
  );
}
