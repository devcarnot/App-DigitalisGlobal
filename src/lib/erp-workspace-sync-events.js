/**
 * Debounced ERP workspace sync: postgres_changes → window event so list views
 * can refetch without a full reload (cross-tab/device via Supabase Realtime).
 */
export const ERP_WORKSPACE_SYNC = 'erp-workspace-sync';

/**
 * @param {{ scopes?: string[] } | undefined} detail
 * @param {string} scope
 */
export function workspaceSyncTouchesScope(detail, scope) {
  const s = detail?.scopes;
  if (!Array.isArray(s) || s.length === 0) return true;
  return s.includes(scope);
}
