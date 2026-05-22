import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../../lib/supabase-admin';
import { createInvitationAndSendEmail } from '../../../../../../../lib/erp-invite-server';
import { fetchResolvedWorkspaceRoleKeySet } from '../../../../../../../lib/erp-workspace-role-keys-server';
import { isSupabaseSchemaMissingError } from '../../../../../../../lib/supabase-errors';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/erp/trash/users/:id/reinvite
 * Send a fresh workspace invite from a trashed-user snapshot (auth account was already deleted).
 */
export async function POST(request, context) {
  const { id } = await context.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid trash record id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const { data: row, error: rowErr } = await admin
    .from('erp_trashed_users')
    .select('id, email, full_name, role')
    .eq('id', id)
    .maybeSingle();

  if (rowErr) {
    if (isSupabaseSchemaMissingError(rowErr)) {
      return NextResponse.json(
        {
          error:
            'Trash user snapshots are not enabled on this database. Run migration 20260504120000_erp_trashed_users.sql in Supabase.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: rowErr.message }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Trashed user record not found' }, { status: 404 });
  }

  const email = String(row.email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'No email on this trash record — re-invite manually from Invites.' }, { status: 400 });
  }

  let globalRole = String(row.role || 'client').trim().toLowerCase();
  const validRoles = await fetchResolvedWorkspaceRoleKeySet(admin);
  if (!validRoles.has(globalRole)) {
    globalRole = 'client';
  }

  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const result = await createInvitationAndSendEmail({
    supabase,
    user,
    profile,
    email,
    globalRole,
    projectId: null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Could not send invite' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    email,
    globalRole,
    flow: result.flow || 'invited',
    expiresAt: result.expiresAt || null,
  });
}
