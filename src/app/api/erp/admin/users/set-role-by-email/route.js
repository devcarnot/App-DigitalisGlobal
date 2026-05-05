import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent, isErpGlobalAdmin } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { findAuthUserIdByEmail } from '../../../../../../lib/erp-invite-server';
import { fetchResolvedWorkspaceRoleKeySet } from '../../../../../../lib/erp-workspace-role-keys-server';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Set an existing user's `erp_profiles.role` from their email — used by the admin "Add member" modal
 * so an account that was previously created as a `client` (or any other role) is immediately upgraded
 * to the role the admin selected, instead of waiting for an invite-accept that wouldn't change it.
 *
 * Safeguards:
 *  - Caller must be admin or team_lead.
 *  - Cannot demote an existing `admin` (force them through claim-admin / DB).
 *  - Cannot change own role (avoids accidental self-demotion).
 *  - Target role must be a known workspace built-in or custom role; only Super Admin
 *    may set `admin`.
 *
 * Body: { email: string, role: string } — workspace role key (team_member, team_lead,
 * hr, bd, client, …, or custom slug from Workspace role types).
 *
 * Returns 200 with `{ ok, status }` where `status` is one of:
 *   - 'updated'        — profile existed and role was changed
 *   - 'unchanged'      — profile existed and role was already correct
 *   - 'no_account'     — no auth user with that email yet (caller can ignore safely)
 *   - 'no_profile'     — auth user exists but has no erp_profiles row yet
 *   - 'admin_protected' — target is currently `admin`, refused to demote
 *   - 'self_protected' — target is the caller, refused to change own role
 */

export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json(
      { error: 'Only workspace admins or team leads can change member roles.' },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const role = String(body?.role || '')
    .trim()
    .toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const validRoleKeys = await fetchResolvedWorkspaceRoleKeySet(admin);
  if (!validRoleKeys.has(role)) {
    return NextResponse.json({ error: 'Invalid workspace role.' }, { status: 400 });
  }
  if (role === 'admin' && !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Only Super Admins may assign the Admin role.' }, { status: 403 });
  }

  const targetUserId = await findAuthUserIdByEmail(admin, email);
  if (!targetUserId) {
    return NextResponse.json({ ok: true, status: 'no_account' });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ ok: true, status: 'self_protected' });
  }

  const { data: targetProfile, error: profErr } = await admin
    .from('erp_profiles')
    .select('id, role')
    .eq('id', targetUserId)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ ok: true, status: 'no_profile' });
  }

  if (targetProfile.role === 'admin') {
    return NextResponse.json({ ok: true, status: 'admin_protected' });
  }

  if (targetProfile.role === role) {
    return NextResponse.json({ ok: true, status: 'unchanged' });
  }

  const { error: upErr } = await admin
    .from('erp_profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', targetUserId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'updated', previousRole: targetProfile.role, role });
}
