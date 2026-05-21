'use client';

import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  erpMemberTeamLabel,
  erpWorkspaceSubtitle,
  erpWorkspaceRoleTitle,
  mergeWorkspaceRoleTabKeys,
} from '../../lib/erp-roles';
import { fetchErpWorkspaceRoleTypeOptions } from '../../lib/erp-client-api';
import ErpUserAvatar from './ErpUserAvatar';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';
import { ERP_COMPACT_FILTER_TABLIST_CLASS, erpCompactFilterTabClass } from './ErpModalFormPrimitives';

/** @typedef {{ id: string; full_name?: string | null; avatar_path?: string | null; role: string; email?: string | null }} TeamDirUser */

function displayName(u) {
  const n = u?.full_name?.trim();
  if (n) return n;
  if (u?.email) return String(u.email).split('@')[0] || (u?.role === 'admin' ? 'Super admin' : 'Member');
  if (u?.role === 'admin') return 'Super admin';
  return 'Member';
}

function matchesSearch(u, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const name = displayName(u).toLowerCase();
  const mail = String(u.email || '').toLowerCase();
  const role = erpWorkspaceRoleTitle(u.role).toLowerCase();
  const team = erpMemberTeamLabel(u.member_team).toLowerCase();
  return (
    name.includes(s) ||
    mail.includes(s) ||
    role.includes(s) ||
    team.includes(s) ||
    String(u.role || '').toLowerCase().includes(s)
  );
}

