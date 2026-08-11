import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpManagerRole } from '../../../../../lib/erp-roles';

export const runtime = 'nodejs';

/**
 * PATCH body: { userId: string, memberTeam: string | null }: id must exist in erp_member_team_options when set.
 * Only workspace admin or team lead. Target must be team_member or team_lead.
 */
export async function PATCH(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (!isErpManagerRole(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const rawTeam = body?.memberTeam;
  const memberTeam =
    rawTeam === null || rawTeam === ''
      ? null
      : typeof rawTeam === 'string'
        ? rawTeam.trim() || null
        : String(rawTeam);

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (memberTeam !== null) {
    const { data: optRow, error: optErr } = await admin
      .from('erp_member_team_options')
      .select('id')
      .eq('id', memberTeam)
      .maybeSingle();
    if (optErr) {
      return NextResponse.json({ error: optErr.message }, { status: 500 });
    }
    if (!optRow?.id) {
      return NextResponse.json({ error: 'Invalid or unknown designation' }, { status: 400 });
    }
  }

  const { data: target, error: fetchErr } = await admin.from('erp_profiles').select('id, role').eq('id', userId).maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!['team_member', 'team_lead'].includes(target.role)) {
    return NextResponse.json({ error: 'Team assignment applies to members and team leads only.' }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from('erp_profiles')
    .update({ member_team: memberTeam, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, memberTeam });
}
