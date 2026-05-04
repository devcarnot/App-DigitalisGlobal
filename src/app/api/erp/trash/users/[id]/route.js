import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permanently remove a trashed-user record (Trash → Delete forever).
 *
 * The auth.users row was already hard-deleted when the user was removed via
 * /api/erp/admin/users/[userId]. This endpoint just clears the audit / re-invite
 * snapshot kept in `erp_trashed_users`.
 */
export async function DELETE(request, context) {
  const { id } = await context.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { error: delErr } = await admin.from('erp_trashed_users').delete().eq('id', id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
