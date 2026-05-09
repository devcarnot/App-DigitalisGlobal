'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ErpMemberWorkloadSliceModal from './ErpMemberWorkloadSliceModal';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch, fetchErpWorkspaceRoleTypeOptions } from '../../lib/erp-client-api';
import {
  ERP_WORKSPACE_ROLE_LABELS,
  erpMemberTeamLabel,
  erpWorkspaceRolePillOptionsForViewer,
  erpWorkspaceRoleTitle,
  isErpGlobalAdmin,
  isErpManagerRole,
  isErpWorkspaceRosterEditor,
} from '../../lib/erp-roles';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import {
  assigneeIdsOnTask,
  isOpenWorkloadChildTask,
  openWorkloadChildTaskDueBucket,
} from '../../lib/erp-assigned-workload-tasks';
import { normalizeTaskStatus } from '../../lib/erp-task-status';
import { ErpAvatarWithOnline } from '../erp/ErpOnlineIndicator';
import ErpUserAvatar from '../erp/ErpUserAvatar';
import ErpCreatableSelect from '../erp/ErpCreatableSelect';
import { useErpSession } from '../erp/useErpSession';
import ErpAddMemberModal from './ErpAddMemberModal';
import ErpMemberActivitySection from './ErpMemberActivitySection';
import ErpFilterMultiSelect from '../erp/ErpFilterMultiSelect';
import { ERP_LIST_SEARCH_INPUT_CLASS, filterListBySearch } from '../../lib/erp-list-search';
import { ERP_DARK_SECTION_MAIN_PANEL } from '../../lib/erp-dark-surfaces';
import { erpModalPanelMaxWidthClass } from '../erp/ErpModalFormPrimitives';

const CHUNK = 80;

/** Bar fill: this many open assigned tasks ≈ full bar. */
const OPEN_TASKS_BAR_CAP = 14;
/** Heavy (red) when open assigned tasks >= this. */
const OPEN_TASKS_HEAVY_THRESHOLD = 7;

/** User must type this (case-insensitive) to enable permanent workspace removal. */
const REMOVE_CONFIRM_PHRASE = 'remove';

async function fetchInChunks(table, column, ids, select) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from(table).select(select).in(column, slice);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

function isMissingBoardColumnError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    (msg.includes('board_column') && (msg.includes('does not exist') || msg.includes('schema cache'))) || code === '42703'
  );
}

function isMissingClientNameColumnError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  return msg.includes('client_name') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

/** Normalize `erp_projects.board_column`. */
function normalizeBoardColumn(raw) {
  const v = String(raw || 'todo').toLowerCase();
  if (v === 'todo' || v === 'in_progress' || v === 'review' || v === 'completed') return v;
  return 'todo';
}

/** Each project row: id, name, deadline_date, board_column, optional client_name. */
async function fetchProjectsMetaInChunks(projectIds) {
  const out = [];
  for (let i = 0; i < projectIds.length; i += CHUNK) {
    const slice = projectIds.slice(i, i + CHUNK);

    async function fetchSlice({ withBoard, withClient }) {
      const parts = ['id', 'name', 'deadline_date'];
      if (withBoard) parts.push('board_column');
      if (withClient) parts.push('client_name');
      return supabase.from('erp_projects').select(parts.join(', ')).in('id', slice);
    }

    let withClient = true;
    let { data, error } = await fetchSlice({ withBoard: true, withClient: true });

    if (error && isMissingClientNameColumnError(error)) {
      withClient = false;
      ({ data, error } = await fetchSlice({ withBoard: true, withClient: false }));
    }

    if (error && isMissingBoardColumnError(error)) {
      ({ data, error } = await fetchSlice({ withBoard: false, withClient }));
      if (error) throw new Error(error.message);
      for (const p of data || []) {
        out.push({
          ...p,
          name: p.name?.trim() || 'Project',
          board_column: 'todo',
          client_name: withClient ? (p.client_name ?? null) : null,
        });
      }
      continue;
    }

    if (error) throw new Error(error.message);
    for (const p of data || []) {
      out.push({
        ...p,
        name: p.name?.trim() || 'Project',
        board_column: p.board_column ?? 'todo',
        client_name: withClient ? (p.client_name ?? null) : null,
      });
    }
  }
  return out;
}

/** One project row for workload detail popover (same overdue/due-soon rules as counts). */
function workloadProjectEntry(meta, pid, today, weekEnd) {
  const raw = meta || {};
  const col = normalizeBoardColumn(raw.board_column);
  const entry = {
    projectId: pid,
    name: (raw.name && String(raw.name).trim()) || 'Project',
    clientName: raw.client_name ? String(raw.client_name).trim() || null : null,
    boardColumn: col,
    deadlineDate: raw.deadline_date ?? null,
    daysOverdue: null,
    daysUntilDue: null,
  };
  if (col !== 'completed' && raw.deadline_date) {
    const d = parseDateOnlyLocal(raw.deadline_date);
    if (d) {
      const day = startOfLocalDay(d);
      const td = today.getTime();
      if (day.getTime() < td) {
        entry.daysOverdue = Math.floor((td - day.getTime()) / (24 * 60 * 60 * 1000));
      } else if (day.getTime() <= weekEnd.getTime()) {
        entry.daysUntilDue = Math.ceil((day.getTime() - td) / (24 * 60 * 60 * 1000));
      }
    }
  }
  return entry;
}

