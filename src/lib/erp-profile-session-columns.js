/**
 * Profile fields needed across the ERP client (session context). Avoids `select('*')` on every load/refresh.
 * If you add a new `profile?.field` in the app, add the column here.
 */

/** Columns always present before optional migrations. */
export const ERP_PROFILE_SESSION_COLUMNS_BASE =
  'id,role,full_name,avatar_path,phone,contact_email,member_team,last_active_at,notify_sound,notify_push_dm,notify_push_project_mention';

/** Full select including optional columns from newer migrations. */
export const ERP_PROFILE_SESSION_COLUMNS = `${ERP_PROFILE_SESSION_COLUMNS_BASE},lead_teams`;

/** Try newest shape first; fall back when a migration has not been applied yet. */
export const ERP_PROFILE_SESSION_SELECT_VARIANTS = [
  ERP_PROFILE_SESSION_COLUMNS,
  ERP_PROFILE_SESSION_COLUMNS_BASE,
];

export const ERP_PROFILE_AUTH_COLUMNS_BASE =
  'id,role,full_name,avatar_path,contact_email,member_team,last_active_at,created_at';

export const ERP_PROFILE_AUTH_COLUMNS = `${ERP_PROFILE_AUTH_COLUMNS_BASE},lead_teams`;

export const ERP_PROFILE_AUTH_SELECT_VARIANTS = [
  ERP_PROFILE_AUTH_COLUMNS,
  ERP_PROFILE_AUTH_COLUMNS_BASE,
];

/** For shallow equality checks (avoids JSON.stringify on every profile refresh). */
export const ERP_PROFILE_SESSION_COLUMN_KEYS = ERP_PROFILE_SESSION_COLUMNS.split(',').map((s) => s.trim());

export function isErpMissingProfileColumnError(error, columnName = 'lead_teams') {
  const msg = String(error?.message || error || '').toLowerCase();
  const col = String(columnName || '').toLowerCase();
  return msg.includes('does not exist') && msg.includes(col);
}

/**
 * Load one erp_profiles row, falling back when optional columns are not migrated yet.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string[]} [variants]
 */
export async function selectErpProfileRow(supabase, userId, variants = ERP_PROFILE_SESSION_SELECT_VARIANTS) {
  if (!supabase?.from || !userId) return null;
  let lastError = null;
  for (const cols of variants) {
    const { data, error } = await supabase.from('erp_profiles').select(cols).eq('id', userId).maybeSingle();
    if (!error) return data || null;
    lastError = error;
    if (isErpMissingProfileColumnError(error)) continue;
    break;
  }
  if (lastError && !isErpMissingProfileColumnError(lastError)) {
    throw lastError;
  }
  return null;
}
