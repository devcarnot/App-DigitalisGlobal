/** Privilege tiers for invitation accept + profile sync — keep in sync across invite pipelines. */

const MAP = Object.freeze({
  client: 0,
  team_member: 1,
  hr: 1,
  bd: 1,
  team_lead: 2,
  admin: 3,
});

/**
 * Workspace-role privilege tier. Custom role keys default to internal member tier
 * (same as team_member); only `client` is treated as external.
 */
export function erpInviteWorkspaceRoleRank(roleKey) {
  const k = typeof roleKey === 'string' ? roleKey.trim().toLowerCase() : '';
  if (!k) return -1;
  if (Object.prototype.hasOwnProperty.call(MAP, k)) return MAP[k];
  return k === 'client' ? 0 : 1;
}