/** One task row for overdue / due-soon workload modals (assigned to member, `due_date` driven). */
function workloadAssignedTaskSliceRow(task, pid, projectMetaById, today, weekEnd) {
  const proj = projectMetaById.get(pid);
  const dlRaw = task?.due_date ?? null;
  let daysOverdue = null;
  let daysUntilDue = null;
  if (dlRaw) {
    const d = parseDateOnlyLocal(dlRaw);
    if (d) {
      const day = startOfLocalDay(d);
      const td = today.getTime();
      if (day.getTime() < td) {
        daysOverdue = Math.floor((td - day.getTime()) / (24 * 60 * 60 * 1000));
      } else if (day.getTime() <= weekEnd.getTime()) {
        daysUntilDue = Math.ceil((day.getTime() - td) / (24 * 60 * 60 * 1000));
      }
    }
  }
  return {
    kind: 'task',
    taskId: task.id,
    projectId: pid,
    name: String(task.title || '').trim() || 'Task',
    projectLabel: (proj?.name && String(proj.name).trim()) || 'Project',
    clientName: proj?.client_name ? String(proj.client_name).trim() || null : null,
    taskStatus: normalizeTaskStatus(task.status),
    deadlineDate: dlRaw,
    daysOverdue,
    daysUntilDue,
  };
}

/** Open workload: active project slots vs total project memberships (each project = one main). */
function workloadRatio(active, total) {
  if (total <= 0) return 0;
  return active / total;
}

/** Bar fill / color uses open tasks where this user is in `assignee_id` or `assignee_ids` (not project roster). */
function burdenLevelByOpenTaskCount(openTasks) {
  const n = Number(openTasks) || 0;
  if (n < OPEN_TASKS_HEAVY_THRESHOLD) {
    if (n <= 2) return 'low';
    return 'medium';
  }
  return 'high';
}

function burdenBarClass(level) {
  if (level === 'low') return 'from-emerald-400 to-teal-500';
  if (level === 'medium') return 'from-amber-400 to-orange-400';
  return 'from-rose-500 to-red-600';
}

function burdenTrackClass(level) {
  if (level === 'low') return 'bg-emerald-100/90 ring-emerald-200/80';
  if (level === 'medium') return 'bg-amber-100/90 ring-amber-200/80';
  return 'bg-rose-100/90 ring-rose-200/80';
}

function burdenLabel(level) {
  if (level === 'low') return { text: 'Light load', sub: '0–2 open tasks assigned to them' };
  if (level === 'medium') return { text: 'Moderate load', sub: '3–6 open tasks assigned to them' };
  return { text: 'Heavy load', sub: `${OPEN_TASKS_HEAVY_THRESHOLD}+ open tasks assigned to them` };
}

/** @param {string} userId */
function memberProjectsHref(userId, extra = {}) {
  const p = new URLSearchParams({ member: userId });
  if (extra.status) p.set('status', extra.status);
  if (extra.deadline) p.set('deadline', extra.deadline);
  if (extra.taskDue) p.set('taskDue', extra.taskDue);
  return `/erp/projects?${p.toString()}`;
}

/** @param {string} userId @param {'all'|'completed'|'active'|'overdue'|'dueSoon'|'assigned'} slice */
function workloadSliceProjectsHref(userId, slice) {
  if (!userId) return '/erp/projects';
  if (slice === 'all') return memberProjectsHref(userId, { status: 'all' });
  if (slice === 'completed') return memberProjectsHref(userId, { status: 'completed' });
  if (slice === 'active') return memberProjectsHref(userId, { status: 'active' });
  if (slice === 'overdue') return memberProjectsHref(userId, { status: 'active', taskDue: 'overdue' });
  if (slice === 'dueSoon') return memberProjectsHref(userId, { status: 'active', taskDue: 'due7' });
  if (slice === 'assigned') return memberProjectsHref(userId, { status: 'active' });
  return '/erp/projects';
}

/** @param {{ projectLists?: Record<string, unknown[]> }} row @param {'all'|'completed'|'active'|'overdue'|'dueSoon'|'assigned'} slice */
function workloadSliceItems(row, slice) {
  const pl = row?.projectLists;
  if (!pl || typeof pl !== 'object') return [];
  const list = pl[slice];
  return Array.isArray(list) ? list : [];
}

/** Member workload lists internal ICs (team members). Admins, team leads, and clients are omitted — clients appear under Clients. */
function includeInMemberWorkload(prof) {
  const r = prof?.role;
  if (r === 'admin' || r === 'team_lead' || r === 'client') return false;
  return true;
}

