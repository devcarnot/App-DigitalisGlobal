/**
 * Service-role cleanup of ERP rows tied to auth user ids (before auth.admin.deleteUser).
 * Does not delete erp_invitations: callers handle invites per scenario.
 */

const CHUNK = 80;

/**
 * Client team members on projects where `clientUserId` is the primary client (project role client).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} clientUserId
 * @returns {Promise<string[]>}
 */
export async function collectClientTeamMemberIdsForClient(admin, clientUserId) {
  if (!admin || !clientUserId) return [];

  const { data: clientProjects, error: cpErr } = await admin
    .from('erp_project_members')
    .select('project_id')
    .eq('user_id', clientUserId)
    .eq('role', 'client');
  if (cpErr) throw new Error(cpErr.message);

  const projectIds = [...new Set((clientProjects || []).map((r) => r.project_id).filter(Boolean))];
  if (projectIds.length === 0) return [];

  const peerUserIds = new Set();
  for (let i = 0; i < projectIds.length; i += CHUNK) {
    const slice = projectIds.slice(i, i + CHUNK);
    const { data: peers, error: pErr } = await admin
      .from('erp_project_members')
      .select('user_id')
      .in('project_id', slice);
    if (pErr) throw new Error(pErr.message);
    for (const row of peers || []) {
      if (row?.user_id && row.user_id !== clientUserId) peerUserIds.add(row.user_id);
    }
  }

  const candidateIds = [...peerUserIds];
  if (candidateIds.length === 0) return [];

  const teamIds = [];
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const slice = candidateIds.slice(i, i + CHUNK);
    const { data: profiles, error: profErr } = await admin
      .from('erp_profiles')
      .select('id')
      .in('id', slice)
      .eq('role', 'client_team_member');
    if (profErr) throw new Error(profErr.message);
    for (const p of profiles || []) {
      if (p?.id) teamIds.push(p.id);
    }
  }

  return teamIds;
}

export async function removeErpWorkspaceDataForUserIds(admin, targetIds) {
  if (!targetIds?.length) return { error: null };
  const ids = [...new Set(targetIds.filter(Boolean))];
  if (!ids.length) return { error: null };

  const { error: taskDelErr } = await admin.from('erp_tasks').delete().in('created_by', ids);
  if (taskDelErr) {
    return { error: `Could not remove tasks: ${taskDelErr.message}` };
  }

  const { error: assignErr } = await admin.from('erp_tasks').update({ assignee_id: null }).in('assignee_id', ids);
  if (assignErr) {
    return { error: `Could not unassign tasks: ${assignErr.message}` };
  }

  const { error: msgErr } = await admin.from('erp_messages').delete().in('user_id', ids);
  if (msgErr) {
    return { error: `Could not remove messages: ${msgErr.message}` };
  }

  const { error: actErr } = await admin.from('erp_activity_log').delete().in('user_id', ids);
  if (actErr) {
    return { error: `Could not clear activity: ${actErr.message}` };
  }

  const { error: notifErr } = await admin.from('erp_notifications').delete().in('user_id', ids);
  if (notifErr) {
    return { error: `Could not clear notifications: ${notifErr.message}` };
  }

  const { error: memErr } = await admin.from('erp_project_members').delete().in('user_id', ids);
  if (memErr) {
    return { error: `Could not remove project members: ${memErr.message}` };
  }

  const { error: projErr } = await admin.from('erp_projects').update({ created_by: null }).in('created_by', ids);
  if (projErr) {
    return { error: `Could not detach project creators: ${projErr.message}` };
  }

  await admin.from('erp_team_directory_emails').update({ created_by: null }).in('created_by', ids);

  return { error: null };
}

export async function deleteAuthUsersByIds(admin, targetIds) {
  const failures = [];
  let deleted = 0;
  for (const id of targetIds) {
    const { error: delErr } = await admin.auth.admin.deleteUser(id);
    if (delErr) {
      failures.push({ id, error: delErr.message });
    } else {
      deleted += 1;
    }
  }
  return { deleted, failures };
}
