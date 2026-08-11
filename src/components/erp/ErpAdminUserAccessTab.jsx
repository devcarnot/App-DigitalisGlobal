'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ERP_COMPACT_FILTER_TABLIST_CLASS, erpCompactFilterTabClass } from './ErpModalFormPrimitives';
import {
  ERP_RBAC_ACTIONS,
  ERP_RBAC_MODULE_META,
} from '../../lib/erp-rbac-modules';
import {
  ERP_WORKSPACE_ROLE_LABELS,
  erpWorkspaceRoleAssignOptions,
  erpWorkspaceRoleTitle,
  isErpGlobalAdmin,
  mergeWorkspaceRoleTabKeys,
} from '../../lib/erp-roles';
import { erpAuthorizedFetch, fetchErpWorkspaceRoleTypeOptions } from '../../lib/erp-client-api';
import {
  beginErpCachedLoad,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';
import { useErpSession } from './useErpSession';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';

const GROUP_ORDER = ['core', 'work', 'communication', 'hr', 'reports', 'system'];

const GROUP_LABEL = {
  core: 'Core',
  work: 'Work',
  communication: 'Communication',
  hr: 'HR',
  reports: 'Reports',
  system: 'System',
};

const ACTION_LABEL = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' };

/** `<select>` option value: not a real role; opens “add custom role” modal. */
const ADD_WORKSPACE_ROLE_OPTION = '__erp_add_workspace_role__';

/** User must type this (case-insensitive) to enable permanent workspace removal. */
const REMOVE_CONFIRM_PHRASE = 'remove';

/** Clone grant map (safe JSON round-trip). */
function cloneGrants(g) {
  try {
    return JSON.parse(JSON.stringify(g || {}));
  } catch {
    return {};
  }
}

/**
 * @param {{ canEdit: boolean, refreshRbac?: () => void | Promise<void> }} props
 */
export default function ErpAdminUserAccessTab({ canEdit, refreshRbac }) {
  const { profile } = useErpSession();
  const USERS_CACHE_KEY = 'admin:user-permissions';
  const [users, setUsers] = useState(() => pickErpCache(USERS_CACHE_KEY, (c) => c.users ?? [], []));
  const [loadErr, setLoadErr] = useState(/** @type {string | null} */ (null));
  const [search, setSearch] = useState('');
  /** @type {any | null} */
  const [selected, setSelected] = useState(null);
  /** @type {Record<string, { view: boolean, create: boolean, edit: boolean, delete: boolean }> | null} */
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(/** @type {string | null} */ (null));
  const [assignRoleOptions, setAssignRoleOptions] = useState(/** @type {{ id: string, label: string }[]} */ ([]));
  const [rolePatchUserId, setRolePatchUserId] = useState(/** @type {string | null} */ (null));
  const [roleActionErr, setRoleActionErr] = useState(/** @type {string | null} */ (null));
  const [removingUserId, setRemovingUserId] = useState(/** @type {string | null} */ (null));
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const [addRoleErr, setAddRoleErr] = useState(/** @type {string | null} */ (null));
  const [addRoleKey, setAddRoleKey] = useState('');
  const [addRoleLabel, setAddRoleLabel] = useState('');
  const [addRoleSaving, setAddRoleSaving] = useState(false);
  const [openingUserId, setOpeningUserId] = useState(/** @type {string | null} */ (null));
  const [rowMenuUserId, setRowMenuUserId] = useState(/** @type {string | null} */ (null));
  /** @type {any | null} */
  const [removeConfirmUser, setRemoveConfirmUser] = useState(null);
  const [removeConfirmTyped, setRemoveConfirmTyped] = useState('');
  const [removeConfirmErr, setRemoveConfirmErr] = useState('');
  const rowMenuShellRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  /** Active workspace-role tab on the “by person” directory (reduces a long single list). */
  const [peopleRoleTab, setPeopleRoleTab] = useState(/** @type {string | null} */ (null));

  const removeTypedOk =
    removeConfirmTyped.trim().toLowerCase() === REMOVE_CONFIRM_PHRASE.toLowerCase();

  const canDefineWorkspaceRoles = isErpGlobalAdmin(profile?.role) && canEdit;

  const modulesByGroup = useMemo(() => {
    /** @type {Record<string, { key: string, label: string, sort: number }[]>} */
    const out = {};
    for (const [key, meta] of Object.entries(ERP_RBAC_MODULE_META)) {
      const g = meta.group || 'core';
      if (!out[g]) out[g] = [];
      out[g].push({ key, label: meta.label, sort: meta.sort });
    }
    for (const g of Object.keys(out)) {
      out[g].sort((a, b) => a.sort - b.sort);
    }
    return out;
  }, []);

  const customRoleLabelMap = useMemo(() => {
    const m = {};
    for (const o of assignRoleOptions) {
      if (!ERP_WORKSPACE_ROLE_LABELS[o.id]) m[o.id] = o.label;
    }
    return m;
  }, [assignRoleOptions]);

  const formatWorkspaceRole = useCallback(
    (roleKey) => erpWorkspaceRoleTitle(roleKey, customRoleLabelMap),
    [customRoleLabelMap],
  );

  const refreshAssignRoleOptions = useCallback(async () => {
    const { options } = await fetchErpWorkspaceRoleTypeOptions();
    if (options.length) setAssignRoleOptions(options.map((o) => ({ id: o.id, label: o.label })));
  }, []);

  const load = useCallback(async () => {
    setLoadErr(null);
    beginErpCachedLoad(USERS_CACHE_KEY, (cached) => {
      setUsers(Array.isArray(cached?.users) ? cached.users : []);
    }, () => {});
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/user-permissions?summary=1');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadErr(j.error || `HTTP ${res.status}`);
        if (!hasErpDataCache(USERS_CACHE_KEY)) setUsers([]);
        return null;
      }
      const list = Array.isArray(j.users) ? j.users : [];
      writeErpDataCache(USERS_CACHE_KEY, { users: list });
      setUsers(list);
      return list;
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load');
      if (!hasErpDataCache(USERS_CACHE_KEY)) setUsers([]);
      return null;
    }
  }, []);

  useEffect(() => {
    void Promise.all([load(), refreshAssignRoleOptions()]);
  }, [load, refreshAssignRoleOptions]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = String(u.full_name || '').toLowerCase();
      const em = String(u.contact_email || '').toLowerCase();
      const rk = String(u.role || '').toLowerCase();
      const roleLabel = formatWorkspaceRole(u.role).toLowerCase();
      return name.includes(q) || em.includes(q) || rk.includes(q) || roleLabel.includes(q);
    });
  }, [users, search, formatWorkspaceRole]);

  const peopleRoleKeys = useMemo(
    () =>
      mergeWorkspaceRoleTabKeys(
        assignRoleOptions.map((o) => o.id),
        filteredUsers.map((u) => String(u.role || '')),
      ),
    [assignRoleOptions, filteredUsers],
  );

  const countsByRolePeople = useMemo(() => {
    const m = {};
    for (const u of filteredUsers) {
      const k = String(u.role || '');
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [filteredUsers]);

  useEffect(() => {
    if (!peopleRoleKeys.length) {
      setPeopleRoleTab(null);
      return;
    }
    setPeopleRoleTab((prev) => (prev && peopleRoleKeys.includes(prev) ? prev : peopleRoleKeys[0]));
  }, [peopleRoleKeys]);

  const peopleInTab = useMemo(() => {
    const rk = peopleRoleTab && peopleRoleKeys.includes(peopleRoleTab) ? peopleRoleTab : peopleRoleKeys[0];
    if (!rk) return [];
    return filteredUsers.filter((u) => String(u.role || '') === rk);
  }, [filteredUsers, peopleRoleTab, peopleRoleKeys]);

  const openEdit = useCallback(async (u) => {
    if (!u?.id) return;
    setOpeningUserId(u.id);
    setSaveErr(null);
    try {
      const res = await erpAuthorizedFetch(
        `/api/erp/admin/user-permissions?userId=${encodeURIComponent(u.id)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveErr(j.error || `HTTP ${res.status}`);
        return;
      }
      const full = j.user;
      if (!full) {
        setSaveErr('Could not load permissions for this user.');
        return;
      }
      setSelected(full);
      setDraft(cloneGrants(full.effectiveGrants));
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setOpeningUserId(null);
    }
  }, []);

  const closeEdit = useCallback(() => {
    setSelected(null);
    setDraft(null);
    setSaveErr(null);
  }, []);

  const setGrant = useCallback(
    (moduleKey, action, value) => {
      if (!canEdit) return;
      setDraft((prev) => {
        if (!prev) return prev;
        const cur = prev[moduleKey] || { view: false, create: false, edit: false, delete: false };
        return {
          ...prev,
          [moduleKey]: { ...cur, [action]: value },
        };
      });
    },
    [canEdit],
  );

  const onSaveUser = useCallback(async () => {
    if (!canEdit || !selected || !draft) return;
    setSaveErr(null);
    setSaving(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/user-permissions', {
        method: 'PATCH',
        body: JSON.stringify({ userId: selected.id, grants: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveErr(j.error || `HTTP ${res.status}`);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id
            ? {
                ...u,
                hasOverride: Object.keys(j.overrideGrants || {}).length > 0,
              }
            : u,
        ),
      );
      await refreshRbac?.();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [canEdit, selected, draft, refreshRbac, closeEdit]);

  const onResetUser = useCallback(async () => {
    if (!canEdit || !selected) return;
    setSaveErr(null);
    setSaving(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/user-permissions', {
        method: 'PATCH',
        body: JSON.stringify({ userId: selected.id, grants: cloneGrants(selected.roleMergedGrants) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveErr(j.error || `HTTP ${res.status}`);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id
            ? {
                ...u,
                hasOverride: false,
              }
            : u,
        ),
      );
      await refreshRbac?.();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  }, [canEdit, selected, refreshRbac, closeEdit]);

  const onWorkspaceRoleChange = useCallback(
    async (u, nextRole) => {
      if (!canEdit || !u?.id || !nextRole) return;
      if (u.id === profile?.id) {
        setRoleActionErr('You cannot change your own role from here.');
        return;
      }
      setRoleActionErr(null);
      setRolePatchUserId(u.id);
      try {
        const res = await erpAuthorizedFetch(`/api/erp/admin/users/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: nextRole }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRoleActionErr(j.error || `HTTP ${res.status}`);
          return;
        }
        const list = await load();
        await refreshRbac?.();
        if (list && selected?.id === u.id) {
          try {
            const res = await erpAuthorizedFetch(
              `/api/erp/admin/user-permissions?userId=${encodeURIComponent(u.id)}`,
            );
            const detail = await res.json().catch(() => ({}));
            if (res.ok && detail.user) {
              setSelected(detail.user);
              setDraft(cloneGrants(detail.user.effectiveGrants));
            } else {
              setSelected((prev) => (prev && prev.id === u.id ? { ...prev, role: nextRole } : prev));
            }
          } catch {
            setSelected((prev) => (prev && prev.id === u.id ? { ...prev, role: nextRole } : prev));
          }
        }
      } catch (e) {
        setRoleActionErr(e instanceof Error ? e.message : 'Could not update role');
      } finally {
        setRolePatchUserId(null);
      }
    },
    [canEdit, profile?.id, load, refreshRbac, selected?.id],
  );

  const closeRowMenu = useCallback(() => setRowMenuUserId(null), []);

  const openRemoveConfirmModal = useCallback(
    (u) => {
      if (!u?.id || u.id === profile?.id) return;
      setRemoveConfirmUser(u);
      setRemoveConfirmTyped('');
      setRemoveConfirmErr('');
      setRowMenuUserId(null);
    },
    [profile?.id],
  );

  const closeRemoveConfirmModal = useCallback(() => {
    setRemoveConfirmUser(null);
    setRemoveConfirmTyped('');
    setRemoveConfirmErr('');
  }, []);

  useEffect(() => {
    if (!removeConfirmUser) return;
    function onKey(e) {
      if (e.key === 'Escape') closeRemoveConfirmModal();
    }
    document.addEventListener('keydown', onKey);
    const t = window.requestAnimationFrame(() => {
      document.getElementById('erp-user-access-remove-confirm-input')?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(t);
    };
  }, [removeConfirmUser, closeRemoveConfirmModal]);

  useEffect(() => {
    if (!rowMenuUserId) return;
    function onDocClick(e) {
      const el = rowMenuShellRef.current;
      if (el && !el.contains(e.target)) closeRowMenu();
    }
    function onKey(e) {
      if (e.key === 'Escape') closeRowMenu();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [rowMenuUserId, closeRowMenu]);

  const executeConfirmedRemove = useCallback(async () => {
    const u = removeConfirmUser;
    if (!canEdit || !u?.id || u.id === profile?.id || !removeTypedOk) return;
    setRemoveConfirmErr('');
    setRoleActionErr(null);
    setRemovingUserId(u.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/users/${u.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRemoveConfirmErr(j.error || `HTTP ${res.status}`);
        return;
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      if (selected?.id === u.id) closeEdit();
      await refreshRbac?.();
      closeRemoveConfirmModal();
    } catch (e) {
      setRemoveConfirmErr(e instanceof Error ? e.message : 'Could not remove user');
    } finally {
      setRemovingUserId(null);
    }
  }, [
    canEdit,
    profile?.id,
    removeConfirmUser,
    removeTypedOk,
    selected?.id,
    closeEdit,
    refreshRbac,
    closeRemoveConfirmModal,
  ]);

  const closeAddRoleModal = useCallback(() => {
    setAddRoleModalOpen(false);
    setAddRoleErr(null);
    setAddRoleKey('');
    setAddRoleLabel('');
  }, []);

  const onWorkspaceRoleSelect = useCallback(
    (u, value) => {
      if (value === ADD_WORKSPACE_ROLE_OPTION) {
        setAddRoleErr(null);
        setAddRoleModalOpen(true);
        setRowMenuUserId(null);
        return;
      }
      setRowMenuUserId(null);
      void onWorkspaceRoleChange(u, value);
    },
    [onWorkspaceRoleChange],
  );

  const onSubmitAddWorkspaceRole = useCallback(async () => {
    if (!canDefineWorkspaceRoles) return;
    setAddRoleErr(null);
    const roleKey = addRoleKey.trim().toLowerCase().replace(/\s+/g, '_');
    const label = addRoleLabel.trim();
    if (!roleKey || !label) {
      setAddRoleErr('Enter a short key (e.g. procurement) and a display label.');
      return;
    }
    setAddRoleSaving(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/workspace-role-types', {
        method: 'POST',
        body: JSON.stringify({ roleKey, label }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddRoleErr(j.error || `HTTP ${res.status}`);
        return;
      }
      await refreshAssignRoleOptions();
      await refreshRbac?.();
      closeAddRoleModal();
    } catch (e) {
      setAddRoleErr(e instanceof Error ? e.message : 'Could not add role');
    } finally {
      setAddRoleSaving(false);
    }
  }, [
    addRoleKey,
    addRoleLabel,
    canDefineWorkspaceRoles,
    refreshAssignRoleOptions,
    refreshRbac,
    closeAddRoleModal,
  ]);

  const hasCustomOverride = selected && Object.keys(selected.overrideGrants || {}).length > 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-teal-800/80 dark:text-teal-200/80">
        Override the role defaults for specific people. Individual settings apply on top of their workspace role and the
        role matrix above.
      </p>

      {loadErr ? <p className="text-sm text-red-600 dark:text-red-400">{loadErr}</p> : null}
      {roleActionErr ? <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{roleActionErr}</p> : null}

      <label className="block max-w-md">
        <span className="sr-only">Search people</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or role…"
          className="w-full rounded-xl border border-cyan-200/70 bg-white/95 px-4 py-2.5 text-sm text-teal-950 shadow-inner placeholder:text-slate-400 focus:border-violet-400/60 focus:outline-none focus:ring-4 focus:ring-violet-500/10 dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white dark:placeholder:text-slate-500"
          autoComplete="off"
        />
      </label>

      {peopleRoleKeys.length > 0 ? (
        <div
          role="tablist"
          aria-label="Filter by workspace role"
          className={`max-w-2xl pb-1 ${ERP_COMPACT_FILTER_TABLIST_CLASS}`}
        >
          {peopleRoleKeys.map((rk) => {
            const n = countsByRolePeople[rk] ?? 0;
            const lab = formatWorkspaceRole(rk);
            const active =
              rk === (peopleRoleTab && peopleRoleKeys.includes(peopleRoleTab) ? peopleRoleTab : peopleRoleKeys[0]);
            return (
              <button
                key={rk}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeopleRoleTab(rk)}
                className={erpCompactFilterTabClass(active)}
              >
                {lab} <span className="tabular-nums opacity-90">({n})</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-cyan-200/50 bg-white/90 shadow-sm dark:border-teal-900/50 dark:bg-[#0a1520]/90">
        <table className="w-full min-w-[40rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-cyan-100/70 bg-cyan-50/50 dark:border-teal-900/60 dark:bg-teal-950/40">
              <th className="px-3 py-2.5 font-semibold text-teal-950/90 dark:text-white/95">Name</th>
              <th className="px-3 py-2.5 font-semibold text-teal-950/90 dark:text-white/95">Workspace role</th>
              <th className="px-3 py-2.5 font-semibold text-teal-950/90 dark:text-white/95">Access</th>
              <th className="px-3 py-2.5 font-semibold text-teal-950/90 dark:text-white/95">Actions</th>
            </tr>
          </thead>
          <tbody>
            {peopleInTab.length === 0 ? (
              <tr className="border-b border-cyan-100/40 dark:border-teal-950/60">
                <td colSpan={4} className="px-3 py-8 text-center text-[13px] text-teal-800/75 dark:text-teal-200/75">
                  {filteredUsers.length === 0
                    ? 'No people match your search.'
                    : 'No people with this workspace role in the current filter.'}
                </td>
              </tr>
            ) : (
              peopleInTab.map((u) => {
              const pickerOpts =
                assignRoleOptions.length > 0
                  ? assignRoleOptions
                  : erpWorkspaceRoleAssignOptions(profile?.role);
              return (
              <tr
                key={u.id}
                className="border-b border-cyan-100/40 last:border-0 dark:border-teal-950/60"
              >
                <td className="px-3 py-2.5 font-medium text-teal-950/95 dark:text-white/95">
                  {u.full_name?.trim() || 'n/a'}
                  {u.contact_email ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-teal-700/75 dark:text-teal-300/70">
                      {u.contact_email}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-teal-900/85 dark:text-white/85">
                  <span className="font-medium">{formatWorkspaceRole(u.role)}</span>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    disabled={openingUserId === u.id}
                    onClick={() => void openEdit(u)}
                    className="rounded-lg border border-cyan-200/80 bg-white px-3 py-1.5 text-[12px] font-bold text-[#103D4D] shadow-sm hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-teal-800/55 dark:bg-[#101a22] dark:text-teal-100 dark:hover:bg-white/10"
                  >
                    {openingUserId === u.id
                      ? 'Opening…'
                      : u.hasOverride || Object.keys(u.overrideGrants || {}).length > 0
                        ? 'Edit overrides'
                        : 'Configure'}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canEdit && u.id !== profile?.id ? (
                    <div
                      className="relative inline-flex justify-end"
                      ref={rowMenuUserId === u.id ? rowMenuShellRef : undefined}
                    >
                      <button
                        type="button"
                        className="rounded-xl p-2 text-teal-600 transition-colors hover:bg-cyan-50 hover:text-[#103D4D] focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:text-teal-300/90 dark:hover:bg-teal-950/70 dark:hover:text-white"
                        aria-expanded={rowMenuUserId === u.id}
                        aria-haspopup="menu"
                        aria-label={`Actions for ${u.full_name?.trim() || 'user'}`}
                        onClick={() =>
                          setRowMenuUserId((cur) => {
                            const next = cur === u.id ? null : u.id;
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
                      {rowMenuUserId === u.id ? (
                        <div className="absolute right-0 top-full z-[70] mt-1 w-[min(calc(100vw-2rem),18rem)] rounded-2xl border border-cyan-200/90 bg-white p-3 text-left shadow-xl ring-1 ring-slate-900/[0.06] dark:border-teal-800/50 dark:bg-[#121f28] dark:ring-teal-900/40">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-800/70 dark:text-teal-300/70">
                            Change workspace role
                          </p>
                          <select
                            value={String(u.role || 'team_member')}
                            disabled={rolePatchUserId === u.id || removingUserId === u.id}
                            onChange={(e) => onWorkspaceRoleSelect(u, e.target.value)}
                            className="w-full rounded-lg border border-cyan-200/80 bg-white py-2 pl-2 pr-8 text-[12px] font-medium text-teal-950 shadow-sm focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#101a22] dark:text-white"
                          >
                            {pickerOpts.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                            {canDefineWorkspaceRoles ? (
                              <option value={ADD_WORKSPACE_ROLE_OPTION} className="font-semibold">
                                + Add new role type…
                              </option>
                            ) : null}
                          </select>
                          <div className="my-3 border-t border-cyan-100 dark:border-teal-900/50" aria-hidden />
                          <button
                            type="button"
                            disabled={removingUserId === u.id || rolePatchUserId === u.id}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/90 bg-rose-50/90 px-3 py-2.5 text-left text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100/90 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                            onClick={() => openRemoveConfirmModal(u)}
                          >
                            {removingUserId === u.id ? (
                              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-rose-400 border-t-rose-800 dark:border-t-rose-200" />
                            ) : null}
                            Remove member
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">n/a</span>
                  )}
                </td>
              </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>



      {addRoleModalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={closeAddRoleModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-workspace-role-title"
            className={`relative z-10 w-full max-w-md rounded-2xl border border-violet-200/60 bg-white p-5 shadow-2xl ring-1 ring-violet-900/[0.08] dark:border-teal-900/50 dark:bg-[#0d1820]`}
          >
            <h2 id="add-workspace-role-title" className="text-lg font-bold text-[#103D4D] dark:text-white">
              Add workspace role type
            </h2>
            <p className="mt-1 text-[13px] text-teal-800/75 dark:text-teal-200/75">
              New roles appear in every workspace-role dropdown. Permissions default like team member until you edit them
              under <span className="font-semibold">By role</span>.
            </p>
            {addRoleErr ? <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{addRoleErr}</p> : null}
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-teal-800/70 dark:text-teal-300/70">
                  Key (slug)
                </span>
                <input
                  value={addRoleKey}
                  onChange={(e) => setAddRoleKey(e.target.value)}
                  placeholder="e.g. procurement"
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-teal-800/70 dark:text-teal-300/70">
                  Display label
                </span>
                <input
                  value={addRoleLabel}
                  onChange={(e) => setAddRoleLabel(e.target.value)}
                  placeholder="e.g. Procurement"
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={addRoleSaving}
                onClick={() => void onSubmitAddWorkspaceRole()}
                className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-violet-800 px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-50"
              >
                {addRoleSaving ? 'Saving…' : 'Create role type'}
              </button>
              <button
                type="button"
                disabled={addRoleSaving}
                onClick={closeAddRoleModal}
                className="inline-flex rounded-xl border border-cyan-200/80 px-4 py-2 text-sm font-bold text-[#103D4D] dark:border-teal-800/55 dark:text-teal-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {typeof document !== 'undefined' && removeConfirmUser
        ? createPortal(
            <div className="fixed inset-0 z-[230] flex items-center justify-center p-0 sm:p-6">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] dark:bg-black/60"
                aria-label="Close dialog"
                onClick={closeRemoveConfirmModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-user-access-remove-title"
                className={`relative z-10 w-full ${erpModalPanelMaxWidthClass} rounded-none border border-rose-200/60 bg-white p-6 shadow-[0_24px_64px_-16px_rgba(127,29,29,0.35)] ring-1 ring-rose-900/[0.08] sm:rounded-2xl dark:border-rose-900/45 dark:bg-[#0d1820] dark:ring-rose-900/20`}
              >
                <h2 id="erp-user-access-remove-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Remove from workspace
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-teal-200/80">
                  Permanently remove{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {removeConfirmUser.full_name?.trim() || removeConfirmUser.contact_email || 'this user'}
                  </span>
                  ? Their account will be deleted along with workspace data tied to this user.{' '}
                  <span className="font-medium text-rose-800 dark:text-rose-300">This cannot be undone.</span>
                </p>
                <div className="mt-5">
                  <label
                    className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
                    htmlFor="erp-user-access-remove-confirm-input"
                  >
                    Type <span className="font-mono text-[#103D4D] dark:text-teal-300">{REMOVE_CONFIRM_PHRASE}</span> to
                    confirm
                  </label>
                  <input
                    id="erp-user-access-remove-confirm-input"
                    type="text"
                    value={removeConfirmTyped}
                    onChange={(e) => {
                      setRemoveConfirmTyped(e.target.value);
                      setRemoveConfirmErr('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-rose-400/60 focus:outline-none focus:ring-4 focus:ring-rose-500/15 dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-rose-500/50"
                    placeholder={REMOVE_CONFIRM_PHRASE}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={removingUserId === removeConfirmUser.id}
                  />
                </div>
                {removeConfirmErr ? (
                  <p className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300">{removeConfirmErr}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={closeRemoveConfirmModal}
                    disabled={removingUserId === removeConfirmUser.id}
                    className="min-w-[7rem] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#16242e]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!removeTypedOk || removingUserId === removeConfirmUser.id}
                    onClick={() => void executeConfirmedRemove()}
                    className="min-w-[7rem] flex-1 rounded-xl bg-gradient-to-r from-rose-700 to-red-800 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {removingUserId === removeConfirmUser.id ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <span
                          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                          aria-hidden
                        />
                        Removing…
                      </span>
                    ) : (
                      'Remove permanently'
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {selected && draft ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            aria-label="Close"
            onClick={closeEdit}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-access-title"
            className={`relative z-10 max-h-[min(90vh,48rem)] w-full ${erpModalPanelMaxWidthClass} overflow-y-auto rounded-2xl border border-cyan-200/60 bg-white p-5 shadow-2xl ring-1 ring-cyan-900/[0.06] dark:border-teal-900/50 dark:bg-[#0d1820]`}
          >
            <h2 id="user-access-title" className="text-lg font-bold text-[#103D4D] dark:text-white">
              Access for {selected.full_name?.trim() || 'user'}
            </h2>
            <p className="mt-1 text-[13px] text-teal-800/75 dark:text-teal-200/75">
              Base role:{' '}
              <span className="font-semibold">{formatWorkspaceRole(selected.role)}</span>
              {hasCustomOverride ? (
                <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-900 dark:bg-violet-950/60 dark:text-violet-200">
                  Custom overrides
                </span>
              ) : null}
            </p>

            <div className="mt-4 space-y-6">
              {GROUP_ORDER.filter((g) => modulesByGroup[g]?.length).map((g) => (
                <section key={g} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wide text-teal-800/55 dark:text-teal-300/60">
                    {GROUP_LABEL[g] || g}
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-cyan-100/80 dark:border-teal-900/50">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-cyan-100/70 bg-cyan-50/40 dark:border-teal-900/50 dark:bg-teal-950/30">
                          <th className="px-2 py-2 font-semibold">Module</th>
                          {ERP_RBAC_ACTIONS.map((a) => (
                            <th key={a} className="px-1 py-2 text-center font-semibold w-14">
                              {ACTION_LABEL[a]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {modulesByGroup[g].map((row) => {
                          const gr = draft[row.key] || {
                            view: false,
                            create: false,
                            edit: false,
                            delete: false,
                          };
                          return (
                            <tr key={row.key} className="border-b border-cyan-50 last:border-0 dark:border-teal-950/40">
                              <td className="px-2 py-1.5 text-teal-950/90 dark:text-white/90">{row.label}</td>
                              {ERP_RBAC_ACTIONS.map((a) => (
                                <td key={a} className="px-1 py-1 text-center">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-cyan-300 text-[#103D4D] dark:border-teal-700"
                                    checked={Boolean(gr[a])}
                                    disabled={!canEdit}
                                    onChange={(e) => setGrant(row.key, a, e.target.checked)}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>

            {saveErr ? <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{saveErr}</p> : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onSaveUser()}
                    className="inline-flex rounded-xl erp-brand-fill px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save this person'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onResetUser()}
                    className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/60 dark:bg-[#121f28] dark:text-slate-200"
                  >
                    Use role defaults only
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={closeEdit}
                className="inline-flex rounded-xl border border-cyan-200/80 px-4 py-2 text-sm font-bold text-[#103D4D] dark:border-teal-800/55 dark:text-teal-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
