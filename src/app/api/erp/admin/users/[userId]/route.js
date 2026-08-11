import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent, isErpGlobalAdmin, isErpWorkspaceRosterEditor } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import {
  collectClientTeamMemberIdsForClient,
  deleteAuthUsersByIds,
  removeErpWorkspaceDataForUserIds,
} from '../../../../../../lib/erp-admin-user-cleanup';
import { isSupabaseSchemaMissingError } from '../../../../../../lib/supabase-errors';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Built-in assignable roles plus any `erp_workspace_custom_roles.role_key`.
 * `admin` is only valid when `viewerIsGlobalAdmin`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {boolean} viewerIsGlobalAdmin
 */
async function loadAssignableWorkspaceRoleSet(admin, viewerIsGlobalAdmin) {
  const base = ['team_member', 'team_lead', 'client', 'hr', 'bd'];
  if (viewerIsGlobalAdmin) base.push('admin');
  const set = new Set(base);
  if (admin) {
    const { data } = await admin.from('erp_workspace_custom_roles').select('role_key');
    for (const r of data || []) {
      if (r?.role_key) set.add(String(r.role_key));
    }
  }
  return set;
}

/**
 * PATCH /api/erp/admin/users/:userId
 *
 * Body: { role: string }: built-in key or custom slug from `erp_workspace_custom_roles`.
 *
 * Safeguards:
 *   - Caller must be workspace roster editor (admin, team_lead, or team_member).
 *   - Granting `admin` requires the caller to be a global workspace admin.
 *   - Changing or demoting an existing `admin` requires the caller to be a global workspace admin.
 *   - Cannot change own role from here.
 */
