import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { ensureProjectTaskAnchor } from '../../../../../lib/erp-project-task-anchor';
import { isTaskDueDateNotInPast } from '../../../../../lib/task-dates';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';
import { erpRbacCan } from '../../../../../lib/erp-rbac-modules';
import { notifyErpTaskAssignees } from '../../../../../lib/erp-task-assignment-notify';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Adds a real task on a project: ensures the hidden anchor root exists, then inserts a child row.
 * Client cannot set parent_task_id; extra fields are ignored.
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile?.role, user.id);
  if (!erpRbacCan(grants, 'tasks', 'create')) {
    return NextResponse.json({ error: 'You cannot create tasks.' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const dueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';
  const startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
  const rawPriority = typeof body.priority === 'string' ? body.priority.trim().toLowerCase() : '';
  const rawAssigneeId = typeof body.assigneeId === 'string' ? body.assigneeId.trim() : '';
  const rawAssigneeIds = Array.isArray(body.assigneeIds) ? body.assigneeIds : [];
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];

  const ALLOWED_PRIORITIES = new Set(['critical', 'high', 'medium', 'normal']);
  if (rawPriority && !ALLOWED_PRIORITIES.has(rawPriority)) {
    return NextResponse.json({ error: 'Invalid priority.' }, { status: 400 });
  }

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  }
  if (!title || title.length > 500) {
    return NextResponse.json({ error: 'Enter a task title (max 500 characters).' }, { status: 400 });
  }
  if (description.length > 8000) {
    return NextResponse.json({ error: 'Description is too long.' }, { status: 400 });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (dueDate && !dateRe.test(dueDate)) {
    return NextResponse.json({ error: 'Invalid due date.' }, { status: 400 });
  }
  if (startDate && !dateRe.test(startDate)) {
    return NextResponse.json({ error: 'Invalid start date.' }, { status: 400 });
  }
  if (startDate && dueDate && startDate > dueDate) {
    return NextResponse.json({ error: 'Due date must be on or after start date.' }, { status: 400 });
  }
  if (dueDate && !isTaskDueDateNotInPast(dueDate)) {
    return NextResponse.json({ error: 'Due date cannot be in the past.' }, { status: 400 });
  }

  const attachments = [];
  for (const a of rawAttachments.slice(0, 12)) {
    if (!a || typeof a !== 'object') continue;
    const path = typeof a.path === 'string' ? a.path.trim() : '';
    const name = typeof a.name === 'string' ? a.name.trim().slice(0, 200) : '';
    const mime = typeof a.mime === 'string' ? a.mime.trim().slice(0, 120) : '';
    if (!path || !name) continue;
    const prefix = `${projectId}/${user.id}/`;
    if (!path.startsWith(prefix)) {
      return NextResponse.json({ error: 'Invalid attachment path.' }, { status: 400 });
    }
    attachments.push({ path, name, mime: mime || 'application/octet-stream' });
  }

  const supabase = createSupabaseUserClient(token);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: proj, error: pErr } = await supabase.from('erp_projects').select('name').eq('id', projectId).maybeSingle();
  if (pErr || !proj) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
  }

  const { data: projectMems, error: pmErr } = await supabase
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', projectId);
  if (pmErr) {
    return NextResponse.json({ error: pmErr.message }, { status: 400 });
  }
  const projectMemberIds = new Set((projectMems || []).map((m) => String(m.user_id)).filter(Boolean));

  let assignee_ids = [
    ...new Set(
      [
        ...rawAssigneeIds.filter((id) => typeof id === 'string' && UUID_RE.test(id.trim())).map((id) => id.trim()),
        ...(rawAssigneeId && UUID_RE.test(rawAssigneeId) ? [rawAssigneeId] : []),
      ].filter((id) => projectMemberIds.has(id)),
    ),
  ].slice(0, 24);
  const assignee_id = assignee_ids.length ? assignee_ids[0] : null;

  let anchorId;
  try {
    anchorId = await ensureProjectTaskAnchor(supabase, {
      projectId,
      userId: user.id,
      projectName: proj.name,
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Could not prepare project' }, { status: 400 });
  }

  const insertPayload = {
    project_id: projectId,
    parent_task_id: anchorId,
    title,
    status: 'open',
    created_by: user.id,
    assignee_id,
    assignee_ids: assignee_ids.length ? assignee_ids : [],
    due_date: dueDate || null,
    tagged_user_ids: [],
    attachments,
  };
  if (description) insertPayload.description = description;
  if (startDate) insertPayload.start_date = startDate;
  if (rawPriority) insertPayload.priority = rawPriority;

  const { data: row, error: insErr } = await supabase.from('erp_tasks').insert(insertPayload).select('id, parent_task_id').single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  if (row?.parent_task_id !== anchorId) {
    await supabase.from('erp_tasks').delete().eq('id', row.id);
    return NextResponse.json({ error: 'Task was not created under the project anchor.' }, { status: 500 });
  }

  void supabase
    .from('erp_activity_log')
    .insert({
      project_id: projectId,
      user_id: user.id,
      action: 'task_created',
      meta: { title, from: 'my_tasks_add_modal' },
    })
    .then(() => {});

  if (assignee_ids.length > 0 && row?.id) {
    const notifyIds = assignee_ids.filter((id) => id !== user.id);
    if (notifyIds.length > 0) {
      void notifyErpTaskAssignees({
        actorUserId: user.id,
        actorProfile: profile,
        actorEmail: user.email,
        taskId: row.id,
        assigneeIds: notifyIds,
        previousAssigneeId: null,
      }).catch((err) => {
        console.warn('notifyErpTaskAssignees create-main', err?.message || err);
      });
    }
  }

  return NextResponse.json({ ok: true, id: row.id });
}
