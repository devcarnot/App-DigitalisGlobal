'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  erpMemberTeamLabel,
  erpTeamLeadManagedTeamIds,
} from '../../lib/erp-roles';
import {
  DEFAULT_TEAM_LEAD_ASSIGNMENTS,
  leadTeamsMatchAssignment,
} from '../../lib/erp-team-directory';
import ErpUserAvatar from '../erp/ErpUserAvatar';
import ErpCreatableSelect from '../erp/ErpCreatableSelect';
import TeamColumnEditModal from './TeamColumnEditModal';
import { supabase } from '../../lib/supabase';
import { ERP_DARK_SECTION_MAIN_PANEL } from '../../lib/erp-dark-surfaces';
import {
  beginErpCachedLoad,
  ensureErpCacheArray,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCacheArray,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const CACHE_KEY = 'admin:team-leads';
const DRAG_MIME = 'application/x-erp-member-id';
const BOARD_TEAMS_STORAGE_KEY = 'admin:team-leads:board-teams';
const POOL_OPEN_STORAGE_KEY = 'admin:team-leads:pool-open';

const PRIMARY_TEAM_IDS = ['developer', 'graphic_designer', 'marketing'];

const DEFAULT_TEAM_OPTIONS = [
  { id: 'developer', label: 'Developer' },
  { id: 'graphic_designer', label: 'Graphic Designer' },
  { id: 'marketing', label: 'Marketing' },
];

function slugifyTeamId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function readExtraBoardTeamIds() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(BOARD_TEAMS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeExtraBoardTeamIds(ids) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BOARD_TEAMS_STORAGE_KEY, JSON.stringify([...new Set(ids.map(String))]));
}

function memberInBoardTeam(member, boardTeamIds) {
  const tid = String(member.member_team || '').trim();
  return boardTeamIds.has(tid);
}

const TEAM_COLUMN_TONE = {
  developer: 'border-sky-200/90 bg-gradient-to-b from-sky-50/80 to-white dark:border-sky-800/45 dark:from-sky-950/25 dark:to-[#0c121a]',
  graphic_designer:
    'border-violet-200/90 bg-gradient-to-b from-violet-50/80 to-white dark:border-violet-800/45 dark:from-violet-950/25 dark:to-[#0c121a]',
  marketing:
    'border-amber-200/90 bg-gradient-to-b from-amber-50/80 to-white dark:border-amber-800/45 dark:from-amber-950/25 dark:to-[#0c121a]',
  default:
    'border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white dark:border-teal-900/45 dark:from-[#101824] dark:to-[#0c121a]',
};

function memberDisplayName(u) {
  return u.full_name?.trim() || u.email?.split('@')[0] || 'Member';
}

function columnTone(teamId) {
  return TEAM_COLUMN_TONE[teamId] || TEAM_COLUMN_TONE.default;
}

function leadsManagingTeam(teamLeads, teamId) {
  return teamLeads.filter((lead) => erpTeamLeadManagedTeamIds(lead).includes(teamId));
}

function managersForTeam(teamId, teamLeads, users) {
  const fromDb = leadsManagingTeam(teamLeads, teamId);
  if (fromDb.length > 0) return fromDb;

  for (const row of DEFAULT_TEAM_LEAD_ASSIGNMENTS) {
    if (!row.leadTeams.includes(teamId)) continue;
    const lead = users.find(
      (u) => u.role === 'team_lead' && String(u.email || '').toLowerCase() === row.email.toLowerCase(),
    );
    if (lead) return [lead];
  }
  return [];
}

