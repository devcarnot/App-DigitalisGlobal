import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const PROFILE_FETCH_LIMIT = 5000;
const PROJECT_MEMBER_FETCH_LIMIT = 20000;

/**
 * Self-healing audit that aligns `erp_profiles.role` with the highest project
 * role each user actually carries in `erp_project_members`.
 *
 * Why this exists:
 *   - For a long time, "Add member" / project invite flows that short-circuit
 *     for an existing auth account inserted a project_member row with role
 *     'member' or 'project_lead' but never updated the user's workspace
 *     `erp_profiles.role`. So a user previously created as a `client` (often
 *     by a Postgres `handle_new_user` trigger that defaults to 'client') ended
 *     up with profile.role='client' AND project_member.role='member', which
 *     the project roster renders as "Client account · Member".
 *   - The newer accept-invite + short-circuit + Add-member-modal paths now
 *     keep these in sync going forward. This endpoint heals the historical
 *     rows without anyone needing SQL access.
 *
 * Behaviour:
 *   - Admin / team-lead caller required.
 *   - For every profile with role='client', find the maximum project role they
 *     hold across all project_members rows:
 *       * any 'project_lead' → bump profile.role to 'team_lead'
 *       * any 'member' (and no project_lead) → bump profile.role to 'team_member'
 *       * only 'client' rows (or no rows) → leave alone (legitimate client)
 *   - Never touches admin or team_lead profiles.
 *   - Idempotent: re-running on a healthy workspace is a no-op.
 *
 * Returns: { ok, scanned, repaired, details: [{ userId, from, to }] }
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json(
      { error: 'Only workspace admins or team leads can run the role repair.' },
      { status: 403 },
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const { data: clientProfiles, error: profErr } = await admin
    .from('erp_profiles')
    .select('id, role')
    .eq('role', 'client')
    .limit(PROFILE_FETCH_LIMIT);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const ids = (clientProfiles || []).map((p) => p.id).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, repaired: 0, details: [] });
  }

  const { data: memberRows, error: memErr } = await admin
    .from('erp_project_members')
    .select('user_id, role')
    .in('user_id', ids)
    .limit(PROJECT_MEMBER_FETCH_LIMIT);
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  // Pick the highest non-client project role per user.
  const bestByUser = new Map();
  for (const row of memberRows || []) {
    const uid = row?.user_id;
    if (!uid) continue;
    const cur = bestByUser.get(uid);
    if (row.role === 'project_lead') {
      bestByUser.set(uid, 'project_lead');
    } else if (row.role === 'member' && cur !== 'project_lead') {
      bestByUser.set(uid, 'member');
    }
  }

  const updates = [];
  for (const uid of ids) {
    const best = bestByUser.get(uid);
    if (best === 'project_lead') updates.push({ userId: uid, to: 'team_lead' });
    else if (best === 'member') updates.push({ userId: uid, to: 'team_member' });
  }

  let repaired = 0;
  const details = [];
  for (const u of updates) {
    const { error: upErr } = await admin
      .from('erp_profiles')
      .update({ role: u.to, updated_at: new Date().toISOString() })
      .eq('id', u.userId)
      .eq('role', 'client'); // Re-check role to avoid races with manual fixes.
    if (!upErr) {
      repaired += 1;
      details.push({ userId: u.userId, from: 'client', to: u.to });
    } else {
      console.warn('repair-role-mismatches update failed', u.userId, upErr.message || upErr);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: ids.length,
    repaired,
    details,
  });
}
