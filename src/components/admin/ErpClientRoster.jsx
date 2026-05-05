'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { erpAuthorizedFetch, fetchErpWorkspaceRoleTypeOptions } from '../../lib/erp-client-api';
import { erpWorkspaceRolePillOptionsForViewer, isErpGlobalAdmin } from '../../lib/erp-roles';
import ErpUserAvatar from '../erp/ErpUserAvatar';
import { useErpSession } from '../erp/useErpSession';
import ErpAddClientModal from './ErpAddClientModal';
import { ERP_LIST_SEARCH_INPUT_CLASS, filterListBySearch } from '../../lib/erp-list-search';
import { ERP_DARK_PILL_PRIMARY, ERP_DARK_SECTION_MAIN_PANEL } from '../../lib/erp-dark-surfaces';
import { erpModalPanelMaxWidthClass } from '../erp/ErpModalFormPrimitives';

/** Typed confirmation for removing a client from the workspace (same pattern as Members). */
const REMOVE_CONFIRM_PHRASE = 'remove';

/**
 * Loads workspace clients via `/api/erp/me/clients-directory` (RBAC + service role),
 * so anyone with Clients → View sees the same directory scope as admins, not only clients on shared projects.
 */
export default function ErpClientRoster() {
  const { profile, session, erpCan } = useErpSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** @type {{ userId: string, name: string, email: string | null, phone: string | null, projects: { id: string, name: string }[] }[]} */
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientMenuUserId, setClientMenuUserId] = useState(null);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [removeConfirmRow, setRemoveConfirmRow] = useState(null);
  const [removeConfirmTyped, setRemoveConfirmTyped] = useState('');
  const [removeConfirmErr, setRemoveConfirmErr] = useState('');
  const [savingRoleUserId, setSavingRoleUserId] = useState(null);
  const [roleErr, setRoleErr] = useState('');
  const [assignRoleOptions, setAssignRoleOptions] = useState([]);
  const clientMenuShellRef = useRef(null);

  const canRemoveClient = isErpGlobalAdmin(profile?.role);
  const canAssignWorkspaceRoles = erpCan('clients', 'edit');
  const canAddClient = erpCan('clients', 'create');
  const removeTypedOk =
    removeConfirmTyped.trim().toLowerCase() === REMOVE_CONFIRM_PHRASE.toLowerCase();

  const displayRows = useMemo(
    () =>
      filterListBySearch(rows, search, (r) => [
        r.name,
        r.email,
        r.phone,
        ...(r.projects || []).map((p) => p.name),
      ]),
    [rows, search],
  );

  useEffect(() => {
    if (!clientMenuUserId) return;
    function onDocMouseDown(e) {
      const el = clientMenuShellRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setClientMenuUserId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [clientMenuUserId]);

  function closeRemoveConfirmModal() {
    setRemoveConfirmRow(null);
    setRemoveConfirmTyped('');
    setRemoveConfirmErr('');
  }

  function openRemoveConfirmModal(row) {
    const userId = row?.userId;
    if (!userId || userId === session?.user?.id) return;
    setRemoveConfirmRow(row);
    setRemoveConfirmTyped('');
    setRemoveConfirmErr('');
    setClientMenuUserId(null);
  }

  useEffect(() => {
    if (!removeConfirmRow) return;
    function onKey(e) {
      if (e.key === 'Escape') closeRemoveConfirmModal();
    }
    document.addEventListener('keydown', onKey);
    const t = window.requestAnimationFrame(() => {
      document.getElementById('client-remove-confirm-input')?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(t);
    };
  }, [removeConfirmRow]);

  async function executeConfirmedRemove() {
    const row = removeConfirmRow;
    const userId = row?.userId;
    if (!userId || userId === session?.user?.id || !removeTypedOk) return;
    setRemoveConfirmErr('');
    setRemovingUserId(userId);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove user');
      setRows((prev) => prev.filter((x) => x.userId !== userId));
      setClientMenuUserId(null);
      closeRemoveConfirmModal();
    } catch (e) {
      setRemoveConfirmErr(e?.message || 'Could not remove client');
    } finally {
      setRemovingUserId(null);
    }
  }

  /**
   * Manually overwrite a user's `erp_profiles.role`. Mirrors the same affordance
   * on the Members page so admins can heal a workspace where a user got into
   * the wrong bucket without ever needing SQL access. If the new role isn't
   * `client` the row leaves this list immediately.
   */
  async function onChangeWorkspaceRole(userId, nextRole) {
    if (!userId || !nextRole) return;
    if (userId === session?.user?.id) {
      setRoleErr('You cannot change your own role from here.');
      return;
    }
    setRoleErr('');
    setSavingRoleUserId(userId);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change role');
      if (nextRole !== 'client') {
        setRows((prev) => prev.filter((row) => row.userId !== userId));
      }
      setClientMenuUserId(null);
    } catch (e) {
      setRoleErr(e?.message || 'Could not change role');
    } finally {
      setSavingRoleUserId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/me/clients-directory');
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setError('You do not have permission to view the client directory.');
        setRows([]);
        return;
      }
      if (!res.ok) {
        throw new Error(j.error || 'Could not load clients');
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setError(e?.message || 'Could not load clients');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { options } = await fetchErpWorkspaceRoleTypeOptions();
      if (cancelled || !options.length) return;
      setAssignRoleOptions(options.map((o) => ({ id: o.id, label: o.label })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summaryCount = displayRows.length;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-11 w-11 rounded-full border-[3px] border-amber-200 border-t-amber-700 border-r-orange-500 animate-spin shadow-md" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/80 px-4 py-3 shadow-sm">
        {error}
      </p>
    );
  }

  const addClientBtnClass =
    'inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-shadow hover:shadow-lg';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {rows.length > 0 ? (
          <label className="block w-full min-w-0 max-w-md flex-1">
            <span className="sr-only">Search clients</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, or project…"
              className={ERP_LIST_SEARCH_INPUT_CLASS}
              autoComplete="off"
            />
          </label>
        ) : (
          <span className="hidden min-h-[42px] flex-1 sm:block" aria-hidden />
        )}
        {canAddClient ? (
          <button type="button" onClick={() => setAddClientOpen(true)} className={addClientBtnClass}>
            Add client
          </button>
        ) : (
          <span className="hidden min-h-[42px] sm:block" aria-hidden />
        )}
      </div>

      <ErpAddClientModal open={addClientOpen} onClose={() => setAddClientOpen(false)} onSuccess={() => load()} />

      {rows.length > 0 && displayRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-amber-900/85 px-3 py-1.5 font-bold text-amber-50 shadow-md ring-1 ring-amber-400/25">
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]" aria-hidden />
            {summaryCount} client{summaryCount === 1 ? '' : 's'} shown
          </span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-amber-200/50 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 p-10 text-center shadow-[0_16px_48px_-20px_rgba(146,64,14,0.25)] ring-1 ring-amber-900/[0.06]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-300/10 blur-2xl" aria-hidden />
          <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-900/20">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="relative mt-5 text-base font-semibold text-slate-900">No clients yet</p>
          <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            Invite people as <span className="font-medium text-amber-950/90">clients</span> so they only see the projects you assign. They’ll show up here once they join.
          </p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
            {canAddClient ? (
              <button
                type="button"
                onClick={() => setAddClientOpen(true)}
                className="inline-flex rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg"
              >
                Add client
              </button>
            ) : null}
            <Link
              href="/erp/admin/invites"
              className="inline-flex rounded-2xl border border-amber-200/90 bg-white/90 px-5 py-2.5 text-sm font-bold text-amber-950 shadow-sm hover:bg-amber-50/90"
            >
              Invites &amp; users
            </Link>
          </div>
        </div>
      ) : displayRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-amber-300/55 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-orange-50/40 py-12 text-center text-sm font-medium text-amber-950/75 backdrop-blur-sm shadow-inner">
          No clients match your search.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {displayRows.map((r) => {
            const menuOpen = clientMenuUserId === r.userId;
            return (
              <li
                key={r.userId}
                className={
                  'group relative flex flex-col gap-4 overflow-visible rounded-2xl border border-amber-200/55 bg-white/95 p-5 shadow-[0_14px_44px_-18px_rgba(146,64,14,0.22)] ring-1 ring-amber-900/[0.05] backdrop-blur-sm transition-all duration-300 hover:border-amber-300/70 hover:shadow-[0_20px_52px_-14px_rgba(146,64,14,0.28)] dark:border-teal-800/45 ' +
                  ERP_DARK_SECTION_MAIN_PANEL +
                  (menuOpen ? ' z-50' : '')
                }
              >
                <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 opacity-90" aria-hidden />

                <div className="flex items-start gap-3 pt-2">
                  <div className="relative shrink-0">
                    <ErpUserAvatar
                      profile={r.avatarProfile}
                      email={r.email}
                      size="lg"
                      className="!h-12 !w-12 !text-sm shadow-lg ring-2 ring-amber-100/80"
                      imgClassName="shadow-lg ring-2 ring-amber-100/80"
                      alt={r.name || 'Client'}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate dark:text-slate-100">{r.name}</p>
                    <p
                      className={
                        'mt-0.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900/80 ring-1 ring-amber-200/70 ' +
                        ERP_DARK_PILL_PRIMARY
                      }
                    >
                      Client
                    </p>
                  </div>
                  {(canRemoveClient || canAssignWorkspaceRoles) && r.userId !== session?.user?.id ? (
                    <div className="relative shrink-0" ref={menuOpen ? clientMenuShellRef : undefined}>
                      <button
                        type="button"
                        className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/35 dark:text-slate-500 dark:hover:bg-teal-950/80 dark:hover:text-slate-200"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label={`Actions for ${r.name}`}
                        onClick={() =>
                          setClientMenuUserId((cur) => {
                            const next = cur === r.userId ? null : r.userId;
                            return next;
                          })
                        }
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <circle cx="12" cy="5" r="1.75" />
                          <circle cx="12" cy="12" r="1.75" />
                          <circle cx="12" cy="19" r="1.75" />
                        </svg>
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 top-full z-[60] mt-1 w-[min(calc(100vw-2rem),16rem)] rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl ring-1 ring-slate-900/[0.06] dark:border-teal-800/50 dark:bg-[#121f28] dark:ring-teal-900/40">
                          {canAssignWorkspaceRoles ? (
                            <>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Workspace role
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(assignRoleOptions.length > 0
                                  ? assignRoleOptions
                                  : erpWorkspaceRolePillOptionsForViewer(profile?.role)
                                ).map((opt) => {
                                  const isCurrent = opt.id === 'client';
                                  const disabled = savingRoleUserId === r.userId || isCurrent;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => void onChangeWorkspaceRole(r.userId, opt.id)}
                                      className={
                                        'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ' +
                                        (isCurrent
                                          ? 'bg-amber-700 text-white shadow-sm dark:bg-amber-700'
                                          : 'border border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:text-amber-900 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:border-amber-600/55')
                                      }
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {savingRoleUserId === r.userId ? (
                                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Updating role…</p>
                              ) : null}
                              {roleErr && clientMenuUserId === r.userId ? (
                                <p className="mt-2 text-[11px] font-medium text-rose-700 dark:text-rose-300">{roleErr}</p>
                              ) : null}
                            </>
                          ) : null}

                          {canAssignWorkspaceRoles && canRemoveClient ? (
                            <div className="my-3 border-t border-slate-100 dark:border-teal-900/40" aria-hidden />
                          ) : null}

                          {canRemoveClient ? (
                          <button
                            type="button"
                            disabled={removingUserId === r.userId || savingRoleUserId === r.userId}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/90 bg-rose-50/90 px-3 py-2.5 text-left text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100/90 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                            onClick={() => openRemoveConfirmModal(r)}
                          >
                            Remove client
                          </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-xl border border-slate-100/90 bg-slate-50/50 p-3 dark:border-teal-900/35 dark:bg-[#0c141a]/90">
                  {r.email ? (
                    <a
                      href={`mailto:${r.email}`}
                      className="flex items-center gap-2 text-[13px] font-medium text-[#103D4D] hover:underline dark:text-teal-300"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#103D4D] shadow-sm ring-1 ring-slate-200/80 dark:bg-[#121f28] dark:text-teal-200 dark:ring-teal-800/50">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <span className="min-w-0 truncate">{r.email}</span>
                    </a>
                  ) : (
                    <p className="text-[12px] text-slate-400 dark:text-slate-500">No email on file</p>
                  )}
                  {r.phone ? (
                    <a
                      href={`tel:${r.phone.replace(/\s/g, '')}`}
                      className="flex items-center gap-2 text-[13px] font-medium text-teal-900/85 hover:underline dark:text-teal-200"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/80 dark:bg-[#121f28] dark:text-teal-200 dark:ring-teal-800/50">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </span>
                      <span>{r.phone}</span>
                    </a>
                  ) : (
                    <p className="text-[12px] text-slate-400 dark:text-slate-500">No phone on file</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Projects ({r.projects.length})
                  </p>
                  <ul className="max-h-[140px] space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {r.projects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/erp/projects/${p.id}`}
                          className="block truncate rounded-xl border border-amber-100/90 bg-gradient-to-r from-white to-amber-50/50 px-3 py-2 text-xs font-semibold text-[#103D4D] shadow-sm ring-1 ring-amber-900/[0.04] transition-all hover:border-amber-300/70 hover:shadow-md dark:border-teal-800/45 dark:bg-gradient-to-r dark:from-[#121f28] dark:to-[#0c1822] dark:text-teal-200 dark:ring-teal-900/30 dark:hover:border-teal-600/50"
                        >
                          {p.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {typeof document !== 'undefined' && removeConfirmRow
        ? createPortal(
            <div className="fixed inset-0 z-[230] flex items-center justify-center p-0 sm:p-6">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="Close dialog"
                onClick={closeRemoveConfirmModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="client-remove-title"
                className={`relative z-10 w-full ${erpModalPanelMaxWidthClass} rounded-none border border-rose-200/60 bg-white p-6 shadow-[0_24px_64px_-16px_rgba(127,29,29,0.35)] ring-1 ring-rose-900/[0.08] sm:rounded-2xl`}
              >
                <h2 id="client-remove-title" className="text-lg font-bold text-slate-900">
                  Remove client from workspace
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Permanently remove{' '}
                  <span className="font-semibold text-slate-900">{removeConfirmRow.name?.trim() || 'this client'}</span>
                  ? Their auth account will be deleted, they will be removed from all projects, and their messages and
                  tasks they created will be removed.{' '}
                  <span className="font-medium text-rose-800">This cannot be undone.</span>
                </p>
                <div className="mt-5">
                  <label
                    className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
                    htmlFor="client-remove-confirm-input"
                  >
                    Type <span className="font-mono text-amber-800">{REMOVE_CONFIRM_PHRASE}</span> to confirm
                  </label>
                  <input
                    id="client-remove-confirm-input"
                    type="text"
                    value={removeConfirmTyped}
                    onChange={(e) => {
                      setRemoveConfirmTyped(e.target.value);
                      setRemoveConfirmErr('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-rose-400/60 focus:outline-none focus:ring-4 focus:ring-rose-500/15"
                    placeholder={REMOVE_CONFIRM_PHRASE}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={removingUserId === removeConfirmRow.userId}
                  />
                </div>
                {removeConfirmErr ? (
                  <p className="mt-3 text-sm font-medium text-rose-700">{removeConfirmErr}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={closeRemoveConfirmModal}
                    disabled={removingUserId === removeConfirmRow.userId}
                    className="flex-1 min-w-[7rem] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!removeTypedOk || removingUserId === removeConfirmRow.userId}
                    onClick={() => void executeConfirmedRemove()}
                    className="flex-1 min-w-[7rem] rounded-xl bg-gradient-to-r from-rose-700 to-red-800 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {removingUserId === removeConfirmRow.userId ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <span
                          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                          aria-hidden
                        />
                        Removing…
                      </span>
                    ) : (
                      'Permanently delete'
                    )}
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
