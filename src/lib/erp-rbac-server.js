import { createSupabaseAdmin } from './supabase-admin';
import { erpRbacApplyUserGrantsPatch, erpRbacMergeDefaults } from './erp-rbac-modules';

const OVERRIDE_CHUNK = 120;

/**
 * Batch: merged grants for many role keys (one DB round-trip).
 * @param {import('@supabase/supabase-js').SupabaseClient | null} admin
 * @param {Iterable<string | null | undefined>} roleKeys
 * @returns {Promise<Map<string, import('./erp-rbac-modules').ErpGrantsMap>>}
 */
export async function fetchMergedRbacGrantsForRoleKeys(admin, roleKeys) {
  const keys = [
    ...new Set(
      [...roleKeys].map((k) => {
        const s = String(k || '').trim();
        return s || 'team_member';
      }),
    ),
  ];
  /** @type {Map<string, import('./erp-rbac-modules').ErpGrantsMap>} */
  const out = new Map();
  if (keys.length === 0) return out;
  if (!admin) {
    for (const k of keys) {
      out.set(k, erpRbacMergeDefaults(k, null));
    }
    return out;
  }
  const { data, error } = await admin
    .from('erp_workspace_role_permissions')
    .select('role_key, grants')
    .in('role_key', keys);
  if (error) {
    for (const k of keys) {
      out.set(k, erpRbacMergeDefaults(k, null));
    }
    return out;
  }
  const byDb = new Map((data || []).map((r) => [r.role_key, r.grants]));
  for (const k of keys) {
    out.set(k, erpRbacMergeDefaults(k, byDb.get(k) ?? null));
  }
  return out;
}

/**
 * Batch: per-user override grant blobs (chunked IN queries).
 * @param {import('@supabase/supabase-js').SupabaseClient | null} admin
 * @param {string[]} userIds
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
export async function fetchUserPermissionOverridesMap(admin, userIds) {
  /** @type {Map<string, Record<string, unknown>>} */
  const out = new Map();
  if (!admin || !userIds?.length) return out;
  for (let i = 0; i < userIds.length; i += OVERRIDE_CHUNK) {
    const slice = userIds.slice(i, i + OVERRIDE_CHUNK);
    const { data, error } = await admin
      .from('erp_user_permission_overrides')
      .select('user_id, grants')
      .in('user_id', slice);
    if (error) continue;
    for (const row of data || []) {
      const g = row.grants && typeof row.grants === 'object' ? row.grants : {};
      out.set(row.user_id, g);
    }
  }
  return out;
}

/**
 * Load merged grants for a workspace role (DB overrides ON TOP of code defaults).
 * @param {string | null | undefined} roleKey
 * @returns {Promise<import('./erp-rbac-modules').ErpGrantsMap>}
 */
export async function fetchMergedRbacGrantsForRole(roleKey) {
  const rk = String(roleKey || '').trim() || 'team_member';
  const admin = createSupabaseAdmin();
  if (!admin) {
    return erpRbacMergeDefaults(rk, null);
  }
  const map = await fetchMergedRbacGrantsForRoleKeys(admin, [rk]);
  return map.get(rk) || erpRbacMergeDefaults(rk, null);
}

/**
 * Role merge + optional `erp_user_permission_overrides` row for this profile.
 * @param {string | null | undefined} roleKey
 * @param {string | null | undefined} userId
 */
export async function fetchMergedRbacGrantsForUser(roleKey, userId) {
  const mergedRole = await fetchMergedRbacGrantsForRole(roleKey);
  const uid = String(userId || '').trim();
  if (!uid) return mergedRole;
  const admin = createSupabaseAdmin();
  if (!admin) return mergedRole;
  const { data, error } = await admin
    .from('erp_user_permission_overrides')
    .select('grants')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data?.grants) return mergedRole;
  return erpRbacApplyUserGrantsPatch(mergedRole, data.grants);
}
