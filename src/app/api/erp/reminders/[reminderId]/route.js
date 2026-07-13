import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';
import { erpRbacCan } from '../../../../../lib/erp-rbac-modules';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { isSupabaseSchemaMissingError } from '../../../../../lib/supabase-errors';

export const runtime = 'nodejs';

const REMINDER_COLUMNS =
  'id, created_by, assigned_to, title, body, remind_at, reminder_sent_at, completed_at, created_at, updated_at';

function isMissingRemindersTable(err) {
  if (isSupabaseSchemaMissingError(err)) return true;
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('erp_reminders');
}

function parseRemindAt(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * PATCH /api/erp/reminders/[reminderId]
 * body: { title?, body?, remindAt?, completed?: boolean }
 */
export async function PATCH(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'reminders', 'edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const reminderId = params?.reminderId;
  if (!reminderId) {
    return NextResponse.json({ error: 'Missing reminder id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = {};

  if (typeof body?.title === 'string') {
    const title = body.title.trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    patch.title = title;
  }

  if (typeof body?.body === 'string') {
    patch.body = body.body.trim().slice(0, 4000) || null;
  }

  if (body?.remindAt != null || body?.remind_at != null) {
    const remindAt = parseRemindAt(body.remindAt || body.remind_at);
    if (!remindAt) return NextResponse.json({ error: 'Invalid reminder date' }, { status: 400 });
    if (new Date(remindAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Reminder must be scheduled in the future' }, { status: 400 });
    }
    patch.remind_at = remindAt;
    patch.reminder_sent_at = null;
  }

  if (body?.completed === true) {
    patch.completed_at = new Date().toISOString();
  } else if (body?.completed === false) {
    patch.completed_at = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await supabase
    .from('erp_reminders')
    .select('id, created_by, assigned_to, reminder_sent_at')
    .eq('id', reminderId)
    .maybeSingle();

  if (loadErr) {
    if (isMissingRemindersTable(loadErr)) {
      return NextResponse.json({ error: 'Reminders table is not set up yet.' }, { status: 503 });
    }
    return NextResponse.json({ error: loadErr.message }, { status: 400 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
  }

  const isAdmin = isErpGlobalAdmin(profile.role);
  const isCreator = existing.created_by === user.id;
  const isAssignee = existing.assigned_to === user.id;
  const onlyCompleting = Object.keys(patch).length === 1 && patch.completed_at != null;

  if (!isAdmin && !isCreator && !(isAssignee && onlyCompleting)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isAdmin && !isCreator && isAssignee && !onlyCompleting) {
    return NextResponse.json({ error: 'Only the creator can edit this reminder' }, { status: 403 });
  }

  if (patch.remind_at && existing.reminder_sent_at) {
    return NextResponse.json({ error: 'Cannot reschedule a reminder that has already fired' }, { status: 400 });
  }

  const { data: updated, error: updErr } = await supabase
    .from('erp_reminders')
    .update(patch)
    .eq('id', reminderId)
    .select(REMINDER_COLUMNS)
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  return NextResponse.json({ reminder: updated });
}

/**
 * DELETE /api/erp/reminders/[reminderId]
 */
export async function DELETE(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'reminders', 'delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const reminderId = params?.reminderId;
  if (!reminderId) {
    return NextResponse.json({ error: 'Missing reminder id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { error } = await supabase.from('erp_reminders').delete().eq('id', reminderId);

  if (error) {
    if (isMissingRemindersTable(error)) {
      return NextResponse.json({ error: 'Reminders table is not set up yet.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
