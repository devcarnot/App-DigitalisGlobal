import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { deleteAuthUsersByIds, removeErpWorkspaceDataForUserIds } from '../../../../../../lib/erp-admin-user-cleanup';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set(['team_member', 'team_lead', 'client']);

/**
 * PATCH /api/erp/admin/users/:userId/role
 *
 * Manually overwrite an ERP profile's `role` from the workspace UI. Used by the
 * Members and Clients page kebab → "Change role" so admins/team leads can fix
 * any user whose `erp_profiles.role` ended up wrong (e.g. a Postgres trigger
 * created them as a `client` by default).
 *
 * Body: { role: 'team_member' | 'team_lead' | 'client' }
 *
 * Safeguards:
 *   - Caller must be admin or team lead.
 *   - Cannot demote an existing `admin` (must go through claim-admin / DB).
 *   - Cannot change own role (avoids accidental self-demotion).
 */
export async function PATCH(request, context) {
  const { userId } = await context.params;
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Only workspace admins or team leads can change roles.' }, { status: 403 });
  }
  if (user.id === userId) {
    return NextResponse.json({ error: 'You cannot change your own role from here.' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const role = String(body?.role || '').trim();
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: 'Role must be team_member, team_lead, or client.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const { data: target, error: targetErr } = await admin
    .from('erp_profiles')
    .select('id, role, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'No workspace profile found for that user.' }, { status: 404 });
  }
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Cannot change an admin from here. Use the database / claim-admin tool.' }, { status: 400 });
  }
  if (target.role === role) {
    return NextResponse.json({ ok: true, status: 'unchanged', role });
  }

  const { error: upErr } = await admin
    .from('erp_profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'updated', previousRole: target.role, role });
}

export async function DELETE(request, context) {
  const { userId } = await context.params;
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Only workspace admins or team leads can remove users.' }, { status: 403 });
  }
  if (user.id === userId) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const { data: targetProfile, error: profErr } = await admin
    .from('erp_profiles')
    .select('id, full_name, role, avatar_path')
    .eq('id', userId)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ error: 'User is not in the workspace.' }, { status: 404 });
  }

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const email = authData?.user?.email?.trim().toLowerCase();

  // Snapshot the deleted account into erp_trashed_users so the Trash page can
  // show who was removed (and let admins re-invite them with one click). We
  // intentionally do not block the delete on this insert — the audit row is
  // best-effort, the actual cleanup below is the source of truth.
  const { error: trashInsErr } = await admin.from('erp_trashed_users').insert({
    original_user_id: userId,
    email: email || null,
    full_name: targetProfile.full_name || null,
    role: targetProfile.role || null,
    avatar_path: targetProfile.avatar_path || null,
    deleted_by: user.id,
  });
  if (trashInsErr) {
    const msg = String(trashInsErr.message || '').toLowerCase();
    if (!msg.includes('does not exist') && !msg.includes('relation') && trashInsErr.code !== '42P01') {
      console.warn('erp_trashed_users insert', trashInsErr.message);
    }
  }

  const { error: invByErr } = await admin.from('erp_invitations').delete().eq('invited_by', userId);
  if (invByErr) {
    return NextResponse.json({ error: `Could not clear invitations: ${invByErr.message}` }, { status: 500 });
  }

  if (email) {
    const { error: invEmailErr } = await admin.from('erp_invitations').delete().eq('email', email);
    if (invEmailErr) {
      return NextResponse.json({ error: `Could not clear invitations: ${invEmailErr.message}` }, { status: 500 });
    }
  }

  const displayName = targetProfile?.full_name && String(targetProfile.full_name).trim();

  const { error: cleanErr } = await removeErpWorkspaceDataForUserIds(admin, [userId]);
  if (cleanErr) {
    return NextResponse.json({ error: cleanErr }, { status: 500 });
  }

  const { deleted, failures } = await deleteAuthUsersByIds(admin, [userId]);
  if (failures.length > 0) {
    return NextResponse.json(
      { ok: false, error: failures[0]?.error || 'Delete failed', deleted },
      { status: 500 },
    );
  }

  const removedLabel = displayName || email || 'A user';
  const { error: actInsErr } = await admin.from('erp_activity_log').insert({
    project_id: null,
    user_id: user.id,
    action: 'user_removed',
    meta: {
      removed_user_id: userId,
      email: email || null,
      display_name: displayName || null,
    },
  });
  if (actInsErr) {
    console.warn('erp_activity_log user_removed', actInsErr.message);
  }

  const { data: mgrs, error: mgrErr } = await admin.from('erp_profiles').select('id').in('role', ['admin', 'team_lead']);
  if (!mgrErr && mgrs?.length) {
    const notifRows = mgrs.map((m) => ({
      user_id: m.id,
      title: 'User removed from workspace',
      body: `${removedLabel} was removed.`,
      read: false,
      link: '/erp/admin/invites',
    }));
    const { error: nErr } = await admin.from('erp_notifications').insert(notifRows);
    if (nErr) {
      console.warn('erp_notifications user_removed', nErr.message);
    }
  }

  return NextResponse.json({ ok: true, deleted });
}
