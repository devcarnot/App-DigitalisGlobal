import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { notifyErpTaskAssignees } from '../../../../lib/erp-task-assignment-notify';

/**
 * Notify assignees when a project member assigns them to a task.
 */
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user, profile, error } = await getErpUserFromRequest(request);
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
  const assigneeIds = Array.isArray(body?.assigneeIds) ? body.assigneeIds : null;
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  }

  const result = await notifyErpTaskAssignees({
    actorUserId: user.id,
    actorProfile: profile,
    actorEmail: user.email,
    taskId,
    assigneeIds,
    previousAssigneeId,
  });

  if (result.error) {
    const status = result.error === 'Task not found' ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result);
}
