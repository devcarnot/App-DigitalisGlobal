import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { deleteAuthUsersByIds, removeErpWorkspaceDataForUserIds } from '../../../../../../lib/erp-admin-user-cleanup';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .select('id, full_name')
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
