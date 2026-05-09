import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { sendPushToUser } from '../../../../../../lib/erp-push-server';

export const runtime = 'nodejs';

const RSVP_VALUES = new Set(['accepted', 'declined', 'tentative', 'pending']);

function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * POST /api/erp/meetings/[meetingId]/rsvp
 * body: { status: 'accepted' | 'declined' | 'tentative' | 'pending' }
 *
 * Updates only the calling user's attendee row. The organizer is notified
 * via erp_notifications when an invitee changes their RSVP.
 */
export async function POST(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  const { meetingId } = await params;
  if (!isUuid(meetingId)) {
    return NextResponse.json({ error: 'Invalid meeting id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const status = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!RSVP_VALUES.has(status)) {
    return NextResponse.json({ error: 'Invalid RSVP status' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  const admin = createSupabaseAdmin();
  if (!supabase || !admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Look up the attendee row + parent meeting (for organizer + title).
  const { data: meeting, error: mErr } = await admin
    .from('erp_meetings')
    .select('id, title, scheduled_at, created_by, status')
    .eq('id', meetingId)
    .maybeSingle();
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 400 });
  }
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }
  if (meeting.status !== 'scheduled') {
    return NextResponse.json({ error: 'Meeting is not active' }, { status: 400 });
  }

  const { data: attendee, error: aErr } = await admin
    .from('erp_meeting_attendees')
    .select('meeting_id, user_id, role, rsvp_status')
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 400 });
  }
  if (!attendee) {
    return NextResponse.json({ error: 'You are not invited to this meeting' }, { status: 403 });
  }

  const { error: uErr } = await admin
    .from('erp_meeting_attendees')
    .update({ rsvp_status: status, responded_at: new Date().toISOString() })
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 400 });
  }

  // Tell the organizer (only if it's not them).
  if (meeting.created_by && meeting.created_by !== user.id) {
    const responderName = (profile.full_name && String(profile.full_name).trim()) || user.email || 'Someone';
    const verb = status === 'accepted' ? 'accepted' : status === 'declined' ? 'declined' : status === 'tentative' ? 'is tentative on' : 'updated their RSVP for';
    const link = `/erp/meetings?id=${encodeURIComponent(meetingId)}`;
    const whenLabel = new Date(meeting.scheduled_at).toLocaleString();
    await admin.from('erp_notifications').insert({
      user_id: meeting.created_by,
      title: `${responderName} ${verb}: ${meeting.title}`,
      body: `Scheduled for ${whenLabel}`,
      link,
    });
    void sendPushToUser({
      userId: meeting.created_by,
      payload: {
        title: `${responderName} ${verb}: ${meeting.title}`.slice(0, 100),
        body: `Scheduled for ${whenLabel}`.slice(0, 140),
        url: link,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status });
}
