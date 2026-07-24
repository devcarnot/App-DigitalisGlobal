import { createSupabaseAdmin } from './supabase-admin';
import { sendErpTaskAssignedEmail } from './erp-resend';
import { erpInvitePublicBaseUrl } from './erp-invite-server';
import { erpNotificationRelativeLink } from './erp-notification-link';
import { sendPushToUser } from './erp-push-server';
import { isErpGlobalAdmin } from './erp-roles';

/**
 * Notify assignees when they are added to a task (in-app bell, push, email).
 * Called from /api/erp/notify-task-assignment and task create APIs.
 */
export async function notifyErpTaskAssignees({
  actorUserId,
  actorProfile,
  actorEmail,
  taskId,
  assigneeIds,
  previousAssigneeId = null,
}) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: 'Server misconfigured' };
  }

  if (!taskId || typeof taskId !== 'string') {
    return { ok: false, error: 'taskId required' };
  }

  const { data: task, error: taskErr } = await admin
    .from('erp_tasks')
    .select('id, title, assignee_id, assignee_ids, project_id')
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr || !task) {
    return { ok: false, error: 'Task not found' };
  }

  const taskAssigneeIds = Array.isArray(task.assignee_ids) ? task.assignee_ids.filter(Boolean) : [];
  const legacyAssigneeId = task.assignee_id || null;
  const candidates =
    Array.isArray(assigneeIds) && assigneeIds.length
      ? assigneeIds.filter((x) => typeof x === 'string' && x)
      : taskAssigneeIds.length
        ? taskAssigneeIds
        : legacyAssigneeId
          ? [legacyAssigneeId]
          : [];

  const uniqueAssignees = [...new Set(candidates.map(String))].filter(
    (id) => id && id !== String(actorUserId),
  );
  if (uniqueAssignees.length === 0) {
    return { ok: true, skipped: true, reason: 'no_assignee_or_self', notified: 0, emailed: 0, pushed: 0 };
  }

  const { data: actorMember } = await admin
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', task.project_id)
    .eq('user_id', actorUserId)
    .maybeSingle();

  const actorIsAdmin = isErpGlobalAdmin(actorProfile?.role);
  if (!actorMember && !actorIsAdmin) {
    return { ok: true, skipped: true, reason: 'not_project_member', notified: 0, emailed: 0, pushed: 0 };
  }

  const { data: project } = await admin.from('erp_projects').select('name').eq('id', task.project_id).maybeSingle();
  const projectName = project?.name || 'Project';
  const actorName =
    (actorProfile?.full_name && String(actorProfile.full_name).trim()) ||
    (actorEmail && String(actorEmail).split('@')[0]) ||
    'Someone';
  const taskTitle = (task.title || 'Task').slice(0, 120);
  const title = `Assigned: ${taskTitle}`;
  const bodyText = `${actorName} assigned you to this task in ${projectName}.`.slice(0, 500);

  const projectPath = erpNotificationRelativeLink(`/erp/projects/${task.project_id}`);
  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const projectUrl = `${base}${projectPath}`;

  const { data: assigneeProfiles } = await admin
    .from('erp_profiles')
    .select('id, notify_push_project_mention')
    .in('id', uniqueAssignees);

  const pushAllowed = new Set(
    (assigneeProfiles || [])
      .filter((p) => p?.id && p.notify_push_project_mention !== false)
      .map((p) => String(p.id)),
  );

  let notified = 0;
  let emailed = 0;
  let pushed = 0;

  for (const assigneeId of uniqueAssignees) {
    if (previousAssigneeId != null && String(previousAssigneeId) === String(assigneeId)) {
      continue;
    }

    const { error: insErr } = await admin.from('erp_notifications').insert({
      user_id: assigneeId,
      title,
      body: bodyText,
      read: false,
      link: projectPath,
    });
    if (insErr) {
      console.warn('erp_notifications task assignment', insErr.message);
      continue;
    }
    notified += 1;

    if (pushAllowed.has(String(assigneeId))) {
      const pushResult = await sendPushToUser({
        userId: assigneeId,
        payload: {
          title: `Task assigned · ${projectName}`,
          body: `${actorName}: ${taskTitle}`.slice(0, 140),
          url: projectUrl,
        },
      });
      if (pushResult?.sent > 0) pushed += 1;
    }

    const { data: assigneeAuth, error: assigneeAuthErr } = await admin.auth.admin.getUserById(assigneeId);
    const assigneeEmail = assigneeAuth?.user?.email;
    if (!assigneeAuthErr && assigneeEmail) {
      const mail = await sendErpTaskAssignedEmail({
        to: assigneeEmail,
        taskTitle: task.title || 'Task',
        projectName,
        assignerName: actorName,
        projectUrl,
      });
      if (mail?.ok) emailed += 1;
      if (!mail?.ok && mail?.error && mail.error !== 'Email not configured') {
        console.warn('sendErpTaskAssignedEmail', mail.error);
      }
    }
  }

  return { ok: true, notified, emailed, pushed };
}
