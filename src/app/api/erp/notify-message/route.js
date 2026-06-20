import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { sendErpNewMessageEmail } from '../../../../lib/erp-resend';
import { erpInvitePublicBaseUrl } from '../../../../lib/erp-invite-server';
import { parseMentionedUserIdsFromBody } from '../../../../lib/erp-mention-notify';
import { sendPushToUser } from '../../../../lib/erp-push-server';
import { erpNotificationRelativeLink } from '../../../../lib/erp-notification-link';

/** In-memory throttle (best-effort on serverless). */
const messageEmailThrottle = new Map();

/** Skip email only if user pinged ERP recently (heartbeat ~45s). Logged-out / offline users get mail. */
const RECENTLY_ACTIVE_SKIP_MS = 70 * 1000;
/** Avoid spamming the same inbox for the same project. */
const THROTTLE_MS = 30 * 1000;

/** Run async tasks with a concurrency cap. */
async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

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
    .from('erp_messages')
    .select('id, project_id, user_id, body, attachments, created_at, channel_id')
    .eq('id', messageId)
    .maybeSingle();

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  if (msg.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: channel } = await admin
    .from('erp_project_channels')
    .select('id, is_general, project_id')
    .eq('id', msg.channel_id)
    .maybeSingle();

  const isGeneral = channel?.is_general === true;

  const { data: project } = await supabase.from('erp_projects').select('name').eq('id', msg.project_id).maybeSingle();
  const projectName = project?.name || 'Project';

  const { data: members, error: memErr } = await supabase
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', msg.project_id);

  if (memErr || !members?.length) {
    return NextResponse.json({ ok: true, emailed: 0, reason: 'no_members' });
  }

  let notifyMembers = members;
  if (!isGeneral && channel?.id) {
    const { data: chMembers } = await admin
      .from('erp_project_channel_members')
      .select('user_id')
      .eq('channel_id', channel.id);
    const allowed = new Set((chMembers || []).map((r) => r.user_id).filter(Boolean));
    notifyMembers = members.filter((m) => allowed.has(m.user_id));
  }

  const memberIds = notifyMembers.map((m) => m.user_id).filter(Boolean);
  const { data: profiles } = await admin
    .from('erp_profiles')
    .select(
      'id, full_name, last_active_at, notify_email_project_mention, notify_in_app_project_chat, notify_in_app_mention, notify_push_project_mention',
    )
    .in('id', memberIds);

  const nameByUserId = {};
  const prefs = {};
  const lastActiveByUserId = {};
  for (const p of profiles || []) {
    nameByUserId[p.id] = (p.full_name || 'User').trim() || 'User';
    prefs[p.id] = {
      notify_email_project_mention: p.notify_email_project_mention !== false,
      notify_in_app_project_chat: p.notify_in_app_project_chat !== false,
      notify_in_app_mention: p.notify_in_app_mention !== false,
      notify_push_project_mention: p.notify_push_project_mention !== false,
    };
    if (p.last_active_at) lastActiveByUserId[p.id] = new Date(p.last_active_at).getTime();
  }

  const { data: senderProfile } = await supabase.from('erp_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const senderName = senderProfile?.full_name || user.email || 'Someone';

  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const projectPath = erpNotificationRelativeLink(
    `/erp/projects/${msg.project_id}?channel=${encodeURIComponent(msg.channel_id)}`,
  );
  const projectUrl = `${base}${projectPath}`;

  const bodyText = typeof msg.body === 'string' ? msg.body.trim() : '';
  let snippet = bodyText ? bodyText.slice(0, 200) : '';
  if (!snippet && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const names = msg.attachments.map((a) => a?.name).filter(Boolean);
    snippet = names.length ? `📎 ${names.join(', ')}`.slice(0, 200) : 'New message';
  }
  if (!snippet) snippet = 'New message';

  const mentionedIds = parseMentionedUserIdsFromBody(msg.body, notifyMembers, nameByUserId);
  const hasMention = mentionedIds.length > 0;

  /** In-app bell: General = optional broadcast; other channels or @mentions = mentions only. */
  const inAppRecipientIds = new Set();
  if (isGeneral && !hasMention) {
    for (const row of notifyMembers) {
      const uid = row.user_id;
      if (uid === user.id) continue;
      if (prefs[uid]?.notify_in_app_project_chat !== false) inAppRecipientIds.add(uid);
    }
  } else if (hasMention) {
    for (const uid of mentionedIds) {
      if (uid === user.id) continue;
      if (prefs[uid]?.notify_in_app_mention !== false) inAppRecipientIds.add(uid);
    }
  }

  const notifTitle = hasMention ? `Mention in ${projectName}` : `New message in ${projectName}`;
  const notifRows = [];
  for (const uid of inAppRecipientIds) {
    notifRows.push({
      user_id: uid,
      title: notifTitle,
      body: `${senderName}: ${snippet}`.slice(0, 500),
      read: false,
      link: projectPath,
    });
  }
  if (notifRows.length > 0) {
    const { error: notifErr } = await admin.from('erp_notifications').insert(notifRows);
    if (notifErr) {
      console.warn('erp_notifications insert', notifErr.message);
    }
  }

  const now = Date.now();

  /** Email: only @mentions, and only members who opted in. */
  const emailTargets = mentionedIds.filter((uid) => uid !== user.id && prefs[uid]?.notify_email_project_mention !== false);
  const pushTargets = mentionedIds.filter((uid) => uid !== user.id && prefs[uid]?.notify_push_project_mention !== false);

  const emailResults = await mapWithConcurrency(emailTargets, 5, async (uid) => {
    const last = lastActiveByUserId[uid] || 0;
    if (last > 0 && now - last < RECENTLY_ACTIVE_SKIP_MS) {
      return 0;
    }

    const throttleKey = `${uid}:${msg.project_id}:mention`;
    const lastSent = messageEmailThrottle.get(throttleKey) || 0;
    if (now - lastSent < THROTTLE_MS) {
      return 0;
    }

    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(uid);
    if (authErr || !authData?.user?.email) {
      return 0;
    }

    const r = await sendErpNewMessageEmail({
      to: authData.user.email,
      projectName,
      senderName,
      snippet,
      projectUrl,
      kind: 'mention',
    });

    if (r.ok) {
      messageEmailThrottle.set(throttleKey, now);
      return 1;
    }
    return 0;
  });
  const emailed = emailResults.reduce((sum, n) => sum + n, 0);

  await mapWithConcurrency(pushTargets, 8, async (uid) => {
    const last = lastActiveByUserId[uid] || 0;
    if (last > 0 && now - last < RECENTLY_ACTIVE_SKIP_MS) {
      return;
    }
    await sendPushToUser({
      userId: uid,
      payload: {
        title: `Mention in ${projectName}`,
        body: `${senderName}: ${snippet}`.slice(0, 140),
        url: projectUrl,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    emailed,
    notified: notifRows.length,
    mentions: mentionedIds.length,
    channelGeneral: isGeneral,
  });
}
