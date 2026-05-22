import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../lib/erp-project-id';
import {
  createProjectSideChannel,
  userCanManageProjectChannels,
} from '../../../../../../lib/erp-project-channels-server';
import { fetchMergedRbacGrantsForUser } from '../../../../../../lib/erp-rbac-server';
import { erpRbacCan } from '../../../../../../lib/erp-rbac-modules';

export const runtime = 'nodejs';

/** POST { name: string, memberIds?: string[], sortOrder?: number } — create a side channel (service role). */
export async function POST(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (!user || authErr) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  if (!projectId || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile?.role, user.id);
  const rbacCreate = erpRbacCan(grants, 'messages', 'create');
  const canManage = await userCanManageProjectChannels(admin, {
    userId: user.id,
    profileRole: profile?.role,
    projectId,
  });

  if (!canManage && !rbacCreate) {
    return NextResponse.json({ error: 'You cannot create channels on this project.' }, { status: 403 });
  }

  const name = typeof body?.name === 'string' ? body.name : '';
  const memberIds = Array.isArray(body?.memberIds) ? body.memberIds.filter((id) => typeof id === 'string') : [];
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;

  const { channel, memberUserIds, error } = await createProjectSideChannel(admin, {
    projectId,
    createdBy: user.id,
    name,
    sortOrder,
    memberUserIds: memberIds,
  });

  if (error || !channel) {
    return NextResponse.json({ error: error?.message || 'Could not create channel.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, channel, memberUserIds });
}
