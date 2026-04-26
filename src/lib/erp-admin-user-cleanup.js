/**
 * Service-role cleanup of ERP rows tied to auth user ids (before auth.admin.deleteUser).
 * Does not delete erp_invitations — callers handle invites per scenario.
 */

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
