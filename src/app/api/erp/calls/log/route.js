import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const INTERNAL_ROLES = new Set(['admin', 'team_lead', 'team_member']);
const MAX_DURATION_SEC = 60 * 60 * 12; // 12h hard cap against bogus durations

/**
 * Caller-only: log a completed/answered call into the shared chat thread so
 * both participants see it in-line. Called by ErpDirectMessages when the Jitsi
 * modal fires `videoConferenceLeft` after at least one remote peer had joined.
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
  const rawDuration = Number(body.durationSec);
  const durationSec = Number.isFinite(rawDuration) ? Math.max(0, Math.min(Math.round(rawDuration), MAX_DURATION_SEC)) : 0;

  if (!peerUserId && !groupId) {
    return NextResponse.json({ error: 'Missing peerUserId or groupId' }, { status: 400 });
  }
  if (peerUserId && peerUserId === user.id) {
    return NextResponse.json({ error: 'Invalid peerUserId' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const meta = {
    audio_only: audioOnly,
    status: 'answered',
    duration_sec: durationSec,
    caller_id: user.id,
  };

  try {
    if (groupId) {
      await admin.from('erp_group_messages').insert({
        group_id: groupId,
        sender_id: user.id,
        body: '',
        kind: 'call',
        meta,
      });
    } else {
      await admin.from('erp_direct_messages').insert({
        sender_id: user.id,
        recipient_id: peerUserId,
        body: '',
        kind: 'call',
        meta,
      });
    }
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Could not log call' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
