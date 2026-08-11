import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';

export const runtime = 'nodejs';

const NON_CLIENT_ROLES = ['admin', 'team_lead', 'team_member', 'hr', 'bd'];

/**
 * GET /api/erp/reminders/assignable-people
 *
 * Super Admin only: returns active workspace members for reminder assignment.
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (!isErpGlobalAdmin(profile.role)) {
    return NextResponse.json({ people: [] });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: profiles, error } = await admin
    .from('erp_profiles')
    .select('id, full_name, role, contact_email, avatar_path')
    .in('role', NON_CLIENT_ROLES)
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const people = (profiles || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    contact_email: p.contact_email,
    avatar_path: p.avatar_path,
  }));

  return NextResponse.json({ people });
}