function ManagerChip({ manager }) {
  const name = memberDisplayName(manager);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white/90 px-2 py-1.5 dark:border-teal-800/40 dark:bg-[#101824]/90">
      <ErpUserAvatar profile={manager} email={manager.email} size="sm" alt={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold text-slate-900 dark:text-white">{name}</p>
        <p className="truncate text-[9px] text-slate-500">{manager.email || '—'}</p>
      </div>
    </div>
  );
}

function AddTeamPanel({
  open,
  onToggle,
  teamLeadOptions,
  allMembers,
  saving,
  onSubmit,
}) {
  const [teamName, setTeamName] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');
  const [memberPick, setMemberPick] = useState(() => new Set());
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (!open) {
      setTeamName('');
      setTeamLeadId('');
      setMemberPick(new Set());
      setMemberSearch('');
    }
  }, [open]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = allMembers.slice().sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
    if (!q) return list;
    return list.filter((m) => {
      const name = memberDisplayName(m).toLowerCase();
      const email = String(m.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [allMembers, memberSearch]);

  function toggleMember(id) {
    setMemberPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      className={`shrink-0 overflow-hidden rounded-xl border border-slate-200/90 dark:border-teal-900/45 ${ERP_DARK_SECTION_MAIN_PANEL}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/50 to-teal-50/30 px-4 py-2.5 text-left dark:border-teal-900/35 dark:from-[#0c121a] dark:via-[#0c121a] dark:to-teal-950/15"
      >
        <div>
          <p className="text-[12px] font-bold text-[#103D4D] dark:text-white">Add team</p>
          <p className="text-[10px] text-slate-500">Create a team, assign a lead, and pick members for future teams.</p>
        </div>
        <span className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-[#103D4D] dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-100">
          {open ? 'Close' : '+ Add team'}
        </span>
      </button>

      {open ? (
        <form
          className="grid gap-3 p-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit({
              teamName: teamName.trim(),
              teamLeadId: teamLeadId || '',
              memberIds: [...memberPick],
            });
          }}
        >
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team name</span>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. SEO, Business Developer"
              required
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] dark:border-teal-800/45 dark:bg-[#0a1018] dark:text-slate-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team lead</span>
            <div className="mt-1">
              <ErpCreatableSelect
                valueId={teamLeadId}
                options={[{ id: '', label: 'Select team manager…' }, ...teamLeadOptions]}
                onChange={setTeamLeadId}
                placeholder="Select team manager…"
                canCreate={false}
                compact
                menuMaxHeight={176}
                className="w-full"
              />
            </div>
          </label>

          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Members</span>
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members…"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] dark:border-teal-800/45 dark:bg-[#0a1018] dark:text-slate-100"
            />
            <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-slate-200/90 bg-white/95 p-1 dark:border-teal-800/45 dark:bg-[#0a1018]">
              {filteredMembers.length === 0 ? (
                <p className="px-2 py-3 text-center text-[10px] text-slate-400">No members found.</p>
              ) : (
                filteredMembers.map((member) => {
                  const checked = memberPick.has(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50 dark:hover:bg-teal-950/20"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(member.id)}
                        className="rounded border-slate-300"
                      />
                      <ErpUserAvatar profile={member} email={member.email} size="sm" alt={memberDisplayName(member)} />
                      <span className="min-w-0 truncate text-[11px] text-slate-800 dark:text-slate-100">
                        {memberDisplayName(member)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-1 text-[9px] text-slate-500">{memberPick.size} selected</p>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !teamName.trim()}
              className="w-full rounded-lg bg-[#103D4D] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50 dark:bg-teal-700"
            >
              {saving ? 'Saving…' : 'Create team'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function readPoolOpenPreference() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(POOL_OPEN_STORAGE_KEY) !== '0';
}

function writePoolOpenPreference(open) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(POOL_OPEN_STORAGE_KEY, open ? '1' : '0');
}

function MembersPoolPanel({
  open,
  onToggle,
  search,
  onSearchChange,
  poolMembers,
  poolCount,
  allMembersCount,
  savingMemberId,
  dropTargetActive,
  boardTeamIds,
  onDragOver,
  onDragLeave,
  onDrop,
  onMemberDragStart,
  onMemberDragEnd,
}) {
  if (!open) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center py-2">
        <button
          type="button"
          onClick={onToggle}
          title="Open members pool"
          className={`flex h-full min-h-[120px] w-full flex-col items-center justify-between rounded-xl border border-slate-200/90 py-3 text-[#103D4D] shadow-sm transition hover:border-teal-300 hover:bg-white/90 dark:border-teal-900/45 dark:text-teal-100 dark:hover:border-teal-700 ${ERP_DARK_SECTION_MAIN_PANEL}`}
        >
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {poolCount}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide [writing-mode:vertical-rl] rotate-180">
            Members pool
          </span>
          <span className="text-xs" aria-hidden>
            ◀
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`flex w-[min(100%,280px)] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 dark:border-teal-900/45 ${ERP_DARK_SECTION_MAIN_PANEL}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-white to-amber-50/80 px-3 py-2.5 dark:border-teal-900/35 dark:from-[#0c121a] dark:to-amber-950/20">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-[#103D4D] dark:text-white">Members pool</p>
            <p className="text-[10px] text-slate-500">
              {search ? 'Search results' : 'Unassigned — drag into a team ←'}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            title="Close members pool"
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-teal-300 hover:text-[#103D4D] dark:border-teal-800/45 dark:bg-[#0a1018] dark:text-slate-300 dark:hover:text-teal-200"
          >
            Close
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search all members…"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] dark:border-teal-800/45 dark:bg-[#0a1018] dark:text-slate-100"
        />
      </div>
      <div
        className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 ${
          dropTargetActive ? 'bg-amber-50/50 dark:bg-amber-950/15' : ''
        }`}
      >
        {poolMembers.length === 0 ? (
          <p className="px-2 py-8 text-center text-[10px] text-slate-400">
            {search ? 'No matches.' : 'Everyone is assigned — drag from a team to move.'}
          </p>
        ) : (
          poolMembers.map((member) => {
            const assigned = String(member.member_team || '').trim();
            const inColumn = memberInBoardTeam(member, boardTeamIds);
            return (
              <div key={member.id}>
                <MemberChip
                  member={member}
                  saving={savingMemberId === member.id}
                  draggable={!inColumn || Boolean(search)}
                  onDragStart={(e) => onMemberDragStart(e, member.id)}
                  onDragEnd={onMemberDragEnd}
                />
                {search && assigned ? (
                  <p className="mt-0.5 pl-1 text-[9px] text-teal-700 dark:text-teal-300">
                    In {erpMemberTeamLabel(assigned)}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-500 dark:border-teal-900/35">
        {poolCount} in pool · {allMembersCount} total members
      </div>
    </aside>
  );
}

function MemberChip({ member, draggable = true, saving, onDragStart, onDragEnd }) {
  const name = memberDisplayName(member);
  return (
    <div
      draggable={draggable && !saving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex cursor-grab items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 shadow-sm active:cursor-grabbing dark:border-teal-800/45 dark:bg-[#101824] ${
        saving ? 'pointer-events-none opacity-50' : 'hover:border-teal-300 hover:shadow-md dark:hover:border-teal-700'
      }`}
    >
      <ErpUserAvatar profile={member} email={member.email} size="sm" alt={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-white">{name}</p>
        <p className="truncate text-[9px] text-slate-500">{member.email || '—'}</p>
      </div>
      {saving ? (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-teal-200 border-t-[#103D4D]" />
      ) : (
        <span className="shrink-0 text-[10px] text-slate-400" aria-hidden>
          ⠿
        </span>
      )}
    </div>
  );
}

function DropColumn({
  teamId,
  title,
  managers,
  members,
  savingMemberId,
  isDropTarget,
  toneClass,
  onDragOver,
  onDragLeave,
  onDrop,
  onMemberDragStart,
  onMemberDragEnd,
  onEditTeam,
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex h-full min-w-[200px] flex-1 flex-col rounded-xl border ${toneClass} ${
        isDropTarget ? 'ring-2 ring-teal-500 ring-offset-2 dark:ring-offset-[#0a1018]' : ''
      }`}
    >
      <div className="border-b border-slate-200/60 px-3 py-2.5 dark:border-teal-900/35">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#103D4D] dark:text-white">{title}</p>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-black/20 dark:text-slate-300">
              {members.length}
            </span>
            <button
              type="button"
              onClick={() => onEditTeam?.({ teamId, title, managers })}
              title="Edit team"
              aria-label="Edit team"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200/80 bg-white/90 text-[14px] font-bold leading-none text-slate-500 transition hover:border-teal-300 hover:bg-white hover:text-[#103D4D] dark:border-teal-800/45 dark:bg-[#101824] dark:text-slate-400 dark:hover:border-teal-700 dark:hover:text-teal-200"
            >
              ⋮
            </button>
          </div>
        </div>
        <div className="mt-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Team lead</p>
          {managers.length > 0 ? (
            managers.map((manager) => <ManagerChip key={manager.id} manager={manager} />)
          ) : (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">No manager assigned</p>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200/80 px-2 py-6 text-center text-[10px] text-slate-400 dark:border-teal-800/45">
            Drop members here
          </p>
        ) : (
          members.map((member) => (
            <MemberChip
              key={member.id}
              member={member}
              saving={savingMemberId === member.id}
              onDragStart={(e) => onMemberDragStart(e, member.id)}
              onDragEnd={onMemberDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function ErpTeamLeadsAdmin() {
  const [users, setUsers] = useState(() => pickErpCacheArray(CACHE_KEY, 'users', []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [savingMemberId, setSavingMemberId] = useState(null);
  const [draggingMemberId, setDraggingMemberId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [teamOptions, setTeamOptions] = useState(DEFAULT_TEAM_OPTIONS);
  const [extraBoardTeamIds, setExtraBoardTeamIds] = useState(() => readExtraBoardTeamIds());
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [savingAddTeam, setSavingAddTeam] = useState(false);
  const [poolOpen, setPoolOpen] = useState(() => readPoolOpenPreference());
  const [editTeam, setEditTeam] = useState(null);
  const [savingTeamEdit, setSavingTeamEdit] = useState(false);

  const boardTeamIds = useMemo(() => {
    const ids = [...PRIMARY_TEAM_IDS];
    for (const id of extraBoardTeamIds) {
      if (!ids.includes(id)) ids.push(id);
    }
    return new Set(ids);
  }, [extraBoardTeamIds]);

  const teamColumns = useMemo(() => {
    const byId = new Map(teamOptions.map((o) => [o.id, o]));
    const cols = [];
    for (const id of PRIMARY_TEAM_IDS) {
      const row = byId.get(id);
      cols.push(row || { id, label: erpMemberTeamLabel(id) || id });
    }
    for (const id of extraBoardTeamIds) {
      if (PRIMARY_TEAM_IDS.includes(id)) continue;
      const row = byId.get(id);
      if (row) cols.push(row);
      else cols.push({ id, label: erpMemberTeamLabel(id) || id });
    }
    return cols;
  }, [teamOptions, extraBoardTeamIds]);

  const teamLeadSelectOptions = useMemo(
    () =>
      ensureErpCacheArray(users)
        .filter((u) => u.role === 'team_lead')
        .map((u) => ({
          id: u.id,
          label: memberDisplayName(u),
          sublabel: u.email || '',
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [users],
  );

  const load = useCallback(() => {
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setUsers(ensureErpCacheArray(cached?.users));
    }, setLoading);
    setError('');
    return erpAuthorizedFetch('/api/erp/dm/directory?workspaceRoster=1')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load team');
        const nextUsers = Array.isArray(data.users) ? data.users : [];
        writeErpDataCache(CACHE_KEY, { users: nextUsers });
        setUsers(nextUsers);
      })
      .catch((e) => {
        setError(e?.message || 'Could not load team');
        if (!hasErpDataCache(CACHE_KEY)) setUsers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('erp_member_team_options')
      .select('id, label')
      .order('label', { ascending: true })
      .then(({ data, error: loadErr }) => {
        if (cancelled || loadErr || !Array.isArray(data) || data.length === 0) return;
        const mapped = data
          .filter((r) => r?.id)
          .map((r) => ({
            id: String(r.id),
            label: erpMemberTeamLabel(r.id) || String(r.label || r.id),
          }));
        if (mapped.length) setTeamOptions(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || users.length === 0) return;
    let cancelled = false;

    (async () => {
      for (const row of DEFAULT_TEAM_LEAD_ASSIGNMENTS) {
        if (cancelled) return;
        const lead = users.find(
          (u) => u.role === 'team_lead' && String(u.email || '').toLowerCase() === row.email.toLowerCase(),
        );
        if (!lead) continue;
        const current = erpTeamLeadManagedTeamIds(lead);
        if (leadTeamsMatchAssignment(current, row.leadTeams)) continue;

        try {
          const res = await erpAuthorizedFetch('/api/erp/admin/lead-teams', {
            method: 'PATCH',
            body: JSON.stringify({ userId: lead.id, leadTeams: row.leadTeams }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not save managed teams');
          if (cancelled) return;
          setUsers((prev) =>
            prev.map((u) => (u.id === lead.id ? { ...u, lead_teams: row.leadTeams } : u)),
          );
        } catch {
          /* keep UI usable; migration or manual fix can apply */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, users]);

  const teamLeads = useMemo(
    () => ensureErpCacheArray(users).filter((u) => u.role === 'team_lead'),
    [users],
  );

  const allMembers = useMemo(
    () => ensureErpCacheArray(users).filter((u) => u.role === 'team_member'),
    [users],
  );

  const poolMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inPool = (m) => !memberInBoardTeam(m, boardTeamIds);
    const base = q
      ? allMembers.filter((m) => {
          const name = memberDisplayName(m).toLowerCase();
          const email = String(m.email || '').toLowerCase();
          return name.includes(q) || email.includes(q);
        })
      : allMembers.filter(inPool);
    return base.sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
  }, [allMembers, search, boardTeamIds]);

  const poolCount = useMemo(
    () => allMembers.filter((m) => !memberInBoardTeam(m, boardTeamIds)).length,
    [allMembers, boardTeamIds],
  );

  const membersByTeam = useMemo(() => {
    const map = new Map();
    for (const opt of teamColumns) map.set(opt.id, []);
    for (const m of allMembers) {
      const tid = String(m.member_team || '').trim();
      if (tid && map.has(tid)) map.get(tid).push(m);
    }
    return map;
  }, [allMembers, teamColumns]);

  async function onLeadTeamsChange(userId, nextTeams) {
    setError('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/lead-teams', {
        method: 'PATCH',
        body: JSON.stringify({ userId, leadTeams: nextTeams.length ? nextTeams : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save managed teams');
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, lead_teams: nextTeams.length ? nextTeams : null } : u)),
      );
    } catch (e) {
      setError(e?.message || 'Could not save managed teams');
      throw e;
    }
  }

  async function handleAddTeam({ teamName, teamLeadId, memberIds }) {
    const label = teamName.trim();
    const teamId = slugifyTeamId(label);
    if (!teamId) {
      setError('Enter a valid team name.');
      return;
    }

    setError('');
    setSavingAddTeam(true);
    try {
      const exists = teamOptions.some((o) => o.id === teamId);
      if (!exists) {
        const { error: insErr } = await supabase.from('erp_member_team_options').insert({ id: teamId, label });
        if (insErr && !/duplicate|unique/i.test(insErr.message || '')) {
          throw new Error(insErr.message || 'Could not create team');
        }
        setTeamOptions((prev) => [...prev, { id: teamId, label }].sort((a, b) => a.label.localeCompare(b.label)));
      }

      if (!PRIMARY_TEAM_IDS.includes(teamId)) {
        setExtraBoardTeamIds((prev) => {
          const next = prev.includes(teamId) ? prev : [...prev, teamId];
          writeExtraBoardTeamIds(next);
          return next;
        });
      }

      if (teamLeadId) {
        const lead = users.find((u) => u.id === teamLeadId);
        if (lead?.role === 'team_lead') {
          const current = erpTeamLeadManagedTeamIds(lead);
          if (!current.includes(teamId)) {
            await onLeadTeamsChange(teamLeadId, [...current, teamId]);
          }
        }
      }

      for (const memberId of memberIds) {
        await onMemberTeamChange(memberId, teamId);
      }

      setAddPanelOpen(false);
    } catch (e) {
      setError(e?.message || 'Could not create team');
    } finally {
      setSavingAddTeam(false);
    }
  }

  async function onMemberTeamChange(userId, memberTeam) {
    setError('');
    setSavingMemberId(userId);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/member-team', {
        method: 'PATCH',
        body: JSON.stringify({ userId, memberTeam: memberTeam || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save designation');
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, member_team: memberTeam || null } : u)));
    } catch (e) {
      setError(e?.message || 'Could not save designation');
    } finally {
      setSavingMemberId(null);
    }
  }

  async function handleTeamColumnSave({ teamId, teamLabel, teamLeadId }) {
    setError('');
    setSavingTeamEdit(true);
    try {
      const label = teamLabel.trim();
      const { error: upsErr } = await supabase
        .from('erp_member_team_options')
        .upsert({ id: teamId, label }, { onConflict: 'id' });
      if (upsErr) throw new Error(upsErr.message || 'Could not save team name');

      setTeamOptions((prev) => {
        const exists = prev.some((o) => o.id === teamId);
        if (exists) return prev.map((o) => (o.id === teamId ? { ...o, label } : o));
        return [...prev, { id: teamId, label }].sort((a, b) => a.label.localeCompare(b.label));
      });

      const currentManagers = leadsManagingTeam(teamLeads, teamId);
      for (const mgr of currentManagers) {
        if (teamLeadId && mgr.id === teamLeadId) continue;
        const nextTeams = erpTeamLeadManagedTeamIds(mgr).filter((t) => t !== teamId);
        await onLeadTeamsChange(mgr.id, nextTeams);
      }

      if (teamLeadId) {
        const lead = teamLeads.find((u) => u.id === teamLeadId);
        if (lead) {
          const current = erpTeamLeadManagedTeamIds(lead);
          if (!current.includes(teamId)) {
            await onLeadTeamsChange(teamLeadId, [...current, teamId]);
          }
        }
      }

      setEditTeam(null);
    } catch (e) {
      setError(e?.message || 'Could not save team');
    } finally {
      setSavingTeamEdit(false);
    }
  }

  function onMemberDragStart(e, memberId) {
    e.dataTransfer.setData(DRAG_MIME, memberId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingMemberId(memberId);
  }

  function onMemberDragEnd() {
    setDraggingMemberId(null);
    setDropTarget(null);
  }

  function onColumnDragOver(e, targetId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(targetId);
  }

  function onColumnDragLeave() {
    setDropTarget(null);
  }

  function onColumnDrop(e, targetTeamId) {
    e.preventDefault();
    const memberId = e.dataTransfer.getData(DRAG_MIME);
    setDropTarget(null);
    setDraggingMemberId(null);
    if (!memberId) return;
    const member = allMembers.find((m) => m.id === memberId);
    if (!member) return;
    const current = String(member.member_team || '').trim();
    const next = targetTeamId === '_unassigned' ? null : targetTeamId;
    if ((current || null) === (next || null)) return;
    void onMemberTeamChange(memberId, next);
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <AddTeamPanel
        open={addPanelOpen}
        onToggle={() => setAddPanelOpen((v) => !v)}
        teamLeadOptions={teamLeadSelectOptions}
        allMembers={allMembers}
        saving={savingAddTeam}
        onSubmit={handleAddTeam}
      />

      <div className="flex min-h-0 w-full flex-1 gap-3" style={{ height: 'calc(100vh - 15rem)', minHeight: '480px' }}>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {teamColumns.map((opt) => {
            const columnMembers = (membersByTeam.get(opt.id) || []).sort((a, b) =>
              memberDisplayName(a).localeCompare(memberDisplayName(b)),
            );
            const managers = managersForTeam(opt.id, teamLeads, users);

            return (
              <DropColumn
                key={opt.id}
                teamId={opt.id}
                title={opt.label}
                managers={managers}
                members={columnMembers}
                savingMemberId={savingMemberId}
                isDropTarget={dropTarget === opt.id}
                toneClass={columnTone(opt.id)}
                onDragOver={(e) => onColumnDragOver(e, opt.id)}
                onDragLeave={onColumnDragLeave}
                onDrop={(e) => onColumnDrop(e, opt.id)}
                onMemberDragStart={onMemberDragStart}
                onMemberDragEnd={onMemberDragEnd}
                onEditTeam={setEditTeam}
              />
            );
          })}
        </div>

        <MembersPoolPanel
          open={poolOpen}
          onToggle={() => {
            setPoolOpen((prev) => {
              const next = !prev;
              writePoolOpenPreference(next);
              return next;
            });
          }}
          search={search}
          onSearchChange={setSearch}
          poolMembers={poolMembers}
          poolCount={poolCount}
          allMembersCount={allMembers.length}
          savingMemberId={savingMemberId}
          dropTargetActive={dropTarget === '_unassigned'}
          boardTeamIds={boardTeamIds}
          onDragOver={(e) => onColumnDragOver(e, '_unassigned')}
          onDragLeave={onColumnDragLeave}
          onDrop={(e) => onColumnDrop(e, '_unassigned')}
          onMemberDragStart={onMemberDragStart}
          onMemberDragEnd={onMemberDragEnd}
        />
      </div>

      <TeamColumnEditModal
        open={Boolean(editTeam)}
        teamId={editTeam?.teamId}
        teamLabel={editTeam?.title}
        currentLeadId={editTeam?.managers?.[0]?.id || ''}
        teamLeadOptions={teamLeadSelectOptions}
        saving={savingTeamEdit}
        onClose={() => !savingTeamEdit && setEditTeam(null)}
        onSave={handleTeamColumnSave}
      />

      {draggingMemberId ? (
        <p className="text-center text-[10px] font-medium text-teal-700 dark:text-teal-300">
          Drop on a team column — the member&apos;s manager will see them on My team.
        </p>
      ) : null}
    </div>
  );
}
