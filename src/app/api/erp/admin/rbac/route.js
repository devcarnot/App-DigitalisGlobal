import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import {
  ERP_RBAC_DEFAULTS_BY_ROLE,
  erpRbacCompactDeltaAgainstDefaults,
  erpRbacMergeDefaults,
} from '../../../../../lib/erp-rbac-modules';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const BUILTIN_ROLE_KEYS = Object.keys(ERP_RBAC_DEFAULTS_BY_ROLE);

/**
 * GET — full matrix for Super Admin settings UI (merged grants per role).
 * Includes built-in roles plus any custom keys from `erp_workspace_custom_roles`.
 */
export async function GET(request) {
  const { profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const [
    { data: rows, error: permErr },
    { data: customRows, error: custErr },
  ] = await Promise.all([
    admin.from('erp_workspace_role_permissions').select('role_key, grants'),
    admin.from('erp_workspace_custom_roles').select('role_key'),
  ]);
  if (permErr) {
    return NextResponse.json({ error: permErr.message }, { status: 500 });
  }
  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }

  const byRole = Object.fromEntries((rows || []).map((r) => [r.role_key, r.grants]));
  /** @type {Set<string>} */
  const roleKeys = new Set(BUILTIN_ROLE_KEYS);
  for (const cr of customRows || []) {
    if (cr?.role_key) roleKeys.add(String(cr.role_key));
  }

  const roles = {};
  for (const rk of roleKeys) {
    roles[rk] = erpRbacMergeDefaults(rk, byRole[rk] || {});
  }

  return NextResponse.json({ ok: true, roles });
}

/**
 * PATCH body: { roleKey: string, grants: Record<string, {view,create,edit,delete}> } — replace overrides for one role.
 */
export async function PATCH(request) {
  const { profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roleKey = String(body?.roleKey || '').trim();
  const grants = body?.grants;
  if (!roleKey) {
    return NextResponse.json({ error: 'roleKey required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const builtinOk = BUILTIN_ROLE_KEYS.includes(roleKey);
  const { data: customHit } = await admin.from('erp_workspace_custom_roles').select('role_key').eq('role_key', roleKey).maybeSingle();
  if (!builtinOk && !customHit?.role_key) {
    return NextResponse.json({ error: 'Invalid roleKey' }, { status: 400 });
  }
  if (!grants || typeof grants !== 'object') {
    return NextResponse.json({ error: 'grants object required' }, { status: 400 });
  }

  const merged = erpRbacMergeDefaults(roleKey, grants);
  const delta = erpRbacCompactDeltaAgainstDefaults(roleKey, merged);

  const payload = { role_key: roleKey, grants: delta, updated_at: new Date().toISOString() };
  const { error: upErr } = await admin.from('erp_workspace_role_permissions').upsert(payload, {
    onConflict: 'role_key',
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, roleKey, grants: merged });
}
