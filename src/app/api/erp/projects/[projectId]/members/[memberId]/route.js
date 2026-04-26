import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../../lib/erp-project-id';

export async function DELETE(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 });
  }

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  const memberId = typeof params?.memberId === 'string' ? params.memberId : null;
  if (!projectId || !memberId || !isValidErpProjectId(projectId) || !isValidErpProjectId(memberId)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // Prevent removing the project creator's last admin lead? Keep simple: allow removing anyone except yourself.
  if (memberId === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself from a project' }, { status: 400 });
  }

  const { data: proj } = await admin.from('erp_projects').select('id, name').eq('id', projectId).maybeSingle();
  if (!proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { error: delErr } = await admin
    .from('erp_project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', memberId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  // Notification for removed user (optional; not counted as messaging).
  await admin.from('erp_notifications').insert({
    user_id: memberId,
    title: `Removed from ${proj.name || 'project'}`,
    body: 'You no longer have access to this project.',
    read: false,
    link: '/erp/projects',
  });

  await admin.from('erp_activity_log').insert({
    project_id: projectId,
    user_id: user.id,
    action: 'member_removed',
    meta: { removed_user_id: memberId },
  });

  return NextResponse.json({ ok: true });
}

