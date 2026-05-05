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

/** Pills for changing `erp_profiles.role` in admin UI (order: member → lead → client → admin). */
export function erpWorkspaceRolePillOptionsForViewer(viewerRole) {
  const opts = [
    { id: 'team_member', label: 'Team member' },
    { id: 'team_lead', label: 'Team lead' },
    { id: 'client', label: 'Client' },
  ];
  if (viewerRole === 'admin') {
    opts.push({ id: 'admin', label: 'Admin' });
  }
  return opts;
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
  if (!role) return '';
  if (role === 'admin') return 'Super admin';
  return String(role).replace(/_/g, ' ');
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
