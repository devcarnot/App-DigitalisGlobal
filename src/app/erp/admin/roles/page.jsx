'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ERP_RBAC_ACTIONS,
  ERP_RBAC_DEFAULTS_BY_ROLE,
  ERP_RBAC_MODULE_META,
} from '../../../../lib/erp-rbac-modules';
import { ERP_WORKSPACE_ROLE_LABELS, isErpGlobalAdmin, sortWorkspaceRoleKeys } from '../../../../lib/erp-roles';
import { erpAuthorizedFetch } from '../../../../lib/erp-client-api';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAdminUserAccessTab from '../../../../components/erp/ErpAdminUserAccessTab';

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

export default function ErpAdminRolesPage() {
  const { erpCan, refreshRbac, profile } = useErpSession();
  const [accessTab, setAccessTab] = useState(/** @type {'roles' | 'people'} */ ('roles'));
  const [roles, setRoles] = useState(/** @type {Record<string, Record<string, { view: boolean, create: boolean, edit: boolean, delete: boolean }>> | null} */ (
    null,
  ));
  const initialTabs = useMemo(() => sortWorkspaceRoleKeys(Object.keys(ERP_RBAC_DEFAULTS_BY_ROLE)), []);
  const [roleTabKeys, setRoleTabKeys] = useState(initialTabs);
  const [activeRole, setActiveRole] = useState(initialTabs[0] || 'team_member');
  const [loadErr, setLoadErr] = useState(/** @type {string | null} */ (null));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(/** @type {string | null} */ (null));

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

  const canEdit = erpCan('settings_roles', 'edit');
  /** Super admin — can define extra workspace role keys */
  const isWorkspaceSuperAdmin = isErpGlobalAdmin(profile?.role);

  const [customRoleKey, setCustomRoleKey] = useState('');
  const [customRoleLabel, setCustomRoleLabel] = useState('');
  const [customSaving, setCustomSaving] = useState(false);
  const [customErr, setCustomErr] = useState(/** @type {string | null} */ (null));
  const [wsTypes, setWsTypes] = useState(/** @type {{ id: string, label: string, builtin?: boolean }[]} */ ([]));

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/rbac');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setLoadErr(j.error || `HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      if (j.roles && typeof j.roles === 'object') {
        const rk = sortWorkspaceRoleKeys(Object.keys(j.roles));
        setRoleTabKeys(rk);
        setRoles(j.roles);
        setActiveRole((prev) => (rk.includes(prev) ? prev : rk[0] || 'team_member'));
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadWorkspaceTypes = useCallback(async () => {
    if (!isWorkspaceSuperAdmin) return;
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/workspace-role-types');
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.options)) setWsTypes(j.options);
    } catch {
      setWsTypes([]);
    }
  }, [isWorkspaceSuperAdmin]);

  useEffect(() => {
    if (accessTab === 'roles' && isWorkspaceSuperAdmin) void loadWorkspaceTypes();
  }, [accessTab, isWorkspaceSuperAdmin, loadWorkspaceTypes]);

  const onAddCustomWorkspaceRole = useCallback(async () => {
    if (!isWorkspaceSuperAdmin || !canEdit) return;
    setCustomErr(null);
    const roleKey = customRoleKey.trim().toLowerCase().replace(/\s+/g, '_');
    const label = customRoleLabel.trim();
    if (!roleKey || !label) {
      setCustomErr('Enter a role key and a display label.');
      return;
    }
    setCustomSaving(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/workspace-role-types', {
        method: 'POST',
        body: JSON.stringify({ roleKey, label }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCustomErr(j.error || `HTTP ${res.status}`);
        return;
      }
      setCustomRoleKey('');
      setCustomRoleLabel('');
      await load();
      await loadWorkspaceTypes();
      await refreshRbac?.();
      if (j.roleKey) setActiveRole(String(j.roleKey));
    } catch (e) {
      setCustomErr(e instanceof Error ? e.message : 'Could not add role');
    } finally {
      setCustomSaving(false);
    }
  }, [
    isWorkspaceSuperAdmin,
    canEdit,
    customRoleKey,
    customRoleLabel,
    load,
    loadWorkspaceTypes,
    refreshRbac,
  ]);

  const onDeleteCustomWorkspaceRole = useCallback(
    async (roleKey) => {
      if (!isWorkspaceSuperAdmin || !canEdit || !roleKey) return;
      setCustomErr(null);
      if (!window.confirm(`Delete the custom role “${roleKey}”?`)) return;
      setCustomSaving(true);
      try {
        const res = await erpAuthorizedFetch(
          `/api/erp/admin/workspace-role-types?roleKey=${encodeURIComponent(roleKey)}`,
          { method: 'DELETE' },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCustomErr(j.error || `HTTP ${res.status}`);
          return;
        }
        await load();
        await loadWorkspaceTypes();
        await refreshRbac?.();
        setActiveRole((prev) => (prev === roleKey ? 'team_member' : prev));
      } catch (e) {
        setCustomErr(e instanceof Error ? e.message : 'Could not delete role');
      } finally {
        setCustomSaving(false);
      }
    },
    [isWorkspaceSuperAdmin, canEdit, load, loadWorkspaceTypes, refreshRbac],
  );

  const workingGrants = roles?.[activeRole];
  const setGrant = useCallback(
    (moduleKey, action, value) => {
      if (!canEdit) return;
      setRoles((prev) => {
        if (!prev) return prev;
        const roleG = prev[activeRole];
        if (!roleG) return prev;
        const cur = roleG[moduleKey] || { view: false, create: false, edit: false, delete: false };
        const nextMod = { ...cur, [action]: value };
        return {
          ...prev,
          [activeRole]: { ...roleG, [moduleKey]: nextMod },
        };
      });
    },
    [activeRole, canEdit],
  );

  const onSave = useCallback(async () => {
    if (!roles || !workingGrants || !canEdit) return;
    setSaveErr(null);
    setSaving(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/rbac', {
        method: 'PATCH',
        body: JSON.stringify({ roleKey: activeRole, grants: workingGrants }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveErr(j.error || `HTTP ${res.status}`);
        return;
      }
      if (j.grants && typeof j.grants === 'object') {
        setRoles((prev) => (prev ? { ...prev, [activeRole]: j.grants } : prev));
      }
      await refreshRbac?.();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [roles, workingGrants, activeRole, canEdit, refreshRbac]);

  if (!erpCan('settings_roles', 'view')) {
    return (
      <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-teal-900/80 space-y-4">
        <p className="text-base font-medium">You do not have access to Users &amp; Roles settings.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero
        eyebrow="Workspace access"
        title="Users & Roles"
        description="Set defaults by workspace role, then optionally fine-tune access for individual people below."
        accent="violet"
      />

      {loadErr ? (
        <p className="text-sm text-red-600 dark:text-red-400">{loadErr}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-cyan-100/60 pb-3 dark:border-teal-900/50">
        <button
          type="button"
          onClick={() => setAccessTab('roles')}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
            accessTab === 'roles'
              ? 'bg-violet-700 text-white shadow-md'
              : 'bg-white/80 text-teal-900/80 hover:bg-cyan-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15'
          }`}
        >
          By role
        </button>
        <button
          type="button"
          onClick={() => setAccessTab('people')}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
            accessTab === 'people'
              ? 'bg-violet-700 text-white shadow-md'
              : 'bg-white/80 text-teal-900/80 hover:bg-cyan-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15'
          }`}
        >
          By person
        </button>
      </div>

      {accessTab === 'people' ? (
        <ErpAdminUserAccessTab canEdit={canEdit} refreshRbac={refreshRbac} />
      ) : null}

      {accessTab === 'roles' ? (
        <>
      {isWorkspaceSuperAdmin ? (
        <section className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/80 via-white to-white p-5 shadow-sm dark:border-teal-900/50 dark:from-violet-950/30 dark:via-[#0a1520] dark:to-[#0a1520]">
          <h3 className="text-sm font-bold text-teal-950 dark:text-white">Custom workspace roles</h3>
          <p className="mt-1 text-[13px] text-teal-800/75 dark:text-teal-200/75">
            Add labels for extra buckets (e.g. <span className="font-semibold">procurement</span>) — they store in{' '}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 text-[12px] dark:bg-white/10">erp_profiles.role</code>{' '}
            and inherit base permissions like a team member until you edit them in the matrix below.
          </p>
          {customErr ? <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-300">{customErr}</p> : null}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block min-w-[8rem] flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-teal-800/70 dark:text-teal-300/70">
                Key (slug)
              </span>
              <input
                value={customRoleKey}
                onChange={(e) => setCustomRoleKey(e.target.value)}
                placeholder="e.g. procurement"
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white"
              />
            </label>
            <label className="block min-w-[10rem] flex-[1.2]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-teal-800/70 dark:text-teal-300/70">
                Display label
              </span>
              <input
                value={customRoleLabel}
                onChange={(e) => setCustomRoleLabel(e.target.value)}
                placeholder="e.g. Procurement"
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white"
              />
            </label>
            <button
              type="button"
              disabled={customSaving || !canEdit}
              onClick={() => void onAddCustomWorkspaceRole()}
              className="inline-flex rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-50"
            >
              {customSaving ? 'Saving…' : 'Add role type'}
            </button>
          </div>
          {wsTypes.filter((t) => !t.builtin).length > 0 ? (
            <ul className="mt-4 divide-y divide-cyan-100/80 dark:divide-teal-900/50">
              {wsTypes
                .filter((t) => !t.builtin)
                .map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                    <span className="font-medium text-teal-950 dark:text-white">
                      {t.label}{' '}
                      <code className="ml-1 rounded bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-normal text-teal-800 dark:bg-white/10 dark:text-teal-200">
                        {t.id}
                      </code>
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={customSaving}
                        onClick={() => void onDeleteCustomWorkspaceRole(t.id)}
                        className="text-[12px] font-bold text-rose-700 hover:underline disabled:opacity-50 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    ) : null}
                  </li>
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-cyan-100/60 pb-3 dark:border-teal-900/50">
        {roleTabKeys.map((rk) => (
          <button
            key={rk}
            type="button"
            onClick={() => setActiveRole(rk)}
            className={`rounded-full border px-4 py-2 text-xs font-bold transition sm:text-sm ${
              activeRole === rk
                ? 'border-[#103D4D]/55 bg-[#103D4D] text-white shadow-md dark:border-teal-600/50 dark:bg-teal-950/90 dark:text-teal-50'
                : 'border-slate-200/90 bg-[#1a2330] text-slate-100 hover:border-teal-700/50 hover:bg-[#223040] dark:border-teal-900/55 dark:bg-[#0f1824] dark:text-slate-100 dark:hover:bg-[#16202c]'
            }`}
          >
            {ERP_WORKSPACE_ROLE_LABELS[rk] || rk}
          </button>
        ))}
      </div>

      {workingGrants ? (
        <div className="space-y-8 overflow-x-auto">
          {GROUP_ORDER.filter((g) => modulesByGroup[g]?.length).map((g) => (
            <section key={g} className="space-y-3 min-w-[min(100%,52rem)]">
              <h2 className="text-xs font-bold uppercase tracking-wide text-teal-800/55 dark:text-teal-200/70">
                {GROUP_LABEL[g] || g}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-cyan-200/50 bg-white/90 shadow-sm dark:border-teal-900/50 dark:bg-[#0a1520]/90">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-cyan-100/70 bg-cyan-50/50 dark:border-teal-900/60 dark:bg-teal-950/40">
                      <th className="px-3 py-2.5 font-semibold text-teal-950/90 dark:text-white/95">Module</th>
                      {ERP_RBAC_ACTIONS.map((a) => (
                        <th key={a} className="px-2 py-2.5 text-center font-semibold text-teal-900/80 dark:text-white/85 w-16">
                          {ACTION_LABEL[a]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modulesByGroup[g].map((row) => {
                      const gr = workingGrants[row.key] || {
                        view: false,
                        create: false,
                        edit: false,
                        delete: false,
                      };
                      return (
                        <tr
                          key={row.key}
                          className="border-b border-cyan-100/40 last:border-0 dark:border-teal-950/60"
                        >
                          <td className="px-3 py-2 text-teal-950/90 dark:text-white/90">{row.label}</td>
                          {ERP_RBAC_ACTIONS.map((a) => (
                            <td key={a} className="px-2 py-1.5 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-cyan-300 text-[#103D4D] focus:ring-cyan-500 dark:border-teal-700 dark:bg-transparent"
                                checked={Boolean(gr[a])}
                                disabled={!canEdit}
                                onChange={(e) => setGrant(row.key, a, e.target.checked)}
                                aria-label={`${row.label} — ${ACTION_LABEL[a]}`}
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
      ) : (
        !loadErr && <p className="text-sm text-teal-800/70 dark:text-teal-200/70">Loading permissions…</p>
      )}

      {saveErr ? <p className="text-sm text-red-600 dark:text-red-400">{saveErr}</p> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving || !workingGrants}
            onClick={() => void onSave()}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${ERP_WORKSPACE_ROLE_LABELS[activeRole] || activeRole}`}
          </button>
        </div>
      ) : (
        <p className="text-sm text-teal-800/70 dark:text-teal-200/70">You can view this matrix but not edit it.</p>
      )}
        </>
      ) : null}
    </div>
  );
}
