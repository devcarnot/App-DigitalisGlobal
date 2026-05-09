import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const ALL_ROLES = ['admin', 'team_lead', 'team_member', 'hr', 'bd', 'client'];
const NON_CLIENT_ROLES = ['admin', 'team_lead', 'team_member', 'hr', 'bd'];
/**
 * Roles whose meeting invites are limited to team_lead/team_member of a
 * project they themselves belong to. They can never invite admins, HR, BD,
 * other clients, or workspace-wide profiles.
 */
const ROLES_RESTRICTED_TO_PROJECT_TEAM = new Set(['client', 'team_member']);
const PROJECT_TEAM_ROLES = ['team_lead', 'team_member'];

function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * GET /api/erp/meetings/invitable-people?projectId=<uuid>?
 *
 * Returns the people the current user can invite to a meeting.
 *
 *   - admin / team_lead / hr / bd:
 *       Without `projectId`: every active workspace profile (members + clients).
 *       With `projectId`: every member of that project.
 *   - team_member / client (project-team-only roles):
 *       Must scope to a project they belong to. Result is restricted to
 *       team_lead + team_member members of that project.
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

  // Project-team-only roles (clients + team members): must link a project
  // they belong to and can only see team_lead + team_member members of it.
  if (ROLES_RESTRICTED_TO_PROJECT_TEAM.has(profile.role)) {
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

    const { data: members, error: mErr } = await admin
      .from('erp_project_members')
      .select('user_id')
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
      .in('role', PROJECT_TEAM_ROLES);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    return NextResponse.json({ people: profiles || [] });
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
