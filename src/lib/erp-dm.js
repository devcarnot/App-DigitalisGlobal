/**
 * Who may start / send a DM to whom (mirrors public.erp_can_dm_by_profile).
 * Workspace-wide: any two users with ERP profiles may DM each other.
 * @param {string | null | undefined} senderRole
 * @param {string | null | undefined} recipientRole
 */
export function erpCanDm(senderRole, recipientRole) {
  const s = senderRole || '';
  const r = recipientRole || '';
  return Boolean(s && r);
}
