'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { ERP_TASK_STATUS_LABELS, normalizeTaskStatus } from '../../lib/erp-task-status';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpDashboardAssignedList from './ErpDashboardAssignedList';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'delegated', label: 'Delegated' },
  { id: 'done', label: 'Done' },
];

async function fetchProjectNameMap(pids) {
  const unique = [...new Set(pids.filter(Boolean))];
  if (unique.length === 0) return {};
  const CHUNK = 80;
  const slices = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    slices.push(unique.slice(i, i + CHUNK));
  }
  const results = await Promise.all(
    slices.map((slice) => supabase.from('erp_projects').select('id, name').in('id', slice)),
  );
  const map = {};
  for (const { data: projs } of results) {
    (projs || []).forEach((p) => {
      if (p?.id) map[p.id] = p.name || 'Project';
    });
  }
  return map;
}

function DelegatedOrDoneList({ mode }) {
  const { session } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `dashboard:your-work:${uid}:${mode}` : null;
  const [rows, setRows] = useState(() => pickErpCache(CACHE_KEY, (c) => c.rows ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [nameByProject, setNameByProject] = useState(() =>
    pickErpCache(CACHE_KEY, (c) => c.nameByProject ?? {}, {}),
  );

  const load = useCallback(async () => {
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setRows(Array.isArray(cached?.rows) ? cached.rows : []);
      setNameByProject(cached?.nameByProject && typeof cached.nameByProject === 'object' ? cached.nameByProject : {});
    }, setLoading);
    try {
      const uid = session?.user?.id;
      if (!uid) {
        setRows([]);
        setNameByProject({});
        return;
      }

      if (mode === 'delegated') {
        const { data: tasks, error } = await supabase
          .from('erp_tasks')
          .select('id, title, status, priority, project_id, parent_task_id, assignee_id')
          .eq('created_by', uid)
          .not('assignee_id', 'is', null)
          .neq('assignee_id', uid)
          .order('updated_at', { ascending: false })
          .limit(80);
        if (error) throw new Error(error.message);
        const list = (tasks || []).filter((t) => t.status !== 'cancelled');
        const names = await fetchProjectNameMap(list.map((t) => t.project_id));
        setNameByProject(names);
        setRows(list);
        writeErpDataCache(CACHE_KEY, { rows: list, nameByProject: names });
        return;
      }

      const { data: tasks, error } = await supabase
        .from('erp_tasks')
        .select('id, title, status, priority, project_id, parent_task_id')
        .eq('assignee_id', uid)
        .eq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(40);

      if (error) throw new Error(error.message);
      const names = await fetchProjectNameMap((tasks || []).map((t) => t.project_id));
      const nextRows = tasks || [];
      setNameByProject(names);
      setRows(nextRows);
      writeErpDataCache(CACHE_KEY, { rows: nextRows, nameByProject: names });
    } catch {
      if (!hasErpDataCache(CACHE_KEY)) {
        setRows([]);
        setNameByProject({});
      }
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, mode, session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const emptyMessage = mode === 'delegated' ? 'No delegated tasks.' : 'No completed tasks yet.';

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs font-medium text-teal-800/60">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] border-r-violet-500" />
        Loading…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-emerald-300/50 bg-gradient-to-br from-slate-900/[0.02] via-white to-violet-50/30 px-3 py-6 text-center text-[11px] font-medium text-teal-800/65 dark:border-teal-800/45 dark:from-[#081018]/90 dark:via-[#0c1420]/95 dark:to-violet-950/35 dark:text-slate-300">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-emerald-100/70 overflow-hidden rounded-xl border border-emerald-100/60 bg-white/90 shadow-inner ring-1 ring-emerald-900/[0.04]">
      {rows.map((task) => (
        <li key={task.id}>
          <Link
            href={`/erp/projects/${task.project_id}`}
            className="flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-gradient-to-r hover:from-emerald-50/50 hover:to-cyan-50/30"
          >
            <span
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{task.title}</p>
              <p className="mt-0.5 truncate text-[10px] font-medium text-teal-800/50">
                {nameByProject[task.project_id] || 'Project'}
                {task.parent_task_id ? (
                  <>
                    <span className="text-slate-300"> · </span>
                    Task
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ReadOnlyPriorityPill size="sm" priority={task.priority} />
              <span className="w-[4.5rem] text-right text-[9px] font-bold uppercase text-emerald-800/70">
                {ERP_TASK_STATUS_LABELS[normalizeTaskStatus(task.status)] || task.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ErpDashboardYourWork() {
  const [tab, setTab] = useState('open');
  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap gap-1 rounded-xl border border-slate-800/12 bg-slate-900/[0.04] p-1 shadow-inner"
        role="tablist"
        aria-label="Your work"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-all sm:px-4 ${
              tab === t.id
                ? 'erp-brand-fill text-white shadow-md shadow-teal-900/20'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'open' ? <ErpDashboardAssignedList /> : <DelegatedOrDoneList mode={tab} />}
    </div>
  );
}
