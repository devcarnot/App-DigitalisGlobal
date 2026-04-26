import { isErpGlobalAdmin } from './erp-roles';

/**
 * Whether the current user may open the project credentials vault in the UI.
 * Must match RLS on `erp_project_credentials` (admin or project_lead / member, not client).
 */
export function canAccessErpProjectCredentials(profile, projectMemberRole) {
  if (isErpGlobalAdmin(profile?.role)) return true;
  return projectMemberRole === 'project_lead' || projectMemberRole === 'member';
}
