import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpInviteGlobalRoleToProjectRole } from '../../../../../lib/erp-invite-server';
import { isErpPortalAdminEmail } from '../../../../../lib/erp-portal-admin-emails';

function emailVariants(email) {
  const raw = String(email || '').trim();
  const lower = raw.toLowerCase();
  return [...new Set([lower, raw].filter(Boolean))];
}

async function provisionFromInvitation(admin, user, invitation) {
  const userId = user.id;
  const email = String(user.email || invitation.email || '').trim().toLowerCase();
  const fullName =
    String(user.user_metadata?.full_name || '').trim() ||
    String(invitation.full_name || '').trim() ||
    email.split('@')[0] ||
    'Workspace member';
  const role =
    typeof invitation.global_role === 'string' && invitation.global_role.trim()
      ? invitation.global_role.trim()
      : 'team_member';

  const { error: insErr } = await admin.from('erp_profiles').insert({
    id: userId,
    role,
    full_name: fullName,
    contact_email: email || null,
    updated_at: new Date().toISOString(),
  });
  if (insErr) return { error: insErr.message };

  if (invitation.project_id) {
    const projectRole = erpInviteGlobalRoleToProjectRole(role);
    const { error: mErr } = await admin.from('erp_project_members').upsert(
      {
        project_id: invitation.project_id,
        user_id: userId,
        role: projectRole,
      },
      { onConflict: 'project_id,user_id' },
    );
    if (mErr) {
      console.warn('ensure-profile project member', mErr.message);
    }
  }

  if (!invitation.accepted_at) {
    await admin
      .from('erp_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);
  }

  return { error: null, role };
}

/**
 * Create a missing erp_profiles row when the signed-in user is allowed
 * (portal admin allow-list, or has a workspace invitation).
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (profile?.id) {
    return NextResponse.json({ ok: true, created: false, profileId: profile.id, role: profile.role });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const email = String(user.email || '').trim().toLowerCase();

  if (email && isErpPortalAdminEmail(email)) {
    const fullName =
      user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin';
    const { error: upErr } = await admin.from('erp_profiles').upsert(
      {
        id: user.id,
        role: 'admin',
        full_name: fullName,
        contact_email: email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, created: true, role: 'admin' });
  }

  const variants = emailVariants(user.email);

  const { data: pendingInv } = await admin
    .from('erp_invitations')
    .select('*')
    .in('email', variants)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingInv?.token) {
    return NextResponse.json({
      ok: false,
      reason: 'pending_invitation',
      acceptUrl: `/erp/accept-invite?token=${encodeURIComponent(pendingInv.token)}`,
    });
  }

  const { data: acceptedInv } = await admin
    .from('erp_invitations')
    .select('*')
    .in('email', variants)
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (acceptedInv) {
    const rest = await provisionFromInvitation(admin, user, acceptedInv);
    if (rest.error) {
      return NextResponse.json({ error: rest.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, created: true, role: rest.role });
  }

  return NextResponse.json({
    ok: false,
    reason: 'no_invitation',
    message:
      'Your sign-in worked, but this email has no workspace profile yet. Ask an administrator to send you an ERP invitation.',
  });
}
