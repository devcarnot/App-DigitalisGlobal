'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { ERP_LIST_SEARCH_INPUT_CLASS, filterListBySearch } from '../../lib/erp-list-search';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

export default function ErpDashboardRecents({ workspaceRole, userId: userIdProp }) {
  const CACHE_KEY = userIdProp ? `dashboard:recents:${userIdProp}` : null;
  const [rows, setRows] = useState(() => pickErpCache(CACHE_KEY, (c) => c.rows ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [search, setSearch] = useState('');

  const displayRows = useMemo(() => filterListBySearch(rows, search, (p) => [p.name]), [rows, search]);

  const load = useCallback(async () => {
    const key = userIdProp ? `dashboard:recents:${userIdProp}` : null;
    beginErpCachedLoad(key, (cached) => {
      setRows(Array.isArray(cached?.rows) ? cached.rows : []);
    }, setLoading);
    try {
      let uid = userIdProp;
      if (!uid) {
        const { data: sessionData } = await supabase.auth.getSession();
        uid = sessionData?.session?.user?.id;
      }
      if (!uid) {
        setRows([]);
        return;
      }
      let q = supabase.from('erp_projects').select('id, name, updated_at').order('updated_at', { ascending: false }).limit(12);
      if (!isErpGlobalAdmin(workspaceRole)) {
        const { data: mems } = await supabase.from('erp_project_members').select('project_id').eq('user_id', uid);
        const ids = [...new Set((mems || []).map((m) => m.project_id).filter(Boolean))];
        if (ids.length === 0) {
          setRows([]);
          return;
        }
        q = supabase.from('erp_projects').select('id, name, updated_at').in('id', ids).order('updated_at', { ascending: false }).limit(12);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const nextRows = data || [];
      writeErpDataCache(key, { rows: nextRows });
      setRows(nextRows);
    } catch {
      if (!hasErpDataCache(key)) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceRole, userIdProp]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-[11px] font-medium text-teal-800/55">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] border-r-violet-500" />
        Loading…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-cyan-200/60 bg-cyan-50/30 py-4 text-center text-[11px] font-medium text-teal-800/55">
        No projects yet.
      </p>
    );
  }

  if (displayRows.length === 0) {
    return (
      <div className="space-y-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recent projects…"
          className={ERP_LIST_SEARCH_INPUT_CLASS}
          autoComplete="off"
        />
        <p className="rounded-lg border border-dashed border-cyan-200/60 bg-cyan-50/30 py-4 text-center text-[11px] font-medium text-teal-800/55">
          No projects match your search.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search recent projects…"
        className={ERP_LIST_SEARCH_INPUT_CLASS}
        autoComplete="off"
      />
    <ul className="-mx-3 max-h-[min(280px,40vh)] divide-y divide-cyan-100/60 overflow-y-auto [scrollbar-width:thin]">
      {displayRows.map((p) => (
        <li key={p.id}>
          <Link
            href={`/erp/projects/${p.id}`}
            className="group flex items-start gap-2 px-3 py-2 transition-colors hover:bg-gradient-to-r hover:from-cyan-50/70 hover:to-violet-50/40"
          >
            <span className="mt-0.5 shrink-0 rounded-md bg-gradient-to-br from-cyan-500/20 to-violet-500/20 p-1 text-[#103D4D]" aria-hidden>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block line-clamp-2 text-[12px] font-semibold leading-snug text-slate-900 group-hover:text-[#103D4D]">
                {p.name || 'Project'}
              </span>
              <span className="mt-0.5 block text-[10px] font-medium text-teal-800/45">
                Workspace ·{' '}
                {p.updated_at
                  ? new Date(p.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : '—'}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
    </div>
  );
}
