import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { deleteAuthUsersByIds, removeErpWorkspaceDataForUserIds } from '../../../../../lib/erp-admin-user-cleanup';

export const runtime = 'nodejs';

const CONFIRM_PHRASE = 'DELETE ALL ERP USERS';

/**
 * Removes every ERP-linked auth user except the caller (must be erp_profiles.role = admin).
 * Clears invitations, tasks/messages tied to those users, then deletes auth users (cascades profiles).
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Only workspace admins can purge users.' }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Confirmation mismatch. Send JSON { "confirm": "${CONFIRM_PHRASE}" } exactly.` },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const keeperId = user.id;

  const { data: profiles, error: listErr } = await admin.from('erp_profiles').select('id');
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const targets = (profiles || []).map((p) => p.id).filter((id) => id && id !== keeperId);
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, deletedAuthUsers: 0, message: 'No other ERP users to remove.' });
  }

  const { error: purgeActErr } = await admin.from('erp_activity_log').insert({
    project_id: null,
    user_id: keeperId,
    action: 'users_purged',
    meta: { count: targets.length, attempted: targets.length },
  });
  if (purgeActErr) {
    console.warn('erp_activity_log users_purged', purgeActErr.message);
  }

  const { error: invDelErr } = await admin.from('erp_invitations').delete().not('id', 'is', null);
  if (invDelErr) {
    return NextResponse.json({ error: `Could not clear invitations: ${invDelErr.message}` }, { status: 500 });
  }

  const { error: cleanErr } = await removeErpWorkspaceDataForUserIds(admin, targets);
  if (cleanErr) {
    return NextResponse.json({ error: cleanErr }, { status: 500 });
  }

  const { deleted, failures } = await deleteAuthUsersByIds(admin, targets);

  return NextResponse.json({
    ok: failures.length === 0,
    deletedAuthUsers: deleted,
    attempted: targets.length,
    failures,
  });
}
