/**
 * Server-only meeting helpers shared by the create/update routes. Keeps the
 * "who is allowed to invite whom" rule in one place so the rules stay in
 * sync between POST /api/erp/meetings and PATCH /api/erp/meetings/[id].
 */

const PROJECT_TEAM_ROLES = new Set(['team_lead', 'team_member']);
const ROLES_RESTRICTED_TO_PROJECT_TEAM = new Set(['client', 'team_member']);

export function isProjectTeamOnlyOrganizer(role) {
  return ROLES_RESTRICTED_TO_PROJECT_TEAM.has(role);
}

/**
 * Enforce the "client / team_member can only invite team_lead + team_member of
 * a project they themselves belong to" rule.
 *
 * Resolves `{ ok: true }` when the rule is satisfied or doesn't apply, and
 * `{ ok: false, status, error }` otherwise. Callers should `return NextResponse
 * .json({ error }, { status })` on failure.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.admin Service-role client.
 * @param {string} args.role Organizer role (profile.role).
 * @param {string} args.userId Organizer auth.uid().
 * @param {string|null} args.projectId Project linked on the meeting (or null).
 * @param {string[]} args.inviteeIds Required + optional invitee user ids
 *   (excluding the organizer themselves; nullable rows already filtered out).
 */
export async function assertMeetingInviteeRule({ admin, role, userId, projectId, inviteeIds }) {
  if (!isProjectTeamOnlyOrganizer(role)) return { ok: true };

  if (!projectId) {
    return {
      ok: false,
      status: 400,
      error: 'Please link a project — you can only invite team managers or members of a project.',
    };
  }

  // Verify the organizer is a member of the project.
  const { data: own, error: ownErr } = await admin
    .from('erp_project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    return { ok: false, status: 400, error: ownErr.message };
  }
  if (!own) {
    return {
      ok: false,
      status: 403,
      error: 'You are not a member of that project.',
    };
  }

  if (!inviteeIds || inviteeIds.length === 0) return { ok: true };

  const { data: members, error: mErr } = await admin
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .in('user_id', inviteeIds);
  if (mErr) {
    return { ok: false, status: 400, error: mErr.message };
  }
  const memberIds = new Set((members || []).map((m) => m.user_id));

  const { data: profiles, error: pErr } = await admin
    .from('erp_profiles')
    .select('id, role')
    .in('id', inviteeIds);
  if (pErr) {
    return { ok: false, status: 400, error: pErr.message };
  }
  const allowed = new Set(
    (profiles || [])
      .filter((p) => memberIds.has(p.id) && PROJECT_TEAM_ROLES.has(p.role))
      .map((p) => p.id),
  );

  for (const id of inviteeIds) {
    if (!allowed.has(id)) {
      return {
        ok: false,
        status: 403,
        error: 'You can only invite team managers or members of this project.',
      };
    }
  }
  return { ok: true };
}