export default function ErpMemberWorkload() {
  const { profile, session } = useErpSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  /** Empty = all teams. Values are `erp_member_team_options.id`. */
  const [teamFilters, setTeamFilters] = useState([]);
  const [teamOptions, setTeamOptions] = useState([
    { id: 'developer', label: 'Developer' },
    { id: 'graphic_designer', label: 'Graphic designer' },
    { id: 'marketing', label: 'Marketing team' },
  ]);
  const [designationMenuUserId, setDesignationMenuUserId] = useState(null);
  const [savingDesignationUserId, setSavingDesignationUserId] = useState(null);
  const [designationErr, setDesignationErr] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [removeConfirmRow, setRemoveConfirmRow] = useState(null);
  const [removeConfirmTyped, setRemoveConfirmTyped] = useState('');
  const [removeConfirmErr, setRemoveConfirmErr] = useState('');
  const [savingRoleUserId, setSavingRoleUserId] = useState(null);
  const [roleErr, setRoleErr] = useState('');
  const [assignRoleOptions, setAssignRoleOptions] = useState([]);
  const [workloadSliceModal, setWorkloadSliceModal] = useState(null);
  const menuShellRef = useRef(null);

  const removeTypedOk =
    removeConfirmTyped.trim().toLowerCase() === REMOVE_CONFIRM_PHRASE.toLowerCase();

  const canEditDesignation = isErpManagerRole(profile?.role);
  /** Full workspace admin — can remove users (API also allows team leads; we restrict here to admins only). */
  const canRemoveWorkspaceMember = isErpGlobalAdmin(profile?.role);
  const canAssignWorkspaceRoles = isErpWorkspaceRosterEditor(profile?.role);

  const customWorkspaceRoleLabels = useMemo(() => {
    const m = {};
    for (const o of assignRoleOptions) {
      if (!ERP_WORKSPACE_ROLE_LABELS[o.id]) m[o.id] = o.label;
    }
    return m;
  }, [assignRoleOptions]);

  const workspaceRoleDisplayTitle = useCallback(
    (role) => erpWorkspaceRoleTitle(role, customWorkspaceRoleLabels),
    [customWorkspaceRoleLabels],
  );

  const teamFilterOptions = useMemo(
    () => teamOptions.map((t) => ({ value: t.id, label: t.label })),
    [teamOptions],
  );

  useEffect(() => {
    const valid = new Set(teamOptions.map((t) => t.id));
    setTeamFilters((prev) => prev.filter((id) => valid.has(id)));
  }, [teamOptions]);

  const displayRows = useMemo(() => {
    let list = rows;
    if (teamFilters.length > 0) {
      const want = new Set(teamFilters.map(String));
      list = list.filter((r) => r.member_team != null && want.has(String(r.member_team)));
    }
    return filterListBySearch(list, search, (r) => [
      r.name,
      workspaceRoleDisplayTitle(r.globalRole),
      r.member_team ? erpMemberTeamLabel(r.member_team) : '',
    ]);
  }, [rows, search, teamFilters, workspaceRoleDisplayTitle]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('erp_member_team_options')
      .select('id, label')
      .order('label', { ascending: true })
      .then(({ data, error: optErr }) => {
        if (cancelled) return;
        if (optErr || !Array.isArray(data) || data.length === 0) return;
        const mapped = data
          .filter((row) => row?.id && row?.label)
          .map((row) => ({ id: String(row.id), label: String(row.label) }));
        if (mapped.length) setTeamOptions(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (!designationMenuUserId) return;
    function onDocMouseDown(e) {
      const el = menuShellRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setDesignationMenuUserId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [designationMenuUserId]);

  async function onDesignationChange(userId, value) {
    const memberTeam = value === '' ? null : value;
    setDesignationErr('');
    setSavingDesignationUserId(userId);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/member-team', {
        method: 'PATCH',
        body: JSON.stringify({ userId, memberTeam }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setRows((prev) =>
        prev.map((row) =>
          row.userId === userId
            ? {
                ...row,
                member_team: memberTeam,
                avatarProfile: {
                  ...row.avatarProfile,
                  member_team: memberTeam,
                },
              }
            : row,
        ),
      );
      setDesignationMenuUserId(null);
    } catch (e) {
      setDesignationErr(e?.message || 'Could not save designation');
    } finally {
      setSavingDesignationUserId(null);
    }
  }

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
    setDesignationMenuUserId(null);
  }

  useEffect(() => {
    if (!removeConfirmRow) return;
    function onKey(e) {
      if (e.key === 'Escape') closeRemoveConfirmModal();
    }
    document.addEventListener('keydown', onKey);
    const t = window.requestAnimationFrame(() => {
      document.getElementById('remove-confirm-input')?.focus();
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
    setDesignationErr('');
    setRemovingUserId(userId);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove user');
      setRows((prev) => prev.filter((x) => x.userId !== userId));
      setDesignationMenuUserId(null);
      closeRemoveConfirmModal();
    } catch (e) {
      setRemoveConfirmErr(e?.message || 'Could not remove member');
    } finally {
      setRemovingUserId(null);
    }
  }

  /**
   * Manually overwrite a user's `erp_profiles.role`. Surfaced from the kebab
   * menu so admins can heal a workspace where a user ended up in the wrong
   * role bucket (e.g. signed up as `client` by default and should now be a
   * team member or team lead) without ever needing SQL access.
   *
   * If they leave the Members page (e.g. role flipped to `client`/`team_lead`
   * which `includeInMemberWorkload` excludes) we drop them locally so the
   * list stays in sync with the new bucket.
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
      if (includeInMemberWorkload({ role: nextRole })) {
        setRows((prev) =>
          prev.map((row) =>
            row.userId === userId
              ? {
                  ...row,
                  globalRole: nextRole,
                  avatarProfile: { ...row.avatarProfile, role: nextRole },
                }
              : row,
          ),
        );
      } else {
        setRows((prev) => prev.filter((row) => row.userId !== userId));
      }
      setDesignationMenuUserId(null);
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
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) {
        setRows([]);
        return;
      }

      const { data: profRow } = await supabase.from('erp_profiles').select('role').eq('id', uid).maybeSingle();
      const workspaceRole = profRow?.role;

      if (!isErpGlobalAdmin(workspaceRole)) {
        await erpAuthorizedFetch('/api/erp/me/sync-project-memberships', { method: 'POST' }).catch(() => {});
      }

      // Self-heal historical role mismatches (e.g. profiles still flagged as
      // 'client' after being added to a project as a team member). Runs once
      // for admins/team leads on every Members page load — idempotent on a
      // healthy workspace, and fire-and-forget so a hiccup never blocks the
      // page render.
      if (isErpManagerRole(workspaceRole)) {
        try {
          await erpAuthorizedFetch('/api/erp/admin/users/repair-role-mismatches', { method: 'POST' });
        } catch {
          /* non-fatal — repair endpoint is purely best-effort */
        }
      }

      let projectIds = [];
      if (isErpGlobalAdmin(workspaceRole)) {
        const { data: allProjs, error: apErr } = await supabase.from('erp_projects').select('id').order('name', { ascending: true }).limit(500);
        if (apErr) throw new Error(apErr.message);
        projectIds = (allProjs || []).map((p) => p.id).filter(Boolean);
      } else {
        const { data: myMems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', uid)
          .limit(500);
        if (memErr) throw new Error(memErr.message);
        projectIds = [...new Set((myMems || []).map((r) => r.project_id).filter(Boolean))];
      }

      const canSeeWholeWorkspace = isErpManagerRole(workspaceRole);

      // Fetch project members + metadata only when there are projects to look at;
      // otherwise an admin who hasn't created any projects yet would short-circuit
      // before we get a chance to list workspace team members.
      let memberRows = [];
      let projectMetaRows = [];
      if (projectIds.length > 0) {
        [memberRows, projectMetaRows] = await Promise.all([
          fetchInChunks('erp_project_members', 'project_id', projectIds, 'user_id, role, project_id'),
          fetchProjectsMetaInChunks(projectIds),
        ]);
      }

      const projectMetaById = new Map();
      for (const p of projectMetaRows || []) {
        if (p?.id) projectMetaById.set(p.id, p);
      }

      const memberProjectSet = {};
      for (const m of memberRows || []) {
        if (!m.user_id) continue;
        if (!memberProjectSet[m.user_id]) memberProjectSet[m.user_id] = new Set();
        memberProjectSet[m.user_id].add(m.project_id);
      }

      const allUserIds = new Set(Object.keys(memberProjectSet));

      // Admins and team leads should also see workspace team members who haven't
      // been added to any project yet (e.g. just invited via Add member). Without
      // this they'd be invisible until a project membership is created.
      let workspaceTeamProfiles = [];
      if (canSeeWholeWorkspace) {
        const { data: wsTm, error: wsTmErr } = await supabase
          .from('erp_profiles')
          .select('id, full_name, role, last_active_at, last_sign_out_at, avatar_path, member_team')
          .eq('role', 'team_member');
        if (wsTmErr) throw new Error(wsTmErr.message);
        workspaceTeamProfiles = wsTm || [];
        for (const p of workspaceTeamProfiles) {
          allUserIds.add(p.id);
        }
      }

      const idList = [...allUserIds];
      let profiles = [...workspaceTeamProfiles];
      const alreadyLoaded = new Set(workspaceTeamProfiles.map((p) => p.id));
      const idsToFetch = idList.filter((id) => !alreadyLoaded.has(id));
      if (idsToFetch.length > 0) {
        for (let i = 0; i < idsToFetch.length; i += CHUNK) {
          const slice = idsToFetch.slice(i, i + CHUNK);
          const { data: profs, error: pErr } = await supabase
            .from('erp_profiles')
            .select('id, full_name, role, last_active_at, last_sign_out_at, avatar_path, member_team')
            .in('id', slice);
          if (pErr) throw new Error(pErr.message);
          profiles.push(...(profs || []));
        }
      }
      const profileById = {};
      for (const p of profiles) {
        profileById[p.id] = p;
      }

      const eligibleIds = new Set(
        [...allUserIds].filter((id) => includeInMemberWorkload(profileById[id]))
      );

      if (eligibleIds.size === 0) {
        setRows([]);
        return;
      }

      const today = startOfLocalDay(new Date());
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      let allTasks = [];
      if (projectIds.length > 0) {
        for (let i = 0; i < projectIds.length; i += CHUNK) {
          const slice = projectIds.slice(i, i + CHUNK);
          const { data: trows, error: terr } = await supabase
            .from('erp_tasks')
            .select('id, title, due_date, status, project_id, assignee_id, assignee_ids, parent_task_id')
            .in('project_id', slice);
          if (terr) throw new Error(terr.message);
          allTasks.push(...(trows || []));
        }
      }

      // Single pass over open child tasks builds three per-user lists at once:
      //  - assigned: every open assigned child task (any due date)
      //  - overdue: subset whose due_date is past
      //  - dueSoon: subset due within the next 7 days
      const overdueTasksByUser = {};
      const dueSoonTasksByUser = {};
      const assignedTasksByUser = {};
      for (const id of eligibleIds) {
        overdueTasksByUser[id] = [];
        dueSoonTasksByUser[id] = [];
        assignedTasksByUser[id] = [];
      }

      for (const t of allTasks) {
        if (!isOpenWorkloadChildTask(t)) continue;
        const pid = t.project_id;
        if (!pid) continue;
        const assignees = assigneeIdsOnTask(t);
        if (assignees.size === 0) continue;
        const bucket = openWorkloadChildTaskDueBucket(t, today, weekEnd);
        for (const uid of assignees) {
          if (!eligibleIds.has(uid)) continue;
          const row = workloadAssignedTaskSliceRow(t, pid, projectMetaById, today, weekEnd);
          assignedTasksByUser[uid].push(row);
          if (bucket === 'overdue') overdueTasksByUser[uid].push(row);
          else if (bucket === 'dueSoon') dueSoonTasksByUser[uid].push(row);
        }
      }

      const openTasksByUserId = {};
      for (const id of eligibleIds) {
        openTasksByUserId[id] = assignedTasksByUser[id].length;
      }

      const byUser = {};
      for (const id of eligibleIds) {
        const pids = memberProjectSet[id] ? [...memberProjectSet[id]] : [];
        let total = 0;
        let active = 0;
        let completed = 0;

        const plAll = [];
        const plCompleted = [];
        const plActive = [];

        for (const pid of pids) {
          total += 1;
          const meta = projectMetaById.get(pid);
          const col = normalizeBoardColumn(meta?.board_column);
          const entry = workloadProjectEntry(meta || { board_column: 'todo', name: 'Project' }, pid, today, weekEnd);
          plAll.push(entry);
          if (col === 'completed') {
            completed += 1;
            plCompleted.push(entry);
          } else {
            active += 1;
            plActive.push(entry);
          }
        }

        const oList = overdueTasksByUser[id] || [];
        const sList = dueSoonTasksByUser[id] || [];
        const aList = assignedTasksByUser[id] || [];
        oList.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
        sList.sort((a, b) => {
          const ta = parseDateOnlyLocal(a.deadlineDate)?.getTime() ?? 0;
          const tb = parseDateOnlyLocal(b.deadlineDate)?.getTime() ?? 0;
          return ta - tb;
        });
        // Assigned-all order: overdue first (most overdue first), then upcoming
        // by deadline ascending, then dateless tasks alphabetically.
        aList.sort((a, b) => {
          const aOver = a.daysOverdue != null;
          const bOver = b.daysOverdue != null;
          if (aOver !== bOver) return aOver ? -1 : 1;
          if (aOver && bOver) return (b.daysOverdue || 0) - (a.daysOverdue || 0);
          const ta = parseDateOnlyLocal(a.deadlineDate)?.getTime() ?? Number.POSITIVE_INFINITY;
          const tb = parseDateOnlyLocal(b.deadlineDate)?.getTime() ?? Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;
          return String(a.name).localeCompare(String(b.name));
        });

        plAll.sort((a, b) => a.name.localeCompare(b.name));
        plCompleted.sort((a, b) => a.name.localeCompare(b.name));
        plActive.sort((a, b) => a.name.localeCompare(b.name));

        byUser[id] = {
          userId: id,
          total,
          active,
          completed,
          cancelled: 0,
          overdue: oList.length,
          dueSoon: sList.length,
          projects: pids.length,
          projectLists: {
            all: plAll,
            completed: plCompleted,
            active: plActive,
            overdue: oList,
            dueSoon: sList,
            assigned: aList,
          },
        };
      }

      const list = Object.values(byUser).map((u) => {
        const nonCancelled = u.total;
        const openTasks = openTasksByUserId[u.userId] ?? 0;
        const ratio = workloadRatio(u.active, nonCancelled);
        const level = u.total === 0 && openTasks === 0 ? 'none' : burdenLevelByOpenTaskCount(openTasks);
        const taskBarPct = openTasks > 0 ? Math.min(100, Math.round((openTasks / OPEN_TASKS_BAR_CAP) * 100)) : 0;
        const pct = nonCancelled > 0 ? Math.min(100, Math.round(ratio * 100)) : 0;
        const prof = profileById[u.userId];
        return {
          ...u,
          openTasks,
          name: prof?.full_name || 'User',
          globalRole: prof?.role || 'team_member',
          member_team: prof?.member_team ?? null,
          lastActiveAt: prof?.last_active_at ?? null,
          lastSignOutAt: prof?.last_sign_out_at ?? null,
          avatarProfile: prof
            ? {
                full_name: prof.full_name,
                role: prof.role,
                avatar_path: prof.avatar_path,
                member_team: prof.member_team ?? null,
              }
            : { full_name: 'User', role: 'team_member', avatar_path: null, member_team: null },
          nonCancelled,
          ratio,
          level,
          pct,
          taskBarPct,
        };
      });

      list.sort((a, b) => {
        if (a.nonCancelled === 0 && b.nonCancelled > 0) return 1;
        if (b.nonCancelled === 0 && a.nonCancelled > 0) return -1;
        if ((b.openTasks || 0) !== (a.openTasks || 0)) return (b.openTasks || 0) - (a.openTasks || 0);
        if (b.total !== a.total) return b.total - a.total;
        if (a.ratio !== b.ratio) return b.ratio - a.ratio;
        return b.active - a.active;
      });

      setRows(list);
    } catch (e) {
      setError(e?.message || 'Could not load member workload');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    let heavy = 0;
    let medium = 0;
    let light = 0;
    for (const r of displayRows) {
      if (r.level === 'none') continue;
      if (r.level === 'high') heavy += 1;
      else if (r.level === 'medium') medium += 1;
      else if (r.level === 'low') light += 1;
    }
    return { heavy, medium, light, total: displayRows.length };
  }, [displayRows]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-11 w-11 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 animate-spin shadow-md" />
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

  const addMemberClass =
    'inline-flex shrink-0 items-center justify-center rounded-2xl erp-brand-fill px-4 py-2.5 text-sm font-bold text-white shadow-md transition-shadow hover:shadow-lg';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          {rows.length > 0 ? (
            <>
              <label className="block w-full min-w-0 max-w-md flex-1">
                <span className="sr-only">Search members</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or role…"
                  className={ERP_LIST_SEARCH_INPUT_CLASS}
                  autoComplete="off"
                />
              </label>
              <div className="w-full min-w-0 sm:w-[min(100%,14rem)] sm:shrink-0">
                <label className="sr-only" htmlFor="erp-members-team-filter">
                  Filter by team
                </label>
                <ErpFilterMultiSelect
                  id="erp-members-team-filter"
                  placeholder="All teams"
                  options={teamFilterOptions}
                  value={teamFilters}
                  onChange={setTeamFilters}
                />
              </div>
            </>
          ) : (
            <span className="hidden min-h-[42px] flex-1 sm:block" aria-hidden />
          )}
        </div>
        {isErpManagerRole(profile?.role) ? (
          <button type="button" onClick={() => setAddMemberOpen(true)} className={addMemberClass}>
            Add member
          </button>
        ) : null}
      </div>

      <ErpAddMemberModal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} onSuccess={() => load()} />

      {designationErr ? (
        <p className="rounded-xl border border-rose-200/90 bg-rose-50/90 px-3 py-2 text-xs font-medium text-rose-800">{designationErr}</p>
      ) : null}

      {displayRows.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-rose-900/85 px-3 py-1.5 font-bold text-rose-100 shadow-md ring-1 ring-rose-400/30">
            <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]" aria-hidden />
            Heavy: {summary.heavy}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-amber-900/80 px-3 py-1.5 font-bold text-amber-100 shadow-md ring-1 ring-amber-400/35">
            <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.6)]" aria-hidden />
            Moderate: {summary.medium}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-slate-900/90 to-emerald-900/80 px-3 py-1.5 font-bold text-emerald-100 shadow-md ring-1 ring-emerald-400/30">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" aria-hidden />
            Light: {summary.light}
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cyan-300/50 bg-gradient-to-br from-slate-900/[0.04] via-white/85 to-cyan-50/40 py-12 text-center text-sm font-medium text-teal-900/70 backdrop-blur-sm shadow-inner dark:border-teal-800/55 dark:from-[#0c161e] dark:via-[#0a1418] dark:to-[#081018] dark:text-teal-200/80">
          No projects or members in scope yet.
        </p>
      ) : displayRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cyan-300/50 bg-gradient-to-br from-slate-900/[0.04] via-white/85 to-cyan-50/40 py-12 text-center text-sm font-medium text-teal-900/70 backdrop-blur-sm shadow-inner dark:border-teal-800/55 dark:from-[#0c161e] dark:via-[#0a1418] dark:to-[#081018] dark:text-teal-200/80">
          {search.trim() && teamFilters.length > 0
            ? 'No members match your search or team filter.'
            : teamFilters.length > 0
              ? 'No members match the selected teams.'
              : 'No members match your search.'}
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {displayRows.map((r) => {
            const bl =
              r.level === 'none'
                ? { text: 'No projects', sub: 'Add this person to a project to see workload.' }
                : burdenLabel(r.level);
            const track =
              r.level === 'none'
                ? 'bg-slate-100 ring-slate-200/80 dark:bg-slate-800/50 dark:ring-slate-600/55'
                : burdenTrackClass(r.level);
            const fill =
              r.level === 'none'
                ? 'from-slate-300 to-slate-400'
                : burdenBarClass(r.level);
            const taskBarPct = r.taskBarPct ?? 0;
            const hasWorkload = r.nonCancelled > 0 || (r.openTasks || 0) > 0;
            /** @param {string} extra */
            const statClass = (extra = '') =>
              `rounded-md px-0.5 font-semibold tabular-nums text-slate-800 underline-offset-2 outline-none transition hover:text-[#103D4D] hover:underline focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:text-slate-200 dark:hover:text-teal-200 ${extra}`;

            const menuOpen = designationMenuUserId === r.userId;
            const showWorkspaceRoleSection = canAssignWorkspaceRoles && r.userId !== session?.user?.id;
            const showRemoveSection = canRemoveWorkspaceMember && r.userId !== session?.user?.id;
            const workspaceRolePills =
              assignRoleOptions.length > 0
                ? assignRoleOptions
                : erpWorkspaceRolePillOptionsForViewer(profile?.role);

            return (
              <li
                key={r.userId}
                className={
                  'relative flex flex-col gap-4 overflow-visible rounded-2xl border border-cyan-200/45 bg-white/90 p-5 shadow-[0_12px_40px_-14px_rgba(16,61,77,0.18)] ring-1 ring-cyan-900/[0.06] backdrop-blur-sm transition-shadow hover:shadow-[0_16px_48px_-12px_rgba(16,61,77,0.22)] dark:border-teal-900/45 ' +
                  ERP_DARK_SECTION_MAIN_PANEL +
                  (menuOpen ? ' z-50' : '')
                }
              >
                <div className="flex items-start gap-3 pt-1">
                  <ErpAvatarWithOnline presenceUserId={r.userId} lastActiveAt={r.lastActiveAt} size="lg">
                    <ErpUserAvatar
                      profile={r.avatarProfile}
                      size="lg"
                      className="!h-12 !w-12 !text-sm shadow-lg ring-2 ring-white/40"
                      imgClassName="shadow-lg ring-2 ring-white/40"
                      alt={r.name || 'Member'}
                    />
                  </ErpAvatarWithOnline>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate dark:text-slate-100">{r.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {r.member_team ? erpMemberTeamLabel(r.member_team) : workspaceRoleDisplayTitle(r.globalRole)}
                    </p>
                  </div>
                  {canEditDesignation || showWorkspaceRoleSection || showRemoveSection ? (
                    <div
                      className="relative shrink-0"
                      ref={menuOpen ? menuShellRef : undefined}
                    >
                      <button
                        type="button"
                        className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 dark:hover:bg-teal-950/70 dark:hover:text-slate-200"
                        aria-expanded={menuOpen}
                        aria-haspopup="dialog"
                        aria-label={`Designation and role options for ${r.name}`}
                        onClick={() =>
                          setDesignationMenuUserId((cur) => {
                            const next = cur === r.userId ? null : r.userId;
                            if (next) setDesignationErr('');
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
                          {canEditDesignation ? (
                            <>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Designation
                              </p>
                              <ErpCreatableSelect
                                valueId={r.member_team || ''}
                                options={[{ id: '', label: 'Not set' }, ...teamOptions]}
                                disabled={savingDesignationUserId === r.userId || removingUserId === r.userId}
                                onChange={(next) => void onDesignationChange(r.userId, next)}
                                placeholder="Not set"
                                canCreate={Boolean(profile && ['admin', 'team_lead'].includes(profile.role))}
                                createLabel="+ Add team"
                                onCreate={async ({ id, label }) => {
                                  const { error: insErr } = await supabase.from('erp_member_team_options').insert({ id, label });
                                  if (insErr) throw new Error(insErr.message);
                                  setTeamOptions((prev) =>
                                    [...prev, { id, label }].sort((a, b) => a.label.localeCompare(b.label)),
                                  );
                                }}
                                className="w-full"
                              />
                            </>
                          ) : null}

                          {canEditDesignation && (showWorkspaceRoleSection || showRemoveSection) ? (
                            <div className="my-3 border-t border-slate-100 dark:border-teal-900/40" aria-hidden />
                          ) : null}

                          {showWorkspaceRoleSection ? (
                            <>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Workspace role
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {workspaceRolePills.map((opt) => {
                                  const isCurrent = (r.globalRole || 'team_member') === opt.id;
                                  const disabled = savingRoleUserId === r.userId || isCurrent;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => void onChangeWorkspaceRole(r.userId, opt.id)}
                                      className={
                                        'w-full min-w-0 rounded-xl px-2 py-2 text-center text-[11px] font-semibold leading-snug transition-colors disabled:cursor-not-allowed ' +
                                        (isCurrent
                                          ? 'erp-brand-fill text-white shadow-sm dark:text-white'
                                          : 'border border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:text-[#103D4D] disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:border-teal-600/60')
                                      }
                                    >
                                      <span className="break-words">{opt.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {savingRoleUserId === r.userId ? (
                                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Updating role…</p>
                              ) : null}
                              {roleErr && designationMenuUserId === r.userId ? (
                                <p className="mt-2 text-[11px] font-medium text-rose-700 dark:text-rose-300">{roleErr}</p>
                              ) : null}
                            </>
                          ) : null}

                          {showWorkspaceRoleSection && showRemoveSection ? (
                            <div className="my-3 border-t border-slate-100 dark:border-teal-900/40" aria-hidden />
                          ) : null}

                          {showRemoveSection ? (
                            <button
                              type="button"
                              disabled={removingUserId === r.userId || savingDesignationUserId === r.userId || savingRoleUserId === r.userId}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/90 bg-rose-50/90 px-3 py-2.5 text-left text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100/90 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                              onClick={() => openRemoveConfirmModal(r)}
                            >
                              {removingUserId === r.userId ? (
                                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-rose-400 border-t-rose-800" />
                              ) : null}
                              Remove member
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                    <button
                      type="button"
                      className={statClass()}
                      title="Projects this member is on"
                      onClick={() => setWorkloadSliceModal({ slice: 'all', row: r })}
                    >
                      <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">{r.total}</span> project
                      {r.total === 1 ? '' : 's'}
                    </button>
                    <button
                      type="button"
                      className={statClass()}
                      title="Completed projects"
                      onClick={() => setWorkloadSliceModal({ slice: 'completed', row: r })}
                    >
                      <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{r.completed}</span> done
                    </button>
                    <button
                      type="button"
                      className={statClass()}
                      title="Active (not completed) projects"
                      onClick={() => setWorkloadSliceModal({ slice: 'active', row: r })}
                    >
                      <span className="font-bold tabular-nums text-sky-700 dark:text-sky-300">{r.active}</span> active
                    </button>
                    {r.cancelled > 0 ? (
                      <span>
                        <span className="font-bold tabular-nums text-slate-500">{r.cancelled}</span> cancelled
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    {r.overdue > 0 ? (
                      <button
                        type="button"
                        onClick={() => setWorkloadSliceModal({ slice: 'overdue', row: r })}
                        className={`font-semibold text-red-600 underline-offset-2 hover:underline dark:text-red-400`}
                        title="Open tasks assigned to them that are past due"
                      >
                        {r.overdue} overdue
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWorkloadSliceModal({ slice: 'overdue', row: r })}
                        className="text-left text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
                        title="Open tasks past due (none)"
                      >
                        No overdue
                      </button>
                    )}
                    {r.dueSoon > 0 ? (
                      <button
                        type="button"
                        onClick={() => setWorkloadSliceModal({ slice: 'dueSoon', row: r })}
                        className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                        title="Open tasks assigned to them due within 7 days"
                      >
                        {r.dueSoon} due within 7 days
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setWorkloadSliceModal({ slice: 'assigned', row: r })}
                    disabled={!hasWorkload || (r.openTasks || 0) === 0}
                    className="mb-1.5 flex w-full items-center justify-between gap-2 rounded-md text-left transition hover:bg-slate-100/60 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-slate-800/40 -mx-1 px-1 py-0.5"
                    title={
                      hasWorkload && (r.openTasks || 0) > 0
                        ? 'View all assigned tasks'
                        : 'No active tasks assigned'
                    }
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Assigned tasks
                    </span>
                    <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
                      {hasWorkload ? (
                        <>
                          {r.openTasks || 0} open
                          <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                            ({taskBarPct}% of cap)
                          </span>
                        </>
                      ) : (
                        <span className="font-normal text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </span>
                  </button>
                  <div className={`h-3 w-full rounded-full overflow-hidden ring-1 ${track}`}>
                    {hasWorkload && (r.openTasks || 0) > 0 ? (
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${fill} transition-[width] duration-500 ease-out shadow-sm`}
                        style={{ width: `${Math.min(100, Math.max(8, taskBarPct))}%` }}
                        role="progressbar"
                        aria-valuenow={taskBarPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    ) : hasWorkload ? (
                      <div className="h-full w-[6%] rounded-full bg-gradient-to-r from-emerald-200/80 to-teal-200/80 opacity-50 dark:from-emerald-900/40 dark:to-teal-900/35" />
                    ) : (
                      <div className="h-full w-[8%] rounded-full bg-gradient-to-r from-slate-200 to-slate-300 opacity-60" />
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{bl.text}</span>
                    <span className="text-slate-400 dark:text-slate-600"> · </span>
                    {bl.sub}
                  </p>
                </div>

                <ErpMemberActivitySection
                  userId={r.userId}
                  lastActiveAt={r.lastActiveAt}
                  lastSignOutAt={r.lastSignOutAt}
                />
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
                aria-labelledby="remove-member-title"
                className={`relative z-10 w-full ${erpModalPanelMaxWidthClass} rounded-none border border-rose-200/60 bg-white p-6 shadow-[0_24px_64px_-16px_rgba(127,29,29,0.35)] ring-1 ring-rose-900/[0.08] sm:rounded-2xl`}
              >
                <h2 id="remove-member-title" className="text-lg font-bold text-slate-900">
                  Remove from workspace
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Permanently remove{' '}
                  <span className="font-semibold text-slate-900">
                    {removeConfirmRow.name?.trim() || 'this member'}
                  </span>
                  ? Their auth account will be deleted, they will be removed from all projects, and their messages and
                  tasks they created will be removed.{' '}
                  <span className="font-medium text-rose-800">This cannot be undone.</span>
                </p>
                <div className="mt-5">
                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mb-2" htmlFor="remove-confirm-input">
                    Type <span className="font-mono text-[#103D4D]">{REMOVE_CONFIRM_PHRASE}</span> to confirm
                  </label>
                  <input
                    id="remove-confirm-input"
                    type="text"
                    value={removeConfirmTyped}
                    onChange={(e) => {
                      setRemoveConfirmTyped(e.target.value);
                      setRemoveConfirmErr('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-rose-400/60 focus:outline-none focus:ring-4 focus:ring-rose-500/15"
                    placeholder={REMOVE_CONFIRM_PHRASE}
                    autoComplete="off"
                    autoCorrect="off"
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

      {typeof document !== 'undefined' && workloadSliceModal
        ? createPortal(
            <ErpMemberWorkloadSliceModal
              open
              sliceKey={workloadSliceModal.slice}
              memberName={workloadSliceModal.row?.name?.trim() || 'Member'}
              items={workloadSliceItems(workloadSliceModal.row, workloadSliceModal.slice)}
              filteredProjectsHref={workloadSliceProjectsHref(
                workloadSliceModal.row?.userId,
                workloadSliceModal.slice,
              )}
              onClose={() => setWorkloadSliceModal(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
