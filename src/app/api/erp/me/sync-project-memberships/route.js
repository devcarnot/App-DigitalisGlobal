import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpInviteGlobalRoleToProjectRole } from '../../../../../lib/erp-invite-server';

export const runtime = 'nodejs';

function isUniqueViolation(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('duplicate key') || err.code === '23505';
}

/**
 * Ensures erp_project_members has a row for every accepted invitation that matches
 * this user's email and has a project_id. Fixes dashboards when invites were marked
 * accepted but membership insert failed or was skipped.
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'No ERP profile' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const rawEmail = String(user.email || '').trim();
  const emailLower = rawEmail.toLowerCase();
  if (!emailLower) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const emailVariants = [...new Set([emailLower, rawEmail].filter(Boolean))];

  const { data: invites, error: invErr } = await admin
    .from('erp_invitations')
    .select('id, project_id, global_role, email')
    .in('email', emailVariants)
    .not('accepted_at', 'is', null)
    .not('project_id', 'is', null);

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  const rows = (invites || []).filter((r) => String(r.email || '').trim().toLowerCase() === emailLower);

  const clientSideProfile = profile.role === 'client' || profile.role === 'client_team_member';

  let membershipsAdded = 0;
  for (const inv of rows) {
    if (!inv.project_id) continue;
    const gr = String(inv.global_role ?? '')
      .trim()
      .toLowerCase();
    // Client-side accounts must not be re-added from old team_member / team_lead invites.
    if (clientSideProfile && gr !== 'client' && gr !== 'client_team_member') {
      continue;
    }
    const role = erpInviteGlobalRoleToProjectRole(inv.global_role);
    const { error: insErr } = await admin.from('erp_project_members').insert({
      project_id: inv.project_id,
      user_id: user.id,
      role,
    });
    if (!insErr) {
      membershipsAdded += 1;
    } else if (!isUniqueViolation(insErr)) {
      console.warn('sync-project-memberships', inv.project_id, insErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    invitationsMatched: rows.length,
    membershipsAdded,
  });
}
