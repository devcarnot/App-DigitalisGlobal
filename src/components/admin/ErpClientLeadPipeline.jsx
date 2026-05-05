'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { useErpSession } from '../erp/useErpSession';
import ErpFilterMultiSelect from '../erp/ErpFilterMultiSelect';
import {
  CRM_PIPELINE_STAGES,
  crmLeadPlatformDotClass,
} from '../../lib/erp-crm-pipeline';
import {
  ERP_DARK_SECTION_MAIN_PANEL,
} from '../../lib/erp-dark-surfaces';

const DRAG_MIME = 'application/x-erp-crm-lead-id';

function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

/** @param {{ refreshKey?: number }} props */
export default function ErpClientLeadPipeline({ refreshKey = 0 }) {
  const { erpCan } = useErpSession();

  const canEditLead = erpCan('clients', 'edit');
  const canDeleteLead = erpCan('clients', 'delete');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leads, setLeads] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [search, setSearch] = useState('');
  const [boardFilter, setBoardFilter] = useState(() => /** @type {'all'|'active'|string} */ ('all'));
  const [platformFilters, setPlatformFilters] = useState([]);
  const [dragBusyId, setDragBusyId] = useState(null);
  const [deleteConfirmLead, setDeleteConfirmLead] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const platformLabelById = useMemo(() => {
    const m = {};
    for (const p of platforms) {
      if (p?.id) m[String(p.id)] = String(p.label || p.id);
    }
    return m;
  }, [platforms]);

  const platformMultiOptions = useMemo(
    () => platforms.map((p) => ({ value: String(p.id), label: String(p.label || p.id) })),
    [platforms],
  );

  useEffect(() => {
    const valid = new Set(platformMultiOptions.map((o) => o.value));
    setPlatformFilters((prev) => prev.filter((id) => valid.has(id)));
  }, [platformMultiOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/crm/leads');
      const j = await res.json().catch(() => ({}));
      if (res.status === 403 || res.status === 401) {
        setError(j.error || 'You do not have access to CRM leads.');
        setLeads([]);
        setPlatforms([]);
        return;
      }
      if (!res.ok) {
        throw new Error(j.error || 'Could not load lead pipeline');
      }
      setLeads(Array.isArray(j.leads) ? j.leads : []);
      setPlatforms(Array.isArray(j.platforms) ? j.platforms : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load lead pipeline');
      setLeads([]);
      setPlatforms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const afterSearch = useMemo(() => {
    return filterListBySearch(leads, search, (l) =>
      [
        l.company_name,
        l.contact_name,
        l.email,
        l.platform_id ? platformLabelById[String(l.platform_id)] : '',
      ].filter(Boolean),
    );
  }, [leads, search, platformLabelById]);

  const afterPlatform = useMemo(() => {
    if (!platformFilters.length) return afterSearch;
    const want = new Set(platformFilters.map(String));
    return afterSearch.filter((l) => l.platform_id != null && want.has(String(l.platform_id)));
  }, [afterSearch, platformFilters]);

  const visibleForBoard = useMemo(() => {
    if (boardFilter === 'all') return afterPlatform;
    if (boardFilter === 'active') {
      return afterPlatform.filter((l) => l.pipeline_stage !== 'won' && l.pipeline_stage !== 'lost');
    }
    return afterPlatform.filter((l) => l.pipeline_stage === boardFilter);
  }, [afterPlatform, boardFilter]);

  const chips = useMemo(() => {
    const base = afterPlatform;
    const byStage = Object.fromEntries(CRM_PIPELINE_STAGES.map((s) => [s.id, 0]));
    for (const l of base) {
      const st = String(l.pipeline_stage || '');
      if (Object.prototype.hasOwnProperty.call(byStage, st)) {
        byStage[st] += 1;
      }
    }
    const active = base.filter((l) => l.pipeline_stage !== 'won' && l.pipeline_stage !== 'lost').length;
    return { all: base.length, active, byStage };
  }, [afterPlatform]);

  /** @param {string} leadId @param {string} nextStage */
  async function patchLeadStage(leadId, nextStage) {
    if (!canEditLead || !leadId || !CRM_PIPELINE_STAGES.some((s) => s.id === nextStage)) return;
    const row = leads.find((x) => x.id === leadId);
    if (!row || String(row.pipeline_stage) === nextStage) return;
    setDragBusyId(leadId);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ pipelineStage: nextStage }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not move card');
      setLeads((prev) => prev.map((x) => (x.id === leadId ? { ...x, ...j.lead } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move card');
    } finally {
      setDragBusyId(null);
    }
  }

  async function confirmDelete() {
    const lead = deleteConfirmLead;
    if (!lead?.id || !canDeleteLead) return;
    setDeleteBusy(true);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${lead.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not delete lead');
      setLeads((prev) => prev.filter((x) => x.id !== lead.id));
      setDeleteConfirmLead(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete lead');
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-11 w-11 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 animate-spin shadow-md" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} min-w-0 max-w-md flex-1`}>
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/55 dark:text-teal-400/75" />
          <label className="block">
            <span className="sr-only">Search leads</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact, email…"
              className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 lg:max-w-md">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="erp-crm-platform-filter">
              Filter by platform
            </label>
            <ErpFilterMultiSelect
              id="erp-crm-platform-filter"
              placeholder="All platforms"
              options={platformMultiOptions}
              value={platformFilters}
              onChange={setPlatformFilters}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] font-bold sm:gap-2.5 sm:text-xs">
        <button
          type="button"
          onClick={() => setBoardFilter('all')}
          className={
            'rounded-full border px-3 py-1.5 transition ' +
            (boardFilter === 'all'
              ? 'border-indigo-400/60 bg-indigo-50 text-indigo-950 dark:border-violet-500/45 dark:bg-violet-950/50 dark:text-violet-100'
              : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-200')
          }
        >
          All ({chips.all})
        </button>
        <button
          type="button"
          onClick={() => setBoardFilter('active')}
          className={
            'rounded-full border px-3 py-1.5 transition ' +
            (boardFilter === 'active'
              ? 'border-emerald-400/60 bg-emerald-50 text-emerald-950 dark:border-emerald-500/45 dark:bg-emerald-950/45 dark:text-emerald-100'
              : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-200')
          }
        >
          Active ({chips.active})
        </button>
        {CRM_PIPELINE_STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setBoardFilter(s.id)}
            className={
              'rounded-full border px-3 py-1.5 transition ' +
              (boardFilter === s.id
                ? 'border-indigo-400/60 bg-indigo-50 text-indigo-950 dark:border-violet-500/45 dark:bg-violet-950/50 dark:text-violet-100'
                : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-200')
            }
          >
            {s.label} ({chips.byStage[s.id] ?? 0})
          </button>
        ))}
      </div>

      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Drag cards between columns to update the deal stage. Counts above follow your search and platform filters.
      </p>

      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
        {CRM_PIPELINE_STAGES.map((col) => {
          const inCol = visibleForBoard.filter((l) => l.pipeline_stage === col.id);
          return (
            <section
              key={col.id}
              className={
                'flex w-[min(100%,18rem)] shrink-0 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/60 shadow-inner dark:border-teal-900/50 dark:bg-[#080e14]/90 ' +
                ERP_DARK_SECTION_MAIN_PANEL
              }
              onDragOver={
                canEditLead
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  : undefined
              }
              onDrop={
                canEditLead
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData(DRAG_MIME);
                      if (id) void patchLeadStage(id, col.id);
                    }
                  : undefined
              }
            >
              <header className={`rounded-t-2xl border-t-4 px-3 py-2.5 ${col.bar} border-x-0 border-b border-slate-200/70 dark:border-teal-900/55`}>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  {col.label}{' '}
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">({inCol.length})</span>
                </h3>
              </header>
              <ul className="flex min-h-[8rem] flex-1 flex-col gap-2.5 p-2.5">
                {inCol.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-200/80 py-8 text-center text-[11px] font-medium text-slate-400 dark:border-teal-900/45 dark:text-slate-500">
                    Drop here
                  </li>
                ) : (
                  inCol.map((l) => {
                    const plat = l.platform_id ? platformLabelById[String(l.platform_id)] : null;
                    const busy = dragBusyId === l.id;
                    return (
                      <li key={l.id}>
                        <div
                          draggable={canEditLead}
                          onDragStart={
                            canEditLead
                              ? (e) => {
                                  e.dataTransfer.setData(DRAG_MIME, l.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }
                              : undefined
                          }
                          className={
                            'group relative rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.03] transition ' +
                            (canEditLead ? 'cursor-grab active:cursor-grabbing hover:border-indigo-200/90 hover:shadow-md ' : '') +
                            (busy ? 'opacity-60 ' : '') +
                            'dark:border-teal-900/55 dark:bg-[#0f1a23] dark:ring-teal-950/30'
                          }
                        >
                          {canDeleteLead ? (
                            <button
                              type="button"
                              className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                              aria-label="Delete lead"
                              onClick={() => setDeleteConfirmLead(l)}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : null}
                          <p className="pr-8 text-sm font-bold text-slate-900 dark:text-slate-50">{l.company_name}</p>
                          {l.contact_name ? (
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Contact: {l.contact_name}</p>
                          ) : null}
                          {plat ? (
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${crmLeadPlatformDotClass(l.platform_id)}`} aria-hidden />
                              <span className="capitalize">{plat.toLowerCase()}</span>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {typeof document !== 'undefined' && deleteConfirmLead
        ? createPortal(
            <div className="fixed inset-0 z-[230] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="Close"
                onClick={() => !deleteBusy && setDeleteConfirmLead(null)}
              />
              <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-teal-900/55 dark:bg-[#121f28]">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Remove lead?</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Delete <span className="font-semibold text-slate-900 dark:text-slate-100">{deleteConfirmLead.company_name}</span> from the
                  pipeline. This does not remove anyone from the workspace.
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => setDeleteConfirmLead(null)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => void confirmDelete()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-rose-700 to-red-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {deleteBusy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
