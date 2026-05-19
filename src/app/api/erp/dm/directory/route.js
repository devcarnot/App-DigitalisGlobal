import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
export const runtime = 'nodejs';

/**
 * Enrich profiles with a display email: contact_email first, else auth.users email.
 */
async function enrichProfilesWithEmail(admin, profiles) {
  if (!profiles?.length) return [];
  const CONC = 8;
  const out = [];
  for (let i = 0; i < profiles.length; i += CONC) {
    const batch = profiles.slice(i, i + CONC);
    const chunk = await Promise.all(
      batch.map(async (p) => {
        let email = (p.contact_email && String(p.contact_email).trim()) || null;
        if (!email && admin.auth?.admin?.getUserById) {
          try {
            const { data, error } = await admin.auth.admin.getUserById(p.id);
            if (!error && data?.user?.email) email = data.user.email;
          } catch {
            /* ignore */
          }
        }
        return {
          id: p.id,
          role: p.role,
          full_name: p.full_name,
          avatar_path: p.avatar_path,
          member_team: p.member_team ?? null,
          last_active_at: p.last_active_at ?? null,
          email,
        };
      }),
    );
    out.push(...chunk);
  }
  return out;
}

/**
 * Workspace users for messaging and group creation: everyone with a profile except the caller
 * (not filtered by shared projects).
 *
 * Query: assignable=1 — internal roles only (admin, team_lead, team_member), includes caller
 * (for project creation / team assignment pickers).
 *
 * Query: projectTeamPick=1 — all workspace roles (incl. HR, BD, client), includes caller;
 * for task assignee / project team pickers (admin or team lead only).
 *
 * Query: workspaceRoster=1 — all roles, includes caller; admin or team_lead only (team directory).
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

  const assignable = request.nextUrl.searchParams.get('assignable') === '1';
  const projectTeamPick = request.nextUrl.searchParams.get('projectTeamPick') === '1';
  const workspaceRoster = request.nextUrl.searchParams.get('workspaceRoster') === '1';

  if ((workspaceRoster || projectTeamPick) && !['admin', 'team_lead'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ALL_WORKSPACE_ROLES = ['admin', 'team_lead', 'team_member', 'hr', 'bd', 'client'];

  function buildQuery(selectCols) {
    let q = admin.from('erp_profiles').select(selectCols);
    if (workspaceRoster || projectTeamPick) {
      q = q.in('role', ALL_WORKSPACE_ROLES);
    } else if (assignable) {
      q = q.in('role', ['admin', 'team_lead', 'team_member']);
    } else {
      q = q.neq('id', user.id);
    }
    return q;
  }

  const selectVariants = [
    'id, role, full_name, avatar_path, contact_email, member_team, last_active_at',
    'id, role, full_name, avatar_path, contact_email, member_team',
    'id, role, full_name, avatar_path, contact_email',
    'id, role, full_name, avatar_path, member_team',
    'id, role, full_name, avatar_path',
  ];

  let profiles = null;
  let listErr = null;
  for (const cols of selectVariants) {
    const r = await buildQuery(cols).order('full_name', { ascending: true });
    if (!r.error) {
      profiles = r.data;
      listErr = null;
      break;
    }
    listErr = r.error;
  }

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const users = await enrichProfilesWithEmail(admin, profiles || []);

  return NextResponse.json({ users });
}
