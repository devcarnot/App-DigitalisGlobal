import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { createInvitationAndSendEmail } from '../../../../lib/erp-invite-server';
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (!profile || !isErpAdminEquivalent(profile.role)) {
    return NextResponse.json({ error: 'Only workspace admins or team leads can send invitations' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const globalRole = body.globalRole;
  const projectId = body.projectId || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!['team_lead', 'team_member', 'client'].includes(globalRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const supabase = createSupabaseUserClient(accessToken);

  const result = await createInvitationAndSendEmail({
    supabase,
    user,
    profile,
    email,
    globalRole,
    projectId,
  });

  if (!result.ok && result.step === 'database') {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (!result.ok && result.step === 'email') {
    return NextResponse.json(
      {
        error: result.error,
        invitationCreated: result.invitationCreated,
        inviteUrl: result.inviteUrl,
        ...(result.memberAdded === true ? { memberAdded: true } : {}),
        ...(result.flow ? { flow: result.flow } : {}),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    expiresAt: result.expiresAt,
    ...(result.flow ? { flow: result.flow } : {}),
  });
}
