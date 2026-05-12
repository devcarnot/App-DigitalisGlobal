'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ERP_DARK_MENU_PORTAL, ERP_DARK_SECTION_MAIN_PANEL } from '../../lib/erp-dark-surfaces';

const DRAG_MIME = 'application/x-erp-crm-lead-id';

function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

function IconDotsVertical({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
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
  /** Which lead card shows the ⋮ actions menu (outside click closes). */
  const [leadActionMenuId, setLeadActionMenuId] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [editCompany, setEditCompany] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPlatformId, setEditPlatformId] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');
  const leadMenuShellRef = useRef(null);

  useEffect(() => {
    if (!leadActionMenuId) {
      leadMenuShellRef.current = null;
      return;
    }
    function onDocMouseDown(e) {
      const el = leadMenuShellRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setLeadActionMenuId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [leadActionMenuId]);

  useEffect(() => {
    if (!editingLead) return;
    function onKey(e) {
      if (e.key !== 'Escape' || editBusy) return;
      setEditingLead(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingLead, editBusy]);

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

  const editPlatformOptions = useMemo(() => {
    const base = platforms.length ? platforms : [{ id: 'direct', label: 'Direct' }];
    if (!editingLead?.platform_id) return base;
    const id = String(editingLead.platform_id);
    if (base.some((p) => String(p.id) === id)) return base;
    return [{ id, label: platformLabelById[id] || id }, ...base];
  }, [platforms, editingLead?.platform_id, platformLabelById]);

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
        l.phone,
        l.notes,
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
      setLeadActionMenuId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete lead');
    } finally {
      setDeleteBusy(false);
    }
  }

  function openEditLeadModal(lead) {
    if (!canEditLead || !lead?.id) return;
    setEditErr('');
    setEditingLead(lead);
    setEditCompany(String(lead.company_name ?? '').trim());
    setEditContact(String(lead.contact_name ?? '').trim());
    setEditEmail(String(lead.email ?? '').trim());
    setEditPhone(String(lead.phone ?? '').trim());
    // Preserve newlines for notes — they're significant when reading back
    // the "what we discussed" log on a follow-up call.
    setEditNotes(typeof lead.notes === 'string' ? lead.notes : '');
    const baseOpts = platforms.length ? platforms : [{ id: 'direct', label: 'Direct' }];
    const raw = lead.platform_id != null && String(lead.platform_id).trim() ? String(lead.platform_id).trim() : '';
    setEditPlatformId(raw ? raw : String(baseOpts[0]?.id ?? 'direct'));
    setLeadActionMenuId(null);
  }

  async function submitLeadEdit(e) {
    e?.preventDefault?.();
    const lead = editingLead;
    if (!lead?.id || !canEditLead || editBusy) return;
    const company = editCompany.trim();
    if (!company) {
      setEditErr('Company name is required');
      return;
    }
    setEditBusy(true);
    setEditErr('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: company.slice(0, 240),
          contactName: editContact.trim() ? editContact.trim().slice(0, 200) : null,
          email: editEmail.trim() ? editEmail.trim().slice(0, 320) : null,
          phone: editPhone.trim() ? editPhone.trim().slice(0, 64) : null,
          // Send the raw value (preserving newlines) so blank-with-spaces
          // gets normalised to null by the server while real content stays.
          notes: editNotes.slice(0, 5000),
          platformId: editPlatformId.trim().slice(0, 48) || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not update lead');
      const row = j.lead;
      if (!row?.id) throw new Error('Invalid response');
      setLeads((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
      setEditingLead(null);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : 'Could not update lead');
    } finally {
      setEditBusy(false);
    }
  }

  function closeEditModal() {
    if (!editBusy) setEditingLead(null);
  }

  const canShowLeadActions = canEditLead || canDeleteLead;

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
                          {canShowLeadActions ? (
                            <div
                              ref={leadActionMenuId === l.id ? leadMenuShellRef : undefined}
                              className="absolute right-2 top-2 z-[2]"
                              onMouseDown={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={leadActionMenuId === l.id}
                                className="rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-slate-200"
                                aria-label="Lead actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLeadActionMenuId((prev) => (prev === l.id ? null : l.id));
                                }}
                              >
                                <IconDotsVertical className="h-5 w-5" />
                              </button>
                              {leadActionMenuId === l.id ? (
                                <div
                                  role="menu"
                                  className={`absolute right-0 top-full z-[5] mt-1 min-w-[10.5rem] rounded-xl border border-slate-200/90 bg-white py-1 shadow-lg ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
                                >
                                  {canEditLead ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/5"
                                      onClick={() => openEditLeadModal(l)}
                                    >
                                      Edit
                                    </button>
                                  ) : null}
                                  {canDeleteLead ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/45"
                                      onClick={() => {
                                        setDeleteConfirmLead(l);
                                        setLeadActionMenuId(null);
                                      }}
                                    >
                                      Delete
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="pr-8 text-sm font-bold text-slate-900 dark:text-slate-50">{l.company_name}</p>
                          {l.contact_name ? (
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Contact: {l.contact_name}</p>
                          ) : null}
                          {l.phone ? (
                            // Native click-to-call so mobile / Windows-tel-handler
                            // can dial straight from the card. `stopPropagation`
                            // keeps the drag handler from hijacking the click.
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                              Phone:{' '}
                              <a
                                href={`tel:${String(l.phone).replace(/[^\d+]/g, '')}`}
                                onClick={(e) => e.stopPropagation()}
                                onDragStart={(e) => e.preventDefault()}
                                className="font-semibold text-slate-700 underline-offset-2 hover:underline dark:text-slate-300"
                              >
                                {l.phone}
                              </a>
                            </p>
                          ) : null}
                          {l.notes ? (
                            <p
                              className="mt-1.5 line-clamp-2 whitespace-pre-line text-[11px] leading-snug text-slate-500 dark:text-slate-400"
                              title={l.notes}
                            >
                              {l.notes}
                            </p>
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

      {typeof document !== 'undefined' && editingLead
        ? createPortal(
            <div className="fixed inset-0 z-[231] flex items-center justify-center overflow-y-auto p-4">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="Close"
                onClick={closeEditModal}
              />
              <form
                onSubmit={(ev) => void submitLeadEdit(ev)}
                className="relative z-10 my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-teal-900/55 dark:bg-[#121f28]"
              >
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Edit lead</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Update company, contact, phone, platform and notes for this pipeline card.
                </p>
                {editErr ? (
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
                    {editErr}
                  </p>
                ) : null}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-edit-company">
                      Company
                    </label>
                    <input
                      id="erp-lead-edit-company"
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                      required
                      maxLength={240}
                      autoComplete="organization"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-edit-contact">
                      Contact name
                    </label>
                    <input
                      id="erp-lead-edit-contact"
                      value={editContact}
                      onChange={(e) => setEditContact(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                      maxLength={200}
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-edit-email">
                      Email
                    </label>
                    <input
                      id="erp-lead-edit-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                      maxLength={320}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-edit-phone">
                      Phone
                    </label>
                    <input
                      id="erp-lead-edit-phone"
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                      maxLength={64}
                      inputMode="tel"
                      autoComplete="off"
                      placeholder="+1 555 010 1234"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-edit-platform">
                      Platform
                    </label>
                    <select
                      id="erp-lead-edit-platform"
                      value={editPlatformId}
                      onChange={(e) => setEditPlatformId(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                    >
                      {editPlatformOptions.map((p) => (
                        <option key={String(p.id)} value={String(p.id)}>
                          {String(p.label || p.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400" htmlFor="erp-lead-edit-notes">
                      Notes
                    </label>
                    <textarea
                      id="erp-lead-edit-notes"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="mt-1.5 min-h-[7rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                      maxLength={5000}
                      rows={5}
                      placeholder="What was discussed, follow-ups, next steps…"
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Shown on the lead card. Use new lines to log call-by-call notes.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    disabled={editBusy}
                    onClick={closeEditModal}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editBusy}
                    className="flex-1 rounded-xl erp-brand-fill py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {editBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
