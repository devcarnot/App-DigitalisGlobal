'use client';

import { memo, useId, useMemo, useState } from 'react';
import { erpMemberTeamLabel, erpWorkspaceRoleLabel, erpWorkspaceSubtitle } from '../../lib/erp-roles';
import ErpUserAvatar from './ErpUserAvatar';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';

/** @typedef {{ id: string; full_name?: string | null; avatar_path?: string | null; role: string; email?: string | null }} TeamDirUser */

function displayName(u) {
  const n = u?.full_name?.trim();
  if (n) return n;
  if (u?.email) return String(u.email).split('@')[0] || (u?.role === 'admin' ? 'Super admin' : 'Member');
  if (u?.role === 'admin') return 'Super admin';
  return 'Member';
}

function splitByRole(users, leadRoles, memberRoles) {
  const leads = [];
  const members = [];
  for (const u of users || []) {
    if (leadRoles.includes(u.role)) leads.push(u);
    else if (memberRoles.includes(u.role)) members.push(u);
    else members.push(u);
  }
  return { leads, members };
}

function matchesSearch(u, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const name = displayName(u).toLowerCase();
  const mail = String(u.email || '').toLowerCase();
  const role = erpWorkspaceRoleLabel(u.role).toLowerCase();
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
      ? 'truncate text-sm font-semibold text-slate-900 sm:text-[11px]'
      : 'truncate text-[11px] font-semibold text-slate-900'
    : 'truncate text-xs font-semibold text-slate-900';
  const mailCls = dense
    ? dmTouch
      ? 'truncate text-[12px] text-slate-500 sm:text-[10px]'
      : 'truncate text-[10px] text-slate-500'
    : 'truncate text-[11px] text-slate-500';
  const sub = erpWorkspaceSubtitle(user);
  const subCls = dense
    ? dmTouch
      ? 'truncate font-semibold text-teal-800/85 text-[11px] sm:text-[9px]'
      : 'truncate font-semibold text-teal-800/85 text-[9px]'
    : 'truncate font-semibold text-teal-800/85 text-[10px]';
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100/80 transition touch-manipulation sm:gap-2 sm:rounded-lg ${
        dmTouch ? 'min-h-[3.25rem] px-2 py-2.5 sm:min-h-0 sm:px-1.5 sm:py-1' : 'px-1.5 py-1'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'active:bg-slate-100/80 hover:border-slate-200 hover:bg-slate-50/90'} ${
        checked && !disabled ? 'border-cyan-300/90 bg-cyan-50/70 ring-1 ring-cyan-200/50 sm:ring-0' : ''
      }`}
    >
      <input
        type={inputType}
        name={nameAttr}
        className={`shrink-0 border-slate-300 text-[#103D4D] accent-[#103D4D] focus:ring-[#103D4D]/25 ${
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
 * Two-column team directory (leads / members) with search and bulk actions.
 * Modes: project (multi leads + multi members), group (multi in both), dm (single pick), readonly.
 */
function ErpTeamDirectoryGrid({
  users = [],
  loading = false,
  errorText = null,
  dense = false,
  mode = 'project',
  leadRoles = ['admin', 'team_lead'],
  memberRoles = ['team_member', 'client'],
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
  /** Messages right rail (lg+): drop tiny max-heights so lead/member lists can use panel height. */
  unlimitedListHeight = false,
}) {
  const [innerSearch, setInnerSearch] = useState('');
  const search = controlledSearch !== undefined ? controlledSearch : innerSearch;
  const setSearch = onSearchChange || setInnerSearch;
  const dmRadioName = useId();

  const leadIdSet = useMemo(() => new Set(projectLeadIds || []), [projectLeadIds]);

  const { allLeads, allMembers } = useMemo(() => {
    if (mode === 'project') {
      const baseLeads = (users || []).filter((u) => ['admin', 'team_lead'].includes(u.role));
      const selectedNotInBase = (users || []).filter(
        (u) => leadIdSet.has(u.id) && !baseLeads.some((x) => x.id === u.id),
      );
      const merged = [...selectedNotInBase, ...baseLeads];
      const seen = new Set();
      const leads = merged.filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
      const members = (users || []).filter((u) => !leadIdSet.has(u.id));
      return { allLeads: leads, allMembers: members };
    }
    const split = splitByRole(users, leadRoles, memberRoles);
    return { allLeads: split.leads, allMembers: split.members };
  }, [users, leadRoles, memberRoles, mode, leadIdSet]);

  const leadsShown = useMemo(() => allLeads.filter((u) => matchesSearch(u, search)), [allLeads, search]);
  const membersShown = useMemo(() => allMembers.filter((u) => matchesSearch(u, search)), [allMembers, search]);

  const labelSearch = dense ? 'text-[9px] font-bold uppercase tracking-wider text-slate-500' : 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
  const inputCls = dense
    ? 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-[#103D4D]/35 focus:outline-none focus:ring-1 focus:ring-cyan-400/25 sm:rounded-lg sm:px-2 sm:py-1.5'
    : 'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25';
  const colTitle = dense ? 'text-[9px] font-bold uppercase tracking-wider text-[#103D4D]/85' : 'text-[10px] font-bold uppercase tracking-wider text-[#103D4D]/85';
  const isDm = mode === 'dm';
  const stackedDm = isDm && dense && unlimitedListHeight;
  const dmSearchCls =
    isDm && dense ? 'min-h-[44px] text-base sm:min-h-0 sm:py-1.5 sm:text-[11px]' : '';
  const thinScroll = '[scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.35)_transparent]';
  const leadsListScrollCls = (() => {
    if (stackedDm) {
      return '';
    }
    if (dense && isDm) {
      if (unlimitedListHeight) {
        return `max-h-[min(44svh,300px)] sm:max-h-[min(28vh,200px)] lg:max-h-none lg:min-h-0 lg:flex-1 ${thinScroll}`;
      }
      return `max-h-[min(44svh,300px)] sm:max-h-[min(28vh,200px)] ${thinScroll}`;
    }
    if (dense) return `max-h-[min(28vh,200px)] ${thinScroll}`;
    return `max-h-[min(36vh,260px)] ${thinScroll}`;
  })();
  const membersListScrollCls = (() => {
    if (stackedDm) {
      return `min-h-0 flex-1 overflow-y-auto ${thinScroll}`;
    }
    if (dense && isDm) {
      if (unlimitedListHeight) {
        return `max-h-[min(44svh,300px)] sm:max-h-[min(28vh,200px)] lg:max-h-none lg:min-h-0 lg:flex-1 ${thinScroll}`;
      }
      return `max-h-[min(44svh,300px)] sm:max-h-[min(28vh,200px)] ${thinScroll}`;
    }
    if (dense) return `max-h-[min(28vh,200px)] ${thinScroll}`;
    return `max-h-[min(36vh,260px)] ${thinScroll}`;
  })();
  const btnCls = dense
    ? 'rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50'
    : 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50';

  return (
    <div
      className={`min-w-0 space-y-2 ${unlimitedListHeight && dense && isDm ? 'flex min-h-0 flex-1 flex-col lg:min-h-0' : ''}`}
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

      {errorText ? <p className="text-[11px] font-medium text-rose-700">{errorText}</p> : null}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : (
        <div
          className={`${stackedDm ? 'flex min-h-0 flex-1 flex-col gap-3' : 'grid min-h-0'} ${
            stackedDm ? '' : dense && isDm ? 'gap-3' : 'gap-2'
          } ${stackedDm ? '' : dense ? 'sm:grid-cols-2' : 'sm:grid-cols-2'} ${
            unlimitedListHeight && dense && isDm ? 'min-h-0 flex-1 lg:min-h-0' : ''
          }`}
        >
          <div
            className={`flex min-w-0 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/40 sm:rounded-xl ${dense && isDm ? 'p-2 sm:p-1.5' : 'p-1.5'} ${
              stackedDm ? 'shrink-0' : 'min-h-0'
            } ${
              !stackedDm && unlimitedListHeight && dense && isDm ? 'lg:min-h-0 lg:flex-1' : ''
            }`}
          >
            <p className={`mb-1 px-0.5 ${colTitle}`}>Team leads</p>
            {showBulkActions && mode === 'group' ? (
              <div className="mb-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => {
                    leadsShown.forEach((u) => {
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
                    leadsShown.forEach((u) => {
                      if (groupSelectedIds.includes(u.id)) onGroupToggle?.(u.id);
                    });
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}
            <div className={`space-y-1 pr-1 sm:space-y-0.5 sm:pr-0.5 ${stackedDm ? '' : 'min-h-0 flex-1 overflow-y-auto'} ${leadsListScrollCls}`}>
              {leadsShown.length === 0 ? (
                <p className="px-1 py-2 text-[10px] text-slate-500">No matches.</p>
              ) : (
                leadsShown.map((u) => {
                  if (mode === 'readonly') {
                    const leadSub = erpWorkspaceSubtitle(u);
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
                          <span className="block truncate text-[11px] font-semibold text-slate-900">{displayName(u)}</span>
                          {leadSub ? (
                            <span className="block truncate text-[10px] font-semibold text-teal-800/85">{leadSub}</span>
                          ) : null}
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
                    return (
                      <UserRow key={u.id} user={u} dense={dense} checked={checked} onChange={() => onGroupToggle?.(u.id)} />
                    );
                  }
                  const checked = leadIdSet.has(u.id);
                  return (
                    <UserRow
                      key={u.id}
                      user={u}
                      dense={dense}
                      checked={checked}
                      onChange={() => onProjectLeadToggle?.(u.id)}
                    />
                  );
                })
              )}
            </div>
          </div>

          <div
            className={`flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/90 bg-slate-50/40 sm:rounded-xl ${dense && isDm ? 'p-2 sm:p-1.5' : 'p-1.5'} ${
              stackedDm ? 'min-h-0 flex-1' : ''
            } ${
              !stackedDm && unlimitedListHeight && dense && isDm ? 'lg:min-h-0 lg:flex-1' : ''
            }`}
          >
            <p className={`mb-1 px-0.5 ${colTitle}`}>Team members</p>
            {showBulkActions && (mode === 'group' || mode === 'project') ? (
              <div className="mb-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => {
                    if (mode === 'group') {
                      membersShown.forEach((u) => {
                        if (!groupSelectedIds.includes(u.id)) onGroupToggle?.(u.id);
                      });
                    } else {
                      membersShown.forEach((u) => {
                        if (!leadIdSet.has(u.id) && !projectMemberIds.includes(u.id)) onProjectMemberToggle?.(u.id);
                      });
                    }
                  }}
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => {
                    if (mode === 'group') {
                      membersShown.forEach((u) => {
                        if (groupSelectedIds.includes(u.id)) onGroupToggle?.(u.id);
                      });
                    } else {
                      membersShown.forEach((u) => {
                        if (projectMemberIds.includes(u.id)) onProjectMemberToggle?.(u.id);
                      });
                    }
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}
            <div className={`min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 sm:space-y-0.5 sm:pr-0.5 ${membersListScrollCls}`}>
              {membersShown.length === 0 ? (
                <p className="px-1 py-2 text-[10px] text-slate-500">No matches.</p>
              ) : (
                membersShown.map((u) => {
                  if (mode === 'readonly') {
                    const memberLine = erpWorkspaceSubtitle(u);
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
                          <span className="block truncate text-[11px] font-semibold text-slate-900">{displayName(u)}</span>
                          {memberLine ? (
                            <span className="block truncate text-[10px] font-semibold capitalize text-teal-800/85">
                              {memberLine}
                            </span>
                          ) : null}
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
                    return (
                      <UserRow key={u.id} user={u} dense={dense} checked={checked} onChange={() => onGroupToggle?.(u.id)} />
                    );
                  }
                  const disabled = leadIdSet.has(u.id);
                  const checked = projectMemberIds.includes(u.id);
                  return (
                    <UserRow
                      key={u.id}
                      user={u}
                      dense={dense}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => !disabled && onProjectMemberToggle?.(u.id)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ErpTeamDirectoryGrid);
