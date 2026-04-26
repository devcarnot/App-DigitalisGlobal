import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

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

  return NextResponse.json({ items: rows || [], trashedProjects: trashedProjects || [] });
}
