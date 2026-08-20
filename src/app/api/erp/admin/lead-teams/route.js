import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';

export const runtime = 'nodejs';

/**
 * PATCH body: { userId: string, leadTeams: string[] | null }
 * Super admin only. Target must be team_lead.
 */
export async function PATCH(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (!isErpGlobalAdmin(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const rawTeams = body?.leadTeams;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  let leadTeams = null;
  if (rawTeams === null || rawTeams === undefined || rawTeams === '') {
    leadTeams = null;
  } else if (Array.isArray(rawTeams)) {
    leadTeams = [...new Set(rawTeams.map((t) => String(t || '').trim()).filter(Boolean))];
    if (leadTeams.length === 0) leadTeams = null;
  } else {
    return NextResponse.json({ error: 'leadTeams must be an array or null' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (leadTeams !== null) {
    const { data: opts, error: optErr } = await admin.from('erp_member_team_options').select('id');
    if (optErr) {
      return NextResponse.json({ error: optErr.message }, { status: 500 });
    }
    const valid = new Set((opts || []).map((o) => String(o.id)));
    for (const t of leadTeams) {
      if (!valid.has(t)) {
        return NextResponse.json({ error: `Invalid team: ${t}` }, { status: 400 });
      }
    }
  }

  const { data: target, error: fetchErr } = await admin
    .from('erp_profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (target.role !== 'team_lead') {
    return NextResponse.json({ error: 'Managed teams apply to Team Managers only.' }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from('erp_profiles')
    .update({ lead_teams: leadTeams, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, leadTeams });
}
