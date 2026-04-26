import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { erpInvitePublicBaseUrl } from '../../../../lib/erp-invite-server';
import { sendErpTaskAssignedEmail } from '../../../../lib/erp-resend';

/**
 * Notify the assignee when a project member assigns them to a task.
 * Uses service role insert (same pattern as /api/erp/notify-message).
 */
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const taskId = body?.taskId;
  const previousAssigneeId = body?.previousAssigneeId ?? null;
  const assigneeIdsFromBody = Array.isArray(body?.assigneeIds) ? body.assigneeIds : null;
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: task, error: taskErr } = await admin
    .from('erp_tasks')
    .select('id, title, assignee_id, assignee_ids, project_id')
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const taskAssigneeIds = Array.isArray(task.assignee_ids) ? task.assignee_ids.filter(Boolean) : [];
  const legacyAssigneeId = task.assignee_id || null;
  const candidates =
    assigneeIdsFromBody && assigneeIdsFromBody.length
      ? assigneeIdsFromBody.filter((x) => typeof x === 'string' && x)
      : (taskAssigneeIds.length ? taskAssigneeIds : legacyAssigneeId ? [legacyAssigneeId] : []);

  const uniqueAssignees = [...new Set(candidates.map(String))].filter((id) => id && id !== user.id);
  if (uniqueAssignees.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_assignee_or_self' });
  }

  const { data: actorMember } = await admin
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', task.project_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!actorMember) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_project_member' });
  }

  const { data: actorProfile } = await admin.from('erp_profiles').select('full_name').eq('id', user.id).maybeSingle();

  const { data: project } = await admin.from('erp_projects').select('name').eq('id', task.project_id).maybeSingle();
  const projectName = project?.name || 'Project';
  const actorName = (actorProfile?.full_name && String(actorProfile.full_name).trim()) || user.email?.split('@')[0] || 'Someone';
  const title = `Assigned: ${(task.title || 'Task').slice(0, 120)}`;
  const bodyText = `${actorName} assigned you to this task in ${projectName}.`.slice(0, 500);

  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const link = `${base}/erp/projects/${task.project_id}`;

  let notified = 0;
  let emailed = 0;
  for (const assigneeId of uniqueAssignees) {
    if (previousAssigneeId != null && String(previousAssigneeId) === String(assigneeId)) {
      continue;
    }

    const { error: insErr } = await admin.from('erp_notifications').insert({
      user_id: assigneeId,
      title,
      body: bodyText,
      read: false,
      link,
    });
    if (insErr) {
      console.warn('erp_notifications task assignment', insErr.message);
      continue;
    }
    notified += 1;

    const { data: assigneeAuth, error: assigneeAuthErr } = await admin.auth.admin.getUserById(assigneeId);
    const assigneeEmail = assigneeAuth?.user?.email;
    if (!assigneeAuthErr && assigneeEmail) {
      const mail = await sendErpTaskAssignedEmail({
        to: assigneeEmail,
        taskTitle: task.title || 'Task',
        projectName,
        assignerName: actorName,
        projectUrl: link,
      });
      if (mail?.ok) emailed += 1;
      if (!mail?.ok && mail?.error && mail.error !== 'Email not configured') {
        console.warn('sendErpTaskAssignedEmail', mail.error);
      }
    }
  }

  return NextResponse.json({ ok: true, notified, emailed });
}
