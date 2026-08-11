import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { isSupabaseSchemaMissingError } from '../../../../lib/supabase-errors';

export const runtime = 'nodejs';

/**
 * List trash items (workspace admins / team leads).
 */
export async function GET(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: rows, error: qErr } = await admin
    .from('erp_trash_items')
    .select(
      'id, bucket, storage_path, original_path, display_name, mime, source_kind, source_meta, deleted_by, deleted_at, purge_at',
    )
    .order('deleted_at', { ascending: false })
    .limit(500);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });

  const { data: trashedProjects, error: pErr } = await admin
    .from('erp_projects')
    .select('id, name, deleted_at, purge_at, deleted_by, updated_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(200);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  // Trashed users (members / clients deleted via the user delete endpoint).
  // Tolerated when the migration hasn't been applied yet so the Trash page
  // still works without it: just no users section.
  let trashedUsers = [];
  const { data: tu, error: tuErr } = await admin
    .from('erp_trashed_users')
    .select('id, original_user_id, email, full_name, role, avatar_path, deleted_at, purge_at, deleted_by')
    .order('deleted_at', { ascending: false })
    .limit(200);
  if (tuErr) {
    if (!isSupabaseSchemaMissingError(tuErr)) {
      return NextResponse.json({ error: tuErr.message }, { status: 400 });
    }
  } else {
    trashedUsers = tu || [];
  }

  return NextResponse.json({
    items: rows || [],
    trashedProjects: trashedProjects || [],
    trashedUsers,
  });
}
