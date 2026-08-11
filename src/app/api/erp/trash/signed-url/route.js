import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent, isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

/** Short-lived signed URL for preview/download (admin / team lead).
 *
 * Admins (`role='admin'`) can download anything in the trash.
 * Team leads can only download trash items belonging to a project they are a
 * member of: this prevents a team lead from one project from being able to
 * exfiltrate trashed files of an unrelated project's chat. */
export async function GET(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: row, error: qErr } = await admin
    .from('erp_trash_items')
    .select('bucket, storage_path, source_meta')
    .eq('id', id)
    .maybeSingle();
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!isErpGlobalAdmin(profile?.role)) {
    // Extract project id from source_meta JSON (set when the file was sent to
    // trash). If the meta has no project context we deny non-admin access.
    const meta = row.source_meta && typeof row.source_meta === 'object' ? row.source_meta : {};
    const projectId = meta.project_id || meta.projectId || null;
    if (!projectId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data: membership } = await admin
      .from('erp_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: signed, error: sErr } = await admin.storage.from(row.bucket || 'erp-files').createSignedUrl(row.storage_path, 3600);
  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: sErr?.message || 'Could not sign URL' }, { status: 400 });
  }

  return NextResponse.json({ signedUrl: signed.signedUrl });
}
