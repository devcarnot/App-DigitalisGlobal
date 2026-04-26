import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { sendPushToUser } from '../../../../../lib/erp-push-server';
import { erpInvitePublicBaseUrl } from '../../../../../lib/erp-invite-server';

export const runtime = 'nodejs';

const INTERNAL_ROLES = new Set(['admin', 'team_lead', 'team_member']);
const VALID_KINDS = new Set(['decline', 'missed', 'busy']);

/**
 * Recipient → caller feedback for an in-flight ring. Inserts a transient
 * notification row for the caller. Caller's ErpShell shows it as an ephemeral
 * toast (not the standard "Open" toast) and does not beep for it.
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
  const callerId = typeof body.callerId === 'string' ? body.callerId : null;
  const kind = typeof body.kind === 'string' ? body.kind : null;
  const audioOnly = Boolean(body.audioOnly);
  const groupId = typeof body.groupId === 'string' ? body.groupId : null;

  if (!callerId || callerId === user.id) {
    return NextResponse.json({ error: 'Invalid callerId' }, { status: 400 });
  }
  if (!kind || !VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Authorization: the caller (of this endpoint = the call recipient) must
  // actually be a plausible target of a call from `callerId`. Without this
  // check, any authenticated user could spam notifications/chat rows by
  // posting arbitrary callerId/groupId combinations.
  const { data: callerProfile } = await admin
    .from('erp_profiles')
    .select('id, role')
    .eq('id', callerId)
    .maybeSingle();
  if (!callerProfile?.id || !INTERNAL_ROLES.has(callerProfile.role)) {
    return NextResponse.json({ error: 'Unknown caller' }, { status: 403 });
  }
  if (groupId) {
    const { data: bothMembers } = await admin
      .from('erp_message_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .in('user_id', [user.id, callerId]);
    const ids = new Set((bothMembers || []).map((m) => m.user_id));
    if (!ids.has(user.id) || !ids.has(callerId)) {
      return NextResponse.json({ error: 'Not a group member' }, { status: 403 });
    }
  }

  const myName = (profile.full_name && String(profile.full_name).trim()) || user.email || 'Someone';
  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');

  let title;
  let bodyText;
  if (kind === 'decline') {
    title = `Call declined by ${myName}`;
    bodyText = audioOnly ? 'They declined the voice call.' : 'They declined the video call.';
  } else if (kind === 'busy') {
    title = `Busy: ${myName}`;
    bodyText = 'They are in another call.';
  } else {
    title = `No answer from ${myName}`;
    bodyText = 'They did not pick up.';
  }

  const link = groupId
    ? `${base}/erp/messages?group=${encodeURIComponent(groupId)}`
    : `${base}/erp/messages?with=${encodeURIComponent(user.id)}`;

  await admin.from('erp_notifications').insert({
    user_id: callerId,
    title,
    body: bodyText,
    link,
  });

  // Persistent call log row in the shared chat thread. Missed + declined both show as
  // "missed" to the recipient since from their point of view they didn't join; the
  // caller's row shows the precise status.
  const callStatus = kind === 'decline' ? 'declined' : kind === 'busy' ? 'busy' : 'missed';
  const meta = {
    audio_only: audioOnly,
    status: callStatus,
    caller_id: callerId,
  };
  try {
    if (groupId) {
      await admin.from('erp_group_messages').insert({
        group_id: groupId,
        sender_id: callerId,
        body: '',
        kind: 'call',
        meta,
      });
    } else {
      await admin.from('erp_direct_messages').insert({
        sender_id: callerId,
        recipient_id: user.id,
        body: '',
        kind: 'call',
        meta,
      });
    }
  } catch {
    /* best-effort — never block the signal response on chat-log persistence */
  }

  // Best-effort web push so the caller sees the result even if their tab was backgrounded.
  if (kind !== 'missed') {
    sendPushToUser({
      userId: callerId,
      payload: {
        title,
        body: bodyText,
        url: link,
        tag: `erp-call-signal:${user.id}`,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
