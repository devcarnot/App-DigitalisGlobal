import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import {
  erpRbacApplyUserGrantsPatch,
  erpRbacCompactUserDeltaVsRoleMerged,
  erpRbacMergeDefaults,
} from '../../../../../lib/erp-rbac-modules';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import {
  fetchMergedRbacGrantsForRole,
  fetchMergedRbacGrantsForRoleKeys,
  fetchUserPermissionOverridesMap,
} from '../../../../../lib/erp-rbac-server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET — workspace profiles with permission matrices.
 *
 * Query:
 * - `summary=1` — slim rows only (fast list UI): id, names, role, contact_email, hasOverride.
 * - `userId=<uuid>` — one full row (Configure modal); ignores summary.
 * - (default) — all users with full grants (slower; prefer summary + single userId).
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

  const url = request.nextUrl;
  const singleUserId = String(url.searchParams.get('userId') || '').trim();

  if (singleUserId) {
    if (!UUID_RE.test(singleUserId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    const { data: row, error: oneErr } = await admin
      .from('erp_profiles')
      .select('id, full_name, role, contact_email')
      .eq('id', singleUserId)
      .maybeSingle();
    if (oneErr) {
      return NextResponse.json({ error: oneErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const rk = row.role || 'team_member';
    const [roleMap, overrideMap] = await Promise.all([
      fetchMergedRbacGrantsForRoleKeys(admin, [rk]),
      fetchUserPermissionOverridesMap(admin, [row.id]),
    ]);
    const roleMerged = roleMap.get(rk) || erpRbacMergeDefaults(rk, null);
    const override = overrideMap.get(row.id) || {};
    const effective = erpRbacApplyUserGrantsPatch(roleMerged, override);
    return NextResponse.json({
      ok: true,
      user: {
        id: row.id,
        full_name: row.full_name,
        role: row.role,
        contact_email: row.contact_email,
        roleMergedGrants: roleMerged,
        effectiveGrants: effective,
        overrideGrants: override,
      },
    });
  }

  const summary = url.searchParams.get('summary') === '1';

  const { data: rows, error: qErr } = await admin
    .from('erp_profiles')
    .select('id, full_name, role, contact_email')
    .order('full_name', { ascending: true })
    .limit(800);
  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const list = rows || [];
  const userIds = list.map((r) => r.id);
  const uniqueRoles = [...new Set(list.map((r) => r.role || 'team_member'))];

  const [roleMap, overrideMap] = await Promise.all([
    fetchMergedRbacGrantsForRoleKeys(admin, uniqueRoles),
    fetchUserPermissionOverridesMap(admin, userIds),
  ]);

  const users = [];
  for (const r of list) {
    const rk = r.role || 'team_member';
    const roleMerged = roleMap.get(rk) || erpRbacMergeDefaults(rk, null);
    const overrideRaw = overrideMap.get(r.id);
    const override =
      overrideRaw && typeof overrideRaw === 'object' ? /** @type {Record<string, unknown>} */ (overrideRaw) : {};

    if (summary) {
      users.push({
        id: r.id,
        full_name: r.full_name,
        role: r.role,
        contact_email: r.contact_email,
        hasOverride: Object.keys(override).length > 0,
      });
    } else {
      const effective = erpRbacApplyUserGrantsPatch(roleMerged, override);
      users.push({
        id: r.id,
        full_name: r.full_name,
        role: r.role,
        contact_email: r.contact_email,
        roleMergedGrants: roleMerged,
        effectiveGrants: effective,
        overrideGrants: override,
      });
    }
  }

  return NextResponse.json({ ok: true, users });
}

/**
 * PATCH body: { userId: string, grants: Record<module, {view,create,edit,delete}> } full desired matrix for that user.
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

  const userId = String(body?.userId || '').trim();
  const grantsIn = body?.grants;
  if (!userId || !grantsIn || typeof grantsIn !== 'object') {
    return NextResponse.json({ error: 'userId and grants required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: target, error: tErr } = await admin.from('erp_profiles').select('id, role').eq('id', userId).maybeSingle();
  if (tErr || !target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const rk = target.role || 'team_member';
  const roleMerged = await fetchMergedRbacGrantsForRole(rk);
  const desiredFull = erpRbacMergeDefaults(rk, grantsIn);
  const delta = erpRbacCompactUserDeltaVsRoleMerged(roleMerged, desiredFull);

  if (Object.keys(delta).length === 0) {
    await admin.from('erp_user_permission_overrides').delete().eq('user_id', userId);
  } else {
    const { error: upErr } = await admin.from('erp_user_permission_overrides').upsert(
      {
        user_id: userId,
        grants: delta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: ovAfter } = await admin.from('erp_user_permission_overrides').select('grants').eq('user_id', userId).maybeSingle();
  const overrideAfter = ovAfter?.grants && typeof ovAfter.grants === 'object' ? ovAfter.grants : {};
  const effective = erpRbacApplyUserGrantsPatch(roleMerged, overrideAfter);
  return NextResponse.json({ ok: true, userId, effectiveGrants: effective, overrideGrants: overrideAfter });
}
