import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const ALL_ROLES = ['admin', 'team_lead', 'team_member', 'hr', 'bd', 'client'];
const NON_CLIENT_ROLES = ['admin', 'team_lead', 'team_member', 'hr', 'bd'];

function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * GET /api/erp/meetings/invitable-people?projectId=<uuid>?
 *
 * Returns the people the current user can invite to a meeting:
 *   - Without `projectId`: every active workspace profile (members + clients).
 *   - With `projectId`: only members of that project (always includes any
 *     clients linked to that project).
 *
 * Clients can fetch this only if they are a project member of the same
 * project they are scoping to (otherwise empty list).
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (projectId && !isUuid(projectId)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  // Clients can only see project-scoped lists they belong to themselves.
  if (profile.role === 'client') {
    if (!projectId) {
      return NextResponse.json({ people: [] });
    }
    const { data: own } = await admin
      .from('erp_project_members')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!own) {
      return NextResponse.json({ people: [] });
    }
  }

  if (projectId) {
    const { data: members, error: mErr } = await admin
      .from('erp_project_members')
      .select('user_id, role')
      .eq('project_id', projectId);
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
    const ids = [...new Set((members || []).map((m) => m.user_id).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json({ people: [] });
    }
    const { data: profiles, error: pErr } = await admin
      .from('erp_profiles')
      .select('id, full_name, role, contact_email, avatar_path')
      .in('id', ids)
      .in('role', ALL_ROLES);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    return NextResponse.json({ people: profiles || [] });
  }

  // Workspace-wide directory: members + clients.
  const { data: profiles, error: pErr } = await admin
    .from('erp_profiles')
    .select('id, full_name, role, contact_email, avatar_path')
    .in('role', profile.role === 'admin' ? ALL_ROLES : NON_CLIENT_ROLES.concat('client'))
    .limit(1000);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }
  return NextResponse.json({ people: profiles || [] });
}
