/**
 * Supabase project rows use UUID primary keys. Rejects malformed ids early (UI + API).
 */
export function isValidErpProjectId(id) {
  if (typeof id !== 'string' || id.length > 64) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
