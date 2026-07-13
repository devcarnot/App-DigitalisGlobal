import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { fetchMergedRbacGrantsForUser } from '../../../../lib/erp-rbac-server';
import { erpRbacCan } from '../../../../lib/erp-rbac-modules';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { isSupabaseSchemaMissingError } from '../../../../lib/supabase-errors';

export const runtime = 'nodejs';

const REMINDER_COLUMNS =
  'id, created_by, assigned_to, title, body, remind_at, reminder_sent_at, completed_at, created_at, updated_at';

function isMissingRemindersTable(err) {
  if (isSupabaseSchemaMissingError(err)) return true;
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('erp_reminders');
}

function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function parseRemindAt(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseReminderFields(body) {
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const reminderBody = typeof body?.body === 'string' ? body.body.trim().slice(0, 4000) : '';
  const remindAt = parseRemindAt(body?.remindAt || body?.remind_at);
  const assignedTo = isUuid(body?.assignedTo || body?.assigned_to) ? body.assignedTo || body.assigned_to : null;
  return { title, reminderBody, remindAt, assignedTo };
}

/**
 * GET /api/erp/reminders?range=upcoming|past|all
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'reminders', 'view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || 'upcoming';
  const nowMs = Date.now();

  const { data, error } = await supabase
    .from('erp_reminders')
    .select(REMINDER_COLUMNS)
    .order('remind_at', { ascending: range !== 'past' })
    .limit(200);

  if (error) {
    if (isMissingRemindersTable(error)) {
      return NextResponse.json({ reminders: [], profilesById: {}, notProvisioned: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let rows = data || [];
  if (range === 'upcoming') {
    rows = rows.filter((r) => !r.completed_at && new Date(r.remind_at).getTime() >= nowMs);
    rows.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
  } else if (range === 'past') {
    rows = rows.filter((r) => r.completed_at || new Date(r.remind_at).getTime() < nowMs);
    rows.sort((a, b) => new Date(b.remind_at).getTime() - new Date(a.remind_at).getTime());
  }
  const profileIds = [...new Set(rows.flatMap((r) => [r.created_by, r.assigned_to]).filter(Boolean))];
  const admin = createSupabaseAdmin();
  const reader = admin || supabase;
  /** @type {Record<string, { full_name?: string | null }>} */
  const profilesById = {};

  if (profileIds.length > 0) {
    const { data: profiles } = await reader
      .from('erp_profiles')
      .select('id, full_name')
      .in('id', profileIds);
    for (const p of profiles || []) {
      profilesById[p.id] = { full_name: p.full_name };
    }
  }

  return NextResponse.json({ reminders: rows, profilesById });
}

/**
 * POST /api/erp/reminders
 * body: { title, body?, remindAt, assignedTo? }
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'reminders', 'create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const { title, reminderBody, remindAt, assignedTo } = parseReminderFields(body);
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!remindAt) {
    return NextResponse.json({ error: 'Reminder date and time are required' }, { status: 400 });
  }

  const isAdmin = isErpGlobalAdmin(profile.role);
  const targetUserId = assignedTo || user.id;

  if (targetUserId !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Only Super Admin can assign reminders to other people' }, { status: 403 });
  }

  if (new Date(remindAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Reminder must be scheduled in the future' }, { status: 400 });
  }

  const row = {
    created_by: user.id,
    assigned_to: targetUserId,
    title,
    body: reminderBody || null,
    remind_at: remindAt,
  };

  const { data: created, error } = await supabase.from('erp_reminders').insert(row).select(REMINDER_COLUMNS).single();

  if (error) {
    if (isMissingRemindersTable(error)) {
      return NextResponse.json({ error: 'Reminders table is not set up yet.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ reminder: created });
}
