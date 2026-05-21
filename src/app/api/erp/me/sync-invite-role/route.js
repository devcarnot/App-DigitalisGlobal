import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpInviteWorkspaceRoleRank } from '../../../../../lib/erp-invite-role-rank';

export const runtime = 'nodejs';

/**
 * Align `erp_profiles.role` with the most recently accepted invitation for
 * this user's email — fixes cases where a Postgres trigger or deferred side
 * effect left profile.role=`client` even though `erp_invitations.global_role`
 * was `team_member` / `team_lead` when they joined.
 *
 * Security: callers can only mutate their **own** row. Never demotes: we only
 * update when the invite targets a strictly higher-privilege workspace role
 * than what's stored today (so a team_member who legitimately accepted a
 * later client-facing invite stays a team_member).
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!profile?.id) {
    return NextResponse.json({ error: 'No ERP profile' }, { status: 403 });
  }

  const emailRaw = String(user.email || '').trim();
  const emailLower = emailRaw.toLowerCase();
  if (!emailLower) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const variants = [...new Set([emailLower, emailRaw].filter(Boolean))];

  const { data: rows, error: invErr } = await admin
    .from('erp_invitations')
    .select('global_role, accepted_at')
    .in('email', variants)
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1);

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  const inv = rows?.[0];
  const inviteRoleNormalized =
    typeof inv?.global_role === 'string' ? inv.global_role.trim().toLowerCase() : '';
  if (
    !inviteRoleNormalized ||
    erpInviteWorkspaceRoleRank(inviteRoleNormalized) < 0
  ) {
    return NextResponse.json({ ok: true, updated: false, reason: 'no_matching_invitation' });
  }

  const currentRole = profile.role;
  const curR = erpInviteWorkspaceRoleRank(currentRole);
  const invR = erpInviteWorkspaceRoleRank(inviteRoleNormalized);

  if (currentRole === 'admin') {
    return NextResponse.json({ ok: true, updated: false, reason: 'admin_protected' });
  }

  if (currentRole === 'team_lead' && inviteRoleNormalized === 'client_team_member') {
    return NextResponse.json({ ok: true, updated: false, reason: 'team_lead_protected' });
  }

  // Latest accepted client_team_member invite always wins over client / team_member (same tier).
  const forceClientTeam =
    inviteRoleNormalized === 'client_team_member' &&
    currentRole !== 'client_team_member' &&
    currentRole !== 'admin' &&
    currentRole !== 'team_lead';

  // Never demote via this endpoint (except explicit client_team_member correction above).
  if (!forceClientTeam && invR <= curR) {
    return NextResponse.json({ ok: true, updated: false, reason: 'invite_not_higher' });
  }

  const { error: upErr } = await admin
    .from('erp_profiles')
    .update({ role: inviteRoleNormalized, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .neq('role', 'admin');

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updated: true,
    previousRole: currentRole,
    role: inviteRoleNormalized,
  });
}
