/** Workspace admin only — sees all projects, global dashboard counts, full RLS admin scope. */
export function isErpGlobalAdmin(role) {
  return role === 'admin';
}

/**
 * Admin or team lead — invitations, statistics, user management APIs, bulk task priority UI, etc.
 * Data scope (which projects) still follows RLS: team leads only see projects they belong to.
 */
export function isErpManagerRole(role) {
  return role === 'admin' || role === 'team_lead';
}

/**
 * Members / Clients roster pages and workspace-role assignment (PATCH profile role).
 * Team members can assign roles among non-admin buckets; only global admins may grant `admin`.
 */
export function isErpWorkspaceRosterEditor(role) {
  return role === 'admin' || role === 'team_lead' || role === 'team_member';
}

/** Workspace role keys shown in UI (sidebar subtitle, directories, Users & Roles). */
export const ERP_WORKSPACE_ROLE_LABELS = {
  admin: 'Super Admin',
  team_lead: 'Team Manager',
  team_member: 'Team Member',
  hr: 'HR',
  bd: 'Business Developer',
  client: 'Client',
  client_team_member: 'Client team member',
};

/** Order for role tabs when grouping people by `erp_profiles.role` (built-ins first, then custom keys A–Z). */
export const ERP_WORKSPACE_ROLE_TAB_ORDER = [
  'admin',
  'team_lead',
  'hr',
  'bd',
  'team_member',
  'client',
  'client_team_member',
];

/** Primary client account — view projects/chat; cannot add tasks or manage roster. */
export function isErpPrimaryClientRole(role) {
  return role === 'client';
}

/** Any client-side workspace role (primary client or their project helper). */
export function isErpClientSideRole(role) {
  return role === 'client' || role === 'client_team_member';
}

/** May add/assign tasks inside a project (client team helper, not primary client). */
export function canErpClientTeamManageProjectTasks(profile) {
  return profile?.role === 'client_team_member';
}

/**
 * Who may invite `client_team_member` onto a project from the project sidebar.
 * Super admin, team manager/member, and client-side roles on the project roster.
 */
export function canInviteClientTeamMember(profileOrRole) {
  const r = typeof profileOrRole === 'string' ? profileOrRole : profileOrRole?.role;
  return (
    r === 'admin' ||
    r === 'team_lead' ||
    r === 'team_member' ||
    r === 'client' ||
    r === 'client_team_member'
  );
}

/**
 * @param {string[]} keys role keys present in the current directory
 * @returns {string[]}
 */
