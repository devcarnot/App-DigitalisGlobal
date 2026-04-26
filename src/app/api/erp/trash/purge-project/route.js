import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { isErpGlobalAdmin, isErpAdminEquivalent } from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../lib/erp-project-id';
import { moveProjectStorageFolderToTrash } from '../../../../../lib/erp-trash-server';

export const runtime = 'nodejs';

export async function POST(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
  if (!projectId || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Valid projectId required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: proj, error: sErr } = await admin
    .from('erp_projects')
    .select('id, name, deleted_at')
    .eq('id', projectId)
    .maybeSingle();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });
  if (!proj?.deleted_at) {
    return NextResponse.json({ error: 'Project is not in Trash' }, { status: 400 });
  }

  if (!isErpGlobalAdmin(profile?.role)) {
    const { data: mem } = await admin
      .from('erp_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mem) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await moveProjectStorageFolderToTrash(admin, projectId, user.id);
  const { error: delErr } = await admin.from('erp_projects').delete().eq('id', projectId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, projectId });
}
