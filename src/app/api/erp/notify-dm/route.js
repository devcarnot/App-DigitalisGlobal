import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { sendErpDirectMessageEmail } from '../../../../lib/erp-resend';
import { erpInvitePublicBaseUrl } from '../../../../lib/erp-invite-server';
import { sendPushToUser } from '../../../../lib/erp-push-server';
import { erpNotificationRelativeLink } from '../../../../lib/erp-notification-link';

/** In-memory throttle (best-effort on serverless). */
const dmEmailThrottle = new Map();

/** Skip email when recipient was active recently (heartbeat ~45s). */
const RECENTLY_ACTIVE_SKIP_MS = 70 * 1000;
const THROTTLE_MS = 30 * 1000;

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

  const messageId = body.messageId;
  if (!messageId || typeof messageId !== 'string') {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  }

  const supabase = createSupabaseUserClient(accessToken);
  const { data: msg, error: msgErr } = await supabase
    .from('erp_direct_messages')
    .select('id, sender_id, recipient_id, body, attachment_path, attachment_name, created_at, attachments')
    .eq('id', messageId)
    .maybeSingle();

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  if (msg.sender_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const recipientId = msg.recipient_id;
  if (!recipientId || recipientId === user.id) {
    return NextResponse.json({ ok: true, emailed: false, reason: 'skipped_recipient' });
  }

  const { data: senderProfile } = await supabase.from('erp_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const senderName = senderProfile?.full_name || user.email || 'Someone';

  const bodyText = typeof msg.body === 'string' ? msg.body.trim() : '';
  let snippet = bodyText ? bodyText.slice(0, 200) : '';
  if (!snippet) {
    const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
    const n = atts.length;
    if (n > 1) {
      snippet = `📎 ${n} files`.slice(0, 200);
    } else if (n === 1 && atts[0] && typeof atts[0] === 'object') {
      const name = atts[0].name != null ? String(atts[0].name).trim() : '';
      snippet = name ? `📎 ${name}`.slice(0, 200) : 'Sent a file';
    } else if (msg.attachment_path) {
      const name = msg.attachment_name ? String(msg.attachment_name).trim() : '';
      snippet = name ? `📎 ${name}`.slice(0, 200) : 'Sent a file';
    }
  }
  if (!snippet) snippet = 'New message';

  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const messagesPath = erpNotificationRelativeLink(
    `/erp/messages?with=${encodeURIComponent(msg.sender_id)}`,
  );
  const messagesUrl = `${base}${messagesPath}`;

  const now = Date.now();

  const { data: recipientProfile } = await admin
    .from('erp_profiles')
    .select('last_active_at, notify_email_dm, notify_push_dm, notify_in_app_dm')
    .eq('id', recipientId)
    .maybeSingle();

  if (recipientProfile?.notify_in_app_dm !== false) {
    const { error: inAppErr } = await admin.from('erp_notifications').insert({
      user_id: recipientId,
      title: `Direct message from ${senderName}`,
      body: String(snippet || '').slice(0, 500),
      read: false,
      link: messagesPath,
    });
    if (inAppErr) {
      console.warn('erp_notifications dm', inAppErr.message);
    }
  }

  const last = recipientProfile?.last_active_at ? new Date(recipientProfile.last_active_at).getTime() : 0;
  const recentlyActive = last > 0 && now - last < RECENTLY_ACTIVE_SKIP_MS;
  if (recentlyActive) {
    return NextResponse.json({ ok: true, emailed: 0, reason: 'recipient_active' });
  }

  if (recipientProfile?.notify_push_dm !== false) {
    await sendPushToUser({
      userId: recipientId,
      payload: {
        title: `Direct message from ${senderName}`,
        body: String(snippet || '').slice(0, 140),
        url: messagesUrl,
      },
    });
  }

  if (recipientProfile?.notify_email_dm === false) {
    return NextResponse.json({ ok: true, emailed: 0, reason: 'email_disabled' });
  }

  const throttleKey = `${recipientId}:${msg.sender_id}`;
  const lastSent = dmEmailThrottle.get(throttleKey) || 0;
  if (now - lastSent < THROTTLE_MS) {
    return NextResponse.json({ ok: true, emailed: 0, reason: 'throttled' });
  }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(recipientId);
  if (authErr || !authData?.user?.email) {
    return NextResponse.json({ ok: true, emailed: 0, reason: 'no_email' });
  }

  const r = await sendErpDirectMessageEmail({
    to: authData.user.email,
    senderName,
    snippet,
    messagesUrl,
  });

  if (r.ok) {
    dmEmailThrottle.set(throttleKey, now);
    return NextResponse.json({ ok: true, emailed: 1 });
  }

  return NextResponse.json({ ok: true, emailed: 0, reason: r.error || 'send_failed' });
}
