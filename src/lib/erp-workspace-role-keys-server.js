/**
 * Canonical built-in workspace role keys (`erp_profiles.role`, `erp_invitations.global_role`).
 * Keep aligned with `src/app/api/erp/admin/workspace-role-types/route.js` `BUILTIN`.
 */
export const ERP_BUILTIN_WORKSPACE_ROLE_KEYS = [
  'team_member',
  'team_lead',
  'client',
  'client_team_member',
  'admin',
  'hr',
  'bd',
];

/**
 * Built-ins plus `erp_workspace_custom_roles.role_key`.
 * @param {import('@supabase/supabase-js').SupabaseClient | null} admin
 */
export async function fetchResolvedWorkspaceRoleKeySet(admin) {
  const s = new Set(ERP_BUILTIN_WORKSPACE_ROLE_KEYS);
  if (admin) {
    const { data } = await admin.from('erp_workspace_custom_roles').select('role_key');
    for (const r of data || []) {
      const k = String(r?.role_key || '').trim().toLowerCase();
      if (k) s.add(k);
    }
  }
  return s;
}
