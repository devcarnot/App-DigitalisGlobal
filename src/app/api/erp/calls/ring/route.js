import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { sendPushToUser } from '../../../../../lib/erp-push-server';
import { erpInvitePublicBaseUrl } from '../../../../../lib/erp-invite-server';
import { erpNotificationRelativeLink } from '../../../../../lib/erp-notification-link';

export const runtime = 'nodejs';

const INTERNAL_ROLES = new Set(['admin', 'team_lead', 'team_member']);

/**
 * Notify recipient(s) that the caller has just opened a call room.
 * Inserts an `erp_notifications` row per recipient (drives in-app realtime banner +
 * the existing service-worker push pipeline) and fires Web Push for offline/other-tab.
 *
 * Caller is responsible for first calling /api/erp/calls/jitsi-room. This endpoint
 * does not mint a JWT — recipients regenerate their own when they answer (rooms are
 * deterministic per DM / group).
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!INTERNAL_ROLES.has(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const peerUserId = typeof body.peerUserId === 'string' ? body.peerUserId : null;
  const groupId = typeof body.groupId === 'string' ? body.groupId : null;
  const audioOnly = Boolean(body.audioOnly);

  if ((Boolean(peerUserId) && Boolean(groupId)) || (!peerUserId && !groupId)) {
    return NextResponse.json({ error: 'Provide exactly one of peerUserId or groupId' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const callerName = (profile.full_name && String(profile.full_name).trim()) || user.email || 'Someone';
  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const callKindLabel = audioOnly ? 'voice call' : 'video call';

  let recipientIds = [];
  let title = '';
  let link = '';

  if (peerUserId) {
    if (peerUserId === user.id) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
    }
    const { data: peer } = await admin.from('erp_profiles').select('id, role').eq('id', peerUserId).maybeSingle();
    if (!peer?.id || !INTERNAL_ROLES.has(peer.role)) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 403 });
    }
    recipientIds = [peerUserId];
    title = `Incoming call from ${callerName}`;
    link = erpNotificationRelativeLink(
      `/erp/messages?with=${encodeURIComponent(user.id)}&join=1${audioOnly ? '&audio=1' : ''}`,
    );
  } else {
    const { data: mem } = await admin
      .from('erp_message_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mem) {
      return NextResponse.json({ error: 'Not a group member' }, { status: 403 });
    }
    const { data: groupRow } = await admin
      .from('erp_message_groups')
      .select('id, name')
      .eq('id', groupId)
      .maybeSingle();
    const { data: members } = await admin
      .from('erp_message_group_members')
      .select('user_id')
      .eq('group_id', groupId);
    recipientIds = (members || []).map((m) => m.user_id).filter((id) => id && id !== user.id);
    const groupLabel = groupRow?.name ? `“${groupRow.name}”` : 'group';
    title = `Incoming group call from ${callerName} — ${groupLabel}`;
    link = erpNotificationRelativeLink(
      `/erp/messages?group=${encodeURIComponent(groupId)}&join=1${audioOnly ? '&audio=1' : ''}`,
    );
  }

  if (!recipientIds.length) {
    return NextResponse.json({ ok: true, notified: 0, reason: 'no_recipients' });
  }

  const notifBody = audioOnly
    ? `${callerName} is calling. Tap to answer.`
    : `${callerName} wants to start a ${callKindLabel}. Tap to answer.`;

  const rows = recipientIds.map((uid) => ({
    user_id: uid,
    title,
    body: notifBody,
    link,
  }));

  const { error: insertErr } = await admin.from('erp_notifications').insert(rows);
  if (insertErr) {
    console.error('[calls/ring] notification insert failed:', insertErr.message);
  }

  await Promise.all(
    recipientIds.map((uid) =>
      sendPushToUser({
        userId: uid,
        payload: {
          title,
          body: notifBody,
          url: `${base}${link}`,
          tag: `erp-call:${user.id}:${groupId || peerUserId}`,
          requireInteraction: true,
          renotify: true,
          actions: [
            { action: 'answer', title: 'Answer' },
            { action: 'decline', title: 'Decline' },
          ],
          icon: '/icons/pwa-192.png',
          badge: '/icons/pwa-192.png',
        },
      }).catch(() => {}),
    ),
  );

  return NextResponse.json({ ok: true, notified: recipientIds.length });
}