export function sortWorkspaceRoleKeys(keys) {
  const arr = [...new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  const s = new Set(arr);
  /** @type {string[]} */
  const head = [];
  for (const k of ERP_WORKSPACE_ROLE_TAB_ORDER) {
    if (s.has(k)) head.push(k);
  }
  const tail = arr.filter((k) => !head.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...head, ...tail];
}

/**
 * Role-directory tabs: use the full key list from workspace-role-types, plus any key still stored on users
 * (orphan roles) so nobody disappears from filtered views after a role type is removed from settings.
 *
 * @param {string[]} apiRoleIds Option `id`s from GET /api/erp/admin/workspace-role-types
 * @param {string[]} userRoleKeys `erp_profiles.role` values currently in the (filtered) roster
 */
export function mergeWorkspaceRoleTabKeys(apiRoleIds, userRoleKeys) {
  const api = [...new Set((apiRoleIds || []).map((k) => String(k || '').trim()).filter(Boolean))];
  const users = [...new Set((userRoleKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (!api.length) return sortWorkspaceRoleKeys(users);
  return sortWorkspaceRoleKeys([...new Set([...api, ...users])]);
}

/** @deprecated Use ERP_WORKSPACE_ROLE_LABELS — kept for older imports expecting RBAC naming. */
export const ERP_RBAC_ROLE_LABELS = ERP_WORKSPACE_ROLE_LABELS;

/**
 * Single place for displaying `erp_profiles.role` (built-in + any custom slug).
 * @param {string | null | undefined} role
 * @param {Record<string, string>} [customLabels] optional role_key -> label from `erp_workspace_custom_roles`
 */
export function erpWorkspaceRoleTitle(role, customLabels) {
  const k = String(role || '').trim();
  if (!k) return '';
  if (ERP_WORKSPACE_ROLE_LABELS[k]) return ERP_WORKSPACE_ROLE_LABELS[k];
  const custom = customLabels?.[k];
  if (custom) return custom;
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pills for changing `erp_profiles.role` in admin UI (order: member → lead → client → admin). */
export function erpWorkspaceRolePillOptionsForViewer(viewerRole) {
  return erpWorkspaceRoleAssignOptions(viewerRole);
}

/**
 * All workspace roles the viewer may assign (built-in + optional custom list).
 * @param {string | null | undefined} viewerRole — caller `erp_profiles.role`
 * @param {{ id: string, label: string }[]} [customRoles] from `/api/erp/admin/workspace-role-types`
 */
export function erpWorkspaceRoleAssignOptions(viewerRole, customRoles) {
  const opts = [
    { id: 'team_member', label: ERP_WORKSPACE_ROLE_LABELS.team_member },
    { id: 'team_lead', label: ERP_WORKSPACE_ROLE_LABELS.team_lead },
    { id: 'hr', label: ERP_WORKSPACE_ROLE_LABELS.hr },
    { id: 'bd', label: ERP_WORKSPACE_ROLE_LABELS.bd },
    { id: 'client', label: ERP_WORKSPACE_ROLE_LABELS.client },
  ];
  if (viewerRole === 'admin') {
    opts.push({ id: 'admin', label: ERP_WORKSPACE_ROLE_LABELS.admin });
  }
  for (const c of customRoles || []) {
    if (c?.id && c?.label && !opts.some((o) => o.id === c.id)) {
      opts.push({ id: c.id, label: c.label });
    }
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

/** @deprecated Prefer isErpManagerRole — name was ambiguous vs global admin. */
export function isErpAdminEquivalent(role) {
  return isErpManagerRole(role);
}

/**
 * Primary name in ERP shell / headers. Uses the profile's full_name when set
 * (so a super admin with a real name like "Hamza" shows as Hamza rather than
 * the generic "Admin" placeholder). Falls back to the email local-part, then
 * role-appropriate defaults.
 */
export function erpWorkspaceDisplayName(profile, fallbackEmail) {
  const n = profile?.full_name?.trim();
  if (n) return n;
  if (fallbackEmail) return fallbackEmail.split('@')[0] || (profile?.role === 'admin' ? 'Super admin' : 'Member');
  return profile?.role === 'admin' ? 'Super admin' : 'Member';
}

/** Source string for avatar initials (2 letters) in the ERP sidebar. */
export function erpWorkspaceInitialsSource(profile, fallbackEmail) {
  const n = profile?.full_name?.trim();
  if (n) return n;
  if (fallbackEmail) return fallbackEmail;
  return profile?.role === 'admin' ? 'Super admin' : '?';
}

/** Human-readable workspace role under the display name (sidebar subtitle, mobile bar). */
export function erpWorkspaceRoleLabel(role) {
  return erpWorkspaceRoleTitle(role);
}

/** Stored in erp_profiles.member_team for team_member rows. */
export const ERP_MEMBER_TEAM_KEYS = ['developer', 'graphic_designer', 'marketing'];

export function erpMemberTeamLabel(team) {
  if (team == null || team === '') return '';
  const key = String(team).trim().toLowerCase();
  if (key === 'developer') return 'Developer';
  if (key === 'graphic_designer' || key === 'graphic designer') return 'Graphic designer';
  if (key === 'marketing') return 'Marketing team';
  // Allow newly-added designations without needing a code deploy.
  return key
    .replace(/[_\s]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Project roster label: functional delegation (Developer, Marketing, …) plus project role (Team lead, Member, Client).
 * Used in project sidebar, task assignee pickers, and anywhere project membership is shown.
 *
 * @param {string} projectMemberRole - project_lead | member | client
 * @param {{ role?: string | null; member_team?: string | null; memberTeam?: string | null } | null | undefined} workspaceProfile
 */
export function erpProjectMemberDelegationLabel(projectMemberRole, workspaceProfile) {
  // Workspace admins always show "Super admin" on project rosters, regardless
  // of the project_member role they carry (they technically sit in projects
  // as `member` for RLS purposes).
  if (workspaceProfile?.role === 'admin') {
    return 'Super admin';
  }
  const projectPart =
    projectMemberRole === 'project_lead'
      ? 'Team lead'
      : projectMemberRole === 'client'
        ? 'Client'
        : 'Member';
  const delegation = erpMemberTeamLabel(workspaceProfile?.member_team ?? workspaceProfile?.memberTeam);
  if (delegation) {
    return `${delegation} · ${projectPart}`;
  }
  const ws = workspaceProfile?.role;
  if (ws === 'team_lead') {
    return `Workspace lead · ${projectPart}`;
  }
  if (ws === 'client') {
    return projectMemberRole === 'client' ? 'Client' : `Client account · ${projectPart}`;
  }
  if (ws === 'client_team_member') {
    return projectMemberRole === 'client' ? 'Client team · Client' : `Client team · ${projectPart}`;
  }
  return projectPart;
}

const ROLES_WITH_FUNCTIONAL_TEAM = ['team_member', 'team_lead'];

/**
 * Subtitle under the user name: Developer / Graphic designer / Marketing when `member_team` is set.
 * @param {{ role?: string | null; member_team?: string | null; memberTeam?: string | null } | null | undefined} profile
 */
export function erpWorkspaceSubtitle(profile) {
  if (!profile?.role) return '';
  const raw = profile.member_team ?? profile.memberTeam;
  const mt = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
  if (ROLES_WITH_FUNCTIONAL_TEAM.includes(profile.role) && mt) {
    const t = erpMemberTeamLabel(mt);
    if (t) return t;
  }
  if (profile.role === 'team_member') {
    return 'Workspace member';
  }
  return erpWorkspaceRoleLabel(profile.role);
}