const UserRow = memo(function UserRow({ user, dense, checked, onChange, disabled, inputType = 'checkbox', nameAttr, dmTouch = false }) {
  const nameCls = dense
    ? dmTouch
      ? 'truncate text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-[11px]'
      : 'truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100'
    : 'truncate text-xs font-semibold text-slate-900 dark:text-slate-100';
  const mailCls = dense
    ? dmTouch
      ? 'truncate text-[12px] text-slate-500 dark:text-slate-400 sm:text-[10px]'
      : 'truncate text-[10px] text-slate-500 dark:text-slate-400'
    : 'truncate text-[11px] text-slate-500 dark:text-slate-400';
  const sub = erpWorkspaceSubtitle(user);
  const subCls = dense
    ? dmTouch
      ? 'truncate font-semibold text-teal-800/85 dark:text-teal-200/95 text-[11px] sm:text-[9px]'
      : 'truncate font-semibold text-teal-800/85 dark:text-teal-200/95 text-[9px]'
    : 'truncate font-semibold text-teal-800/85 dark:text-teal-200/95 text-[10px]';
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100/80 transition touch-manipulation sm:gap-2 sm:rounded-lg dark:border-teal-900/45 dark:bg-[#0f1620]/90 ${
        dmTouch ? 'min-h-[3.25rem] px-2 py-2.5 sm:min-h-0 sm:px-1.5 sm:py-1' : 'px-1.5 py-1'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'active:bg-slate-100/80 hover:border-slate-200 hover:bg-slate-50/90 dark:active:bg-teal-950/40 dark:hover:border-teal-800/55 dark:hover:bg-teal-950/35'} ${
        checked && !disabled
          ? 'border-cyan-300/90 bg-cyan-50/70 ring-1 ring-cyan-200/50 dark:border-teal-600/55 dark:bg-teal-950/45 dark:ring-teal-800/50 sm:ring-0'
          : ''
      }`}
    >
      <input
        type={inputType}
        name={nameAttr}
        className={`shrink-0 border-slate-300 accent-teal-600 text-[#103D4D] focus:ring-[#103D4D]/25 dark:border-slate-600 dark:accent-teal-400 ${
          dmTouch ? 'h-5 w-5 sm:h-3.5 sm:w-3.5' : 'h-3.5 w-3.5'
        }`}
        checked={checked}
        disabled={disabled}
        onChange={() => {
          if (!disabled) onChange?.();
        }}
      />
      <ErpAvatarWithOnline presenceUserId={user.id} lastActiveAt={user.last_active_at} size="sm">
        <ErpUserAvatar
          profile={{
            id: user.id,
            full_name: user.full_name,
            role: user.role,
            avatar_path: user.avatar_path,
            member_team: user.member_team,
          }}
          size="sm"
          alt={displayName(user)}
          className={`!ring-0 shadow-none ${dmTouch ? '!h-9 !w-9 !text-[10px] sm:!h-7 sm:!w-7 sm:!text-[9px]' : '!h-7 !w-7 !text-[9px]'}`}
          imgClassName="!ring-0 shadow-none"
        />
      </ErpAvatarWithOnline>
      <span className="min-w-0 flex-1">
        <span className={`block ${nameCls}`}>{displayName(user)}</span>
        {sub ? <span className={`block ${subCls}`}>{sub}</span> : null}
        <span className={`block ${mailCls}`}>{user.email?.trim() || '—'}</span>
      </span>
    </label>
  );
});

/**
 * Team directory grouped by workspace role (tabs) with search.
 * Modes: project (multi leads + multi members), group (multi in one list), dm (single pick), readonly.
 */
function ErpTeamDirectoryGrid({
  users = [],
  loading = false,
  errorText = null,
  dense = false,
  mode = 'project',
  search: controlledSearch,
  onSearchChange,
  showBulkActions = true,
  /** project */
  projectLeadIds = [],
  onProjectLeadToggle,
  projectMemberIds = [],
  onProjectMemberToggle,
  /** group */
  groupSelectedIds = [],
  onGroupToggle,
  /** dm */
  dmActiveId,
  onDmPick,
  /** Messages right rail (lg+): drop tiny max-heights so lists can use panel height. */
  unlimitedListHeight = false,
}) {
  const [innerSearch, setInnerSearch] = useState('');
  const search = controlledSearch !== undefined ? controlledSearch : innerSearch;
  const setSearch = onSearchChange || setInnerSearch;
  const dmRadioName = useId();

  /** Virtual tab id that shows every match across roles in one flat list. */
  const ALL_TAB = '__all__';

  const [activeRoleTab, setActiveRoleTab] = useState(ALL_TAB);
  /** From GET /api/erp/admin/workspace-role-types — drives full tab list (incl. empty counts). */
  const [workspaceRoleTabOptions, setWorkspaceRoleTabOptions] = useState(/** @type {{ id: string; label: string }[]} */ ([]));

  const leadIdSet = useMemo(() => new Set(projectLeadIds || []), [projectLeadIds]);

  const filteredUsers = useMemo(() => (users || []).filter((u) => matchesSearch(u, search)), [users, search]);
  const trimmedSearch = String(search || '').trim();

  useEffect(() => {
    let cancelled = false;
    fetchErpWorkspaceRoleTypeOptions().then(({ ok, options }) => {
      if (cancelled || !ok || !Array.isArray(options)) return;
      setWorkspaceRoleTabOptions(options.map((o) => ({ id: o.id, label: o.label })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const roleKeys = useMemo(
    () =>
      mergeWorkspaceRoleTabKeys(
        workspaceRoleTabOptions.map((o) => o.id),
        filteredUsers.map((u) => String(u.role || '')),
      ),
    [workspaceRoleTabOptions, filteredUsers],
  );

  const labelForRoleTab = useCallback(
    (rk) => workspaceRoleTabOptions.find((o) => o.id === rk)?.label || erpWorkspaceRoleTitle(rk) || rk,
    [workspaceRoleTabOptions],
  );

  const countsByRole = useMemo(() => {
    const m = {};
    for (const u of filteredUsers) {
      const k = String(u.role || '');
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [filteredUsers]);

  /** Tabs shown in the strip: drop empty roles so "Super Admin (0)" / "HR (0)"
   *  etc. never clutter the picker. The leading "All" pill always stays so the
   *  flat search results have a clear home. */
  const visibleRoleKeys = useMemo(
    () => roleKeys.filter((rk) => (countsByRole[rk] ?? 0) > 0),
    [roleKeys, countsByRole],
  );

  /** Treat the "All" pill as the resolved tab whenever the picker is searching,
   *  whenever the explicit __all__ id is selected, or whenever the previous
   *  active tab no longer has any matches under the current search. */
  const resolvedTab = useMemo(() => {
    if (trimmedSearch) return ALL_TAB;
    if (activeRoleTab === ALL_TAB) return ALL_TAB;
    if (activeRoleTab && visibleRoleKeys.includes(activeRoleTab)) return activeRoleTab;
    return ALL_TAB;
  }, [activeRoleTab, trimmedSearch, visibleRoleKeys]);

  useEffect(() => {
    // First load / role list changed: keep "All" unless the user picked a specific role.
    if (!roleKeys.length) {
      setActiveRoleTab(ALL_TAB);
      return;
    }
    setActiveRoleTab((prev) => {
      if (prev === ALL_TAB) return prev;
      if (prev && roleKeys.includes(prev)) return prev;
      return ALL_TAB;
    });
  }, [roleKeys]);

  const tabUsers = useMemo(() => {
    const sortAlpha = (a, b) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
    const sortLeadsFirst = (a, b) => {
      const la = leadIdSet.has(a.id);
      const lb = leadIdSet.has(b.id);
      if (la !== lb) return la ? -1 : 1;
      return sortAlpha(a, b);
    };
    const sorter = mode === 'project' ? sortLeadsFirst : sortAlpha;

    if (resolvedTab === ALL_TAB) {
      // Flat list across every role — search always reaches every member.
      return [...filteredUsers].sort(sorter);
    }
    return filteredUsers.filter((u) => String(u.role || '') === resolvedTab).sort(sorter);
  }, [filteredUsers, resolvedTab, leadIdSet, mode]);

  const labelSearch = dense
    ? 'text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400'
    : 'text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
  const inputCls = dense
    ? 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-[#103D4D]/35 focus:outline-none focus:ring-1 focus:ring-cyan-400/25 sm:rounded-lg sm:px-2 sm:py-1.5 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50 dark:focus:ring-teal-500/20'
    : 'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50 dark:focus:ring-teal-500/20';
  const isDm = mode === 'dm';
  const dmSearchCls = isDm && dense ? 'min-h-[44px] text-base sm:min-h-0 sm:py-1.5 sm:text-[11px]' : '';
  const thinScroll =
    '[scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgba(54,211,208,0.35)_rgba(15,23,42,0.45)]';
  const listMaxHCls = (() => {
    if (dense && isDm) {
      if (unlimitedListHeight) {
        return `max-h-[min(52svh,360px)] sm:max-h-[min(36vh,240px)] lg:max-h-none lg:flex-1 lg:min-h-0 ${thinScroll}`;
      }
      return `max-h-[min(52svh,360px)] sm:max-h-[min(36vh,240px)] ${thinScroll}`;
    }
    if (dense) return `max-h-[min(36vh,240px)] ${thinScroll}`;
    return `max-h-[min(44vh,320px)] ${thinScroll}`;
  })();

  const btnCls = dense
    ? 'rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#141f28] dark:text-slate-300 dark:hover:bg-[#1a2834]'
    : 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#141f28] dark:text-slate-300 dark:hover:bg-[#1a2834]';

  /** @param {TeamDirUser} u */
  function renderRow(u) {
    if (mode === 'readonly') {
      const sub = erpWorkspaceSubtitle(u);
      return (
        <div key={u.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
          <ErpAvatarWithOnline presenceUserId={u.id} lastActiveAt={u.last_active_at} size="sm">
            <ErpUserAvatar
              profile={{
                id: u.id,
                full_name: u.full_name,
                role: u.role,
                avatar_path: u.avatar_path,
                member_team: u.member_team,
              }}
              size="sm"
              alt={displayName(u)}
              className="!h-7 !w-7 !text-[9px] !ring-0 shadow-none"
              imgClassName="!ring-0 shadow-none"
            />
          </ErpAvatarWithOnline>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100">{displayName(u)}</span>
            {sub ? <span className="block truncate text-[10px] font-semibold capitalize text-teal-800/85">{sub}</span> : null}
            <span className="block truncate text-[10px] text-slate-500">{u.email?.trim() || '—'}</span>
          </span>
        </div>
      );
    }
    if (mode === 'dm') {
      const checked = dmActiveId === u.id;
      return (
        <UserRow
          key={u.id}
          user={u}
          dense={dense}
          dmTouch
          inputType="radio"
          nameAttr={dmRadioName}
          checked={checked}
          onChange={() => onDmPick?.(u.id)}
        />
      );
    }
    if (mode === 'group') {
      const checked = groupSelectedIds.includes(u.id);
      return <UserRow key={u.id} user={u} dense={dense} checked={checked} onChange={() => onGroupToggle?.(u.id)} />;
    }
    const isLead = leadIdSet.has(u.id);
    if (isLead) {
      return (
        <UserRow
          key={u.id}
          user={u}
          dense={dense}
          checked
          onChange={() => onProjectLeadToggle?.(u.id)}
        />
      );
    }
    const checked = projectMemberIds.includes(u.id);
    return (
      <UserRow
        key={u.id}
        user={u}
        dense={dense}
        checked={checked}
        onChange={() => onProjectMemberToggle?.(u.id)}
      />
    );
  }

  return (
    <div
      className={`min-w-0 space-y-2 ${
        unlimitedListHeight && dense && isDm ? 'flex min-h-0 flex-1 flex-col lg:min-h-0' : ''
      }`}
    >
      <div>
        <label className={`mb-0.5 block ${labelSearch}`}>Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or email"
          className={`${inputCls} ${dmSearchCls}`}
          autoComplete="off"
        />
      </div>

      {errorText ? <p className="text-[11px] font-medium text-rose-700 dark:text-rose-400">{errorText}</p> : null}

      {loading ? (
        <div className="flex justify-center rounded-xl bg-slate-100/40 py-6 dark:bg-[#0f1820]/60">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-900/70 dark:border-t-teal-400" />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Workspace role" className={ERP_COMPACT_FILTER_TABLIST_CLASS}>
            {/* "All" always sits first so a search hit is reachable in one click. */}
            <button
              key={ALL_TAB}
              type="button"
              role="tab"
              aria-selected={resolvedTab === ALL_TAB}
              className={erpCompactFilterTabClass(resolvedTab === ALL_TAB)}
              onClick={() => setActiveRoleTab(ALL_TAB)}
            >
              All <span className="tabular-nums opacity-90">({filteredUsers.length})</span>
            </button>
            {visibleRoleKeys.map((rk) => {
              const n = countsByRole[rk] ?? 0;
              const lab = labelForRoleTab(rk);
              const active = resolvedTab === rk;
              return (
                <button
                  key={rk}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={erpCompactFilterTabClass(active)}
                  onClick={() => setActiveRoleTab(rk)}
                >
                  {lab} <span className="tabular-nums opacity-90">({n})</span>
                </button>
              );
            })}
          </div>

          <div
            className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/40 dark:border-teal-900/40 dark:bg-[#0c141c]/95 sm:rounded-xl ${
              dense && isDm ? 'p-2 sm:p-1.5' : 'p-1.5'
            } ${unlimitedListHeight && dense && isDm ? 'min-h-0 flex-1 lg:min-h-0' : 'min-h-0'}`}
          >
            {showBulkActions && mode === 'group' ? (
              <div className="mb-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => {
                    tabUsers.forEach((u) => {
                      if (!groupSelectedIds.includes(u.id)) onGroupToggle?.(u.id);
                    });
                  }}
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => {
                    tabUsers.forEach((u) => {
                      if (groupSelectedIds.includes(u.id)) onGroupToggle?.(u.id);
                    });
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}

            {showBulkActions && mode === 'project' ? (
              <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1">
                  <span className={`mr-1 self-center text-[9px] font-bold uppercase tracking-wide text-[#103D4D]/80 dark:text-teal-300/80`}>
                    Project leads
                  </span>
                  <button
                    type="button"
                    className={btnCls}
                    onClick={() => {
                      tabUsers.forEach((u) => {
                        if (!leadIdSet.has(u.id)) onProjectLeadToggle?.(u.id);
                      });
                    }}
                  >
                    Select all shown
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    onClick={() => {
                      tabUsers.forEach((u) => {
                        if (leadIdSet.has(u.id)) onProjectLeadToggle?.(u.id);
                      });
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className={`mr-1 self-center text-[9px] font-bold uppercase tracking-wide text-[#103D4D]/80 dark:text-teal-300/80`}>
                    Project members
                  </span>
                  <button
                    type="button"
                    className={btnCls}
                    onClick={() => {
                      tabUsers.forEach((u) => {
                        if (!leadIdSet.has(u.id) && !projectMemberIds.includes(u.id)) onProjectMemberToggle?.(u.id);
                      });
                    }}
                  >
                    Select all shown
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    onClick={() => {
                      tabUsers.forEach((u) => {
                        if (!leadIdSet.has(u.id) && projectMemberIds.includes(u.id)) onProjectMemberToggle?.(u.id);
                      });
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}

            <div
              className={`min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 sm:space-y-0.5 sm:pr-0.5 ${listMaxHCls}`}
            >
              {!tabUsers.length ? (
                <p className="px-1 py-2 text-[10px] text-slate-500 dark:text-slate-400">
                  {trimmedSearch
                    ? `No people match "${trimmedSearch}".`
                    : resolvedTab === ALL_TAB
                      ? 'No people available.'
                      : 'No people in this role.'}
                </p>
              ) : (
                tabUsers.map(renderRow)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ErpTeamDirectoryGrid);
