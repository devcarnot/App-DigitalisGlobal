/**
 * Reminder delivery cron.
 *
 * Pulls reminders whose remind_at is due and which haven't been sent yet, then:
 *   1. Inserts an in-app erp_notifications row for the assignee.
 *   2. Best-effort web push to the assignee.
 *   3. Sets erp_reminders.reminder_sent_at = now() so subsequent cron runs
 *      don't double-send.
 *
 * Trigger every ~5 minutes from any external scheduler (same CRON_SECRET as
 * meeting reminders). Reminders may arrive up to ~5 min after remind_at.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { sendPushToUser } from '../../../../lib/erp-push-server';
import { erpInvitePublicBaseUrl } from '../../../../lib/erp-invite-server';

export const runtime = 'nodejs';

function cronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const q = request.nextUrl?.searchParams?.get('secret');
  return header === secret || bearer === secret || q === secret;
}

async function runReminders() {
  const admin = createSupabaseAdmin();
  if (!admin) return { status: 500, body: { error: 'Server misconfigured' } };

  const now = new Date();
  const upperBound = now.toISOString();

  const { data: reminders, error: rErr } = await admin
    .from('erp_reminders')
    .select('id, title, body, remind_at, assigned_to, created_by')
    .is('reminder_sent_at', null)
    .is('completed_at', null)
    .lte('remind_at', upperBound)
    .order('remind_at', { ascending: true })
    .limit(100);

  if (rErr) {
    return { status: 500, body: { error: rErr.message } };
  }

  if (!reminders || reminders.length === 0) {
    return { status: 200, body: { ok: true, reminded: 0 } };
  }

  const creatorIds = [...new Set(reminders.map((r) => r.created_by).filter(Boolean))];
  const creatorNameById = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await admin
      .from('erp_profiles')
      .select('id, full_name')
      .in('id', creatorIds);
    for (const p of creators || []) {
      creatorNameById[p.id] = p.full_name || 'Someone';
    }
  }

  const baseUrl = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const stamp = new Date().toISOString();
  let totalReminded = 0;

  for (const reminder of reminders) {
    const uid = reminder.assigned_to;
    if (!uid) continue;

    const titleSafe = (reminder.title || 'Reminder').slice(0, 80);
    const bodyText = (reminder.body || '').trim().slice(0, 200);
    const whenLabel = new Date(reminder.remind_at).toLocaleString();
    const link = `${baseUrl}/erp/reminders`;
    const fromName = creatorNameById[reminder.created_by];
    const notifBody = bodyText || (fromName && reminder.created_by !== uid ? `From ${fromName}` : `Scheduled for ${whenLabel}`);

    await admin.from('erp_notifications').insert({
      user_id: uid,
      title: `Reminder: ${titleSafe}`,
      body: notifBody.slice(0, 240),
      link,
    });

    await sendPushToUser({
      userId: uid,
      payload: {
        title: `Reminder: ${titleSafe}`.slice(0, 100),
        body: notifBody.slice(0, 140),
        url: link,
      },
    });

    await admin.from('erp_reminders').update({ reminder_sent_at: stamp }).eq('id', reminder.id);
    totalReminded += 1;
  }

  return {
    status: 200,
    body: {
      ok: true,
      processedReminders: reminders.length,
      reminded: totalReminded,
    },
  };
}

export async function POST(request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { status, body } = await runReminders();
  return NextResponse.json(body, { status });
}

export async function GET(request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { status, body } = await runReminders();
  return NextResponse.json(body, { status });
}