export async function PATCH(request, context) {
  const { userId } = await context.params;
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpWorkspaceRosterEditor(profile?.role)) {
    return NextResponse.json({ error: 'You do not have permission to change workspace roles.' }, { status: 403 });
  }
  if (user.id === userId) {
    return NextResponse.json({ error: 'You cannot change your own role from here.' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const role = String(body?.role || '').trim();

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const allowed = await loadAssignableWorkspaceRoleSet(admin, isErpGlobalAdmin(profile?.role));
  if (!allowed.has(role)) {
    return NextResponse.json(
      { error: 'Invalid role for this workspace or your permissions.' },
      { status: 400 },
    );
  }
  if (role === 'admin' && !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Only workspace super admins can assign the admin role.' }, { status: 403 });
  }

  const { data: target, error: targetErr } = await admin
    .from('erp_profiles')
    .select('id, role, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'No workspace profile found for that user.' }, { status: 404 });
  }
  if (target.role === 'admin') {
    if (role === 'admin') {
      return NextResponse.json({ ok: true, status: 'unchanged', role });
    }
    if (!isErpGlobalAdmin(profile?.role)) {
      return NextResponse.json({ error: 'Only workspace super admins can change a super admin role.' }, { status: 403 });
    }
  }
  if (target.role === role) {
    return NextResponse.json({ ok: true, status: 'unchanged', role });
  }

  const { error: upErr } = await admin
    .from('erp_profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'updated', previousRole: target.role, role });
}

export async function DELETE(request, context) {
  const { userId } = await context.params;
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Only workspace admins or team leads can remove users.' }, { status: 403 });
  }
  if (user.id === userId) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const { data: targetProfile, error: profErr } = await admin
    .from('erp_profiles')
    .select('id, full_name, role, avatar_path')
    .eq('id', userId)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ error: 'User is not in the workspace.' }, { status: 404 });
  }
  if (targetProfile.role === 'admin' && !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json(
      { error: 'Only workspace super admins can remove another super admin.' },
      { status: 403 },
    );
  }

  /** @type {string[]} */
  let idsToRemove = [userId];
  let teamMemberIdsRemoved = [];

  if (targetProfile.role === 'client') {
    try {
      teamMemberIdsRemoved = await collectClientTeamMemberIdsForClient(admin, userId);
      idsToRemove = [...new Set([userId, ...teamMemberIdsRemoved])];
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Could not resolve client team members' },
        { status: 500 },
      );
    }
  }

  const profilesById = { [userId]: targetProfile };
  const extraIds = idsToRemove.filter((id) => id !== userId);
  if (extraIds.length > 0) {
    const { data: teamProfiles, error: teamProfErr } = await admin
      .from('erp_profiles')
      .select('id, full_name, role, avatar_path')
      .in('id', extraIds);
    if (teamProfErr) {
      return NextResponse.json({ error: teamProfErr.message }, { status: 500 });
    }
    for (const p of teamProfiles || []) {
      if (p?.id) profilesById[p.id] = p;
    }
  }

  const emailByUserId = {};
  for (const targetId of idsToRemove) {
    const { data: authData } = await admin.auth.admin.getUserById(targetId);
    emailByUserId[targetId] = authData?.user?.email?.trim().toLowerCase() || null;
  }

  for (const targetId of idsToRemove) {
    const prof = profilesById[targetId];
    if (!prof) continue;
    const { error: trashInsErr } = await admin.from('erp_trashed_users').insert({
      original_user_id: targetId,
      email: emailByUserId[targetId],
      full_name: prof.full_name || null,
      role: prof.role || null,
      avatar_path: prof.avatar_path || null,
      deleted_by: user.id,
    });
    if (trashInsErr && !isSupabaseSchemaMissingError(trashInsErr)) {
      console.warn('erp_trashed_users insert', trashInsErr.message);
    }
  }

  for (const targetId of idsToRemove) {
    const { error: invByErr } = await admin.from('erp_invitations').delete().eq('invited_by', targetId);
    if (invByErr) {
      return NextResponse.json({ error: `Could not clear invitations: ${invByErr.message}` }, { status: 500 });
    }
    const targetEmail = emailByUserId[targetId];
    if (targetEmail) {
      const { error: invEmailErr } = await admin.from('erp_invitations').delete().eq('email', targetEmail);
      if (invEmailErr) {
        return NextResponse.json({ error: `Could not clear invitations: ${invEmailErr.message}` }, { status: 500 });
      }
    }
  }

  const displayName = targetProfile?.full_name && String(targetProfile.full_name).trim();
  const email = emailByUserId[userId];

  const { error: cleanErr } = await removeErpWorkspaceDataForUserIds(admin, idsToRemove);
  if (cleanErr) {
    return NextResponse.json({ error: cleanErr }, { status: 500 });
  }

  const { deleted, failures } = await deleteAuthUsersByIds(admin, idsToRemove);
  if (failures.length > 0) {
    return NextResponse.json(
      { ok: false, error: failures[0]?.error || 'Delete failed', deleted },
      { status: 500 },
    );
  }

  const removedLabel = displayName || email || 'A user';
  for (const targetId of idsToRemove) {
    const prof = profilesById[targetId];
    const targetEmail = emailByUserId[targetId] || null;
    const targetName = prof?.full_name && String(prof.full_name).trim();
    const { error: actInsErr } = await admin.from('erp_activity_log').insert({
      project_id: null,
      user_id: user.id,
      action: 'user_removed',
      meta: {
        removed_user_id: targetId,
        email: targetEmail,
        display_name: targetName || null,
        role: prof?.role || null,
        removed_with_client_id: targetId !== userId ? userId : null,
      },
    });
    if (actInsErr) {
      console.warn('erp_activity_log user_removed', actInsErr.message);
    }
  }

  const { data: mgrs, error: mgrErr } = await admin.from('erp_profiles').select('id').in('role', ['admin', 'team_lead']);
  if (!mgrErr && mgrs?.length) {
    const body =
      teamMemberIdsRemoved.length > 0
        ? `${removedLabel} and ${teamMemberIdsRemoved.length} client team member${teamMemberIdsRemoved.length === 1 ? '' : 's'} were removed.`
        : `${removedLabel} was removed.`;
    const notifRows = mgrs.map((m) => ({
      user_id: m.id,
      title: 'User removed from workspace',
      body,
      read: false,
      link: '/erp/admin/trash',
    }));
    const { error: nErr } = await admin.from('erp_notifications').insert(notifRows);
    if (nErr) {
      console.warn('erp_notifications user_removed', nErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    teamMembersRemoved: teamMemberIdsRemoved.length,
  });
}
