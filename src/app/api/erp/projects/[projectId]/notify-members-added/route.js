import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { isErpGlobalAdmin, isErpManagerRole } from '../../../../../../lib/erp-roles';
import { notifyUsersAddedToProject } from '../../../../../../lib/erp-project-member-notify';

/**
 * POST — notify users they were added to a project (in-app + email).
 * Used after client-side membership inserts (e.g. voice assistant).
 */
export async function POST(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const projectId = params?.projectId;
  if (!projectId || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'Project id required' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userIds = Array.isArray(body?.userIds)
    ? [...new Set(body.userIds.filter((id) => typeof id === 'string' && id))]
    : [];
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_user_ids' });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const isAdmin = isErpGlobalAdmin(profile?.role);
  const isManager = isErpManagerRole(profile?.role);
  if (!isAdmin && !isManager) {
    const { data: actorMember } = await admin
      .from('erp_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!actorMember || actorMember.role !== 'project_lead') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const inviterName =
    (profile?.full_name && String(profile.full_name).trim()) || user.email?.split('@')[0] || 'A team admin';

  const { notified, emailed } = await notifyUsersAddedToProject(admin, {
    userIds,
    projectId,
    inviterUserId: user.id,
    inviterName,
    excludeUserIds: [user.id],
  });

  return NextResponse.json({ ok: true, notified, emailed });
}
