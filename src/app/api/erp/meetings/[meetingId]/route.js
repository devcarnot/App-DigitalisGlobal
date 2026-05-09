import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpInvitePublicBaseUrl } from '../../../../../lib/erp-invite-server';
import { sendPushToUser } from '../../../../../lib/erp-push-server';
import {
  assertMeetingInviteeRule,
  buildErpMeetingJoinUrlServer,
  emailMeetingAttendees,
  isProjectTeamOnlyOrganizer,
} from '../../../../../lib/erp-meetings-server';

export const runtime = 'nodejs';

const MIN_DURATION = 5;
const MAX_DURATION = 600;

function clampDuration(raw, fallback = 30) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < MIN_DURATION) return MIN_DURATION;
  if (n > MAX_DURATION) return MAX_DURATION;
  return Math.round(n);
}

function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function uniqIds(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr || []) {
    if (!isUuid(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

async function loadMeetingForUser({ supabase, admin, meetingId, user, profile }) {
  const { data: meeting, error: mErr } = await supabase
    .from('erp_meetings')
    .select('*')
    .eq('id', meetingId)
    .maybeSingle();
  if (mErr) {
    return { error: { message: mErr.message, status: 400 } };
  }
  if (!meeting) {
    return { error: { message: 'Meeting not found', status: 404 } };
  }
  const isOrganizer = meeting.created_by === user.id;
  const isAdmin = profile?.role === 'admin';
  const reader = admin || supabase;
  const { data: attendees } = await reader
    .from('erp_meeting_attendees')
    .select('meeting_id, user_id, role, rsvp_status, responded_at')
    .eq('meeting_id', meetingId);
  return {
    meeting,
    attendees: attendees || [],
    isOrganizer,
    isAdmin,
    canManage: isOrganizer || isAdmin,
  };
}

export async function GET(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  const { meetingId } = await params;
  if (!isUuid(meetingId)) {
    return NextResponse.json({ error: 'Invalid meeting id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  const admin = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const result = await loadMeetingForUser({ supabase, admin, meetingId, user, profile });
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status });
  }
  return NextResponse.json({
    meeting: result.meeting,
    attendees: result.attendees,
    canManage: result.canManage,
  });
}

export async function PATCH(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  const { meetingId } = await params;
  if (!isUuid(meetingId)) {
    return NextResponse.json({ error: 'Invalid meeting id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  const admin = createSupabaseAdmin();
  if (!supabase || !admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await loadMeetingForUser({ supabase, admin, meetingId, user, profile });
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status });
  }
  if (!result.canManage) {
    return NextResponse.json({ error: 'Only the organizer can edit this meeting' }, { status: 403 });
  }

  const update = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    update.title = t;
  }
  if (typeof body.description === 'string') {
    update.description = body.description.trim() || null;
  }
  if (typeof body.scheduledAt === 'string') {
    const d = new Date(body.scheduledAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
    }
    update.scheduled_at = d.toISOString();
  }
  if (body.durationMinutes !== undefined) {
    update.duration_minutes = clampDuration(body.durationMinutes, result.meeting.duration_minutes || 30);
  }
  if (body.projectId === null || isUuid(body.projectId)) {
    update.project_id = body.projectId || null;
  }
  if (typeof body.locationText === 'string') {
    update.location_text = body.locationText.trim().slice(0, 240) || null;
  }
  if (typeof body.locationUrl === 'string') {
    update.location_url = body.locationUrl.trim().slice(0, 2048) || null;
  }

  let updatedAttendees = null;
  if (Array.isArray(body.attendeeIds) || Array.isArray(body.optionalAttendeeIds)) {
    const requiredIds = uniqIds(body.attendeeIds || []);
    const optionalIds = uniqIds(body.optionalAttendeeIds || []);
    const all = [...new Set([...requiredIds, ...optionalIds])];
    if (all.length > 0) {
      const { data: profiles, error: pErr } = await admin
        .from('erp_profiles')
        .select('id')
        .in('id', all);
      if (pErr) {
        return NextResponse.json({ error: pErr.message }, { status: 400 });
      }
      const found = new Set((profiles || []).map((p) => p.id));
      for (const id of all) {
        if (!found.has(id)) {
          return NextResponse.json({ error: 'One or more invitees were not found' }, { status: 400 });
        }
      }
    }

    // Apply the project-team-only rule using the *organizer's* role, not the
    // editor's: an admin editing on behalf of a client/team_member organizer
    // still has to keep the invitee list legal for that organizer.
    const organizerId = result.meeting.created_by;
    const { data: organizerProfile } = await admin
      .from('erp_profiles')
      .select('role')
      .eq('id', organizerId)
      .maybeSingle();
    const organizerRole = organizerProfile?.role;
    if (isProjectTeamOnlyOrganizer(organizerRole)) {
      const effectiveProjectId =
        update.project_id !== undefined ? update.project_id : result.meeting.project_id;
      const inviteeIds = all.filter((id) => id !== organizerId);
      const ruleCheck = await assertMeetingInviteeRule({
        admin,
        role: organizerRole,
        userId: organizerId,
        projectId: effectiveProjectId,
        inviteeIds,
      });
      if (!ruleCheck.ok) {
        return NextResponse.json({ error: ruleCheck.error }, { status: ruleCheck.status });
      }
    }

    // Replace attendee set, preserving the organizer row + previous RSVP status.
    const previous = new Map((result.attendees || []).map((a) => [a.user_id, a]));
    const nextRows = [];
    const organizerId = result.meeting.created_by;
    const organizerPrev = previous.get(organizerId);
    nextRows.push({
      meeting_id: meetingId,
      user_id: organizerId,
      role: 'organizer',
      rsvp_status: organizerPrev?.rsvp_status || 'accepted',
      responded_at: organizerPrev?.responded_at || new Date().toISOString(),
    });
    for (const id of requiredIds) {
      if (id === organizerId) continue;
      const prev = previous.get(id);
      nextRows.push({
        meeting_id: meetingId,
        user_id: id,
        role: 'required',
        rsvp_status: prev?.rsvp_status || 'pending',
        responded_at: prev?.responded_at || null,
      });
    }
    for (const id of optionalIds) {
      if (id === organizerId || requiredIds.includes(id)) continue;
      const prev = previous.get(id);
      nextRows.push({
        meeting_id: meetingId,
        user_id: id,
        role: 'optional',
        rsvp_status: prev?.rsvp_status || 'pending',
        responded_at: prev?.responded_at || null,
      });
    }

    const { error: delErr } = await admin
      .from('erp_meeting_attendees')
      .delete()
      .eq('meeting_id', meetingId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    const { error: insErr } = await admin.from('erp_meeting_attendees').insert(nextRows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    updatedAttendees = nextRows;
  }

  let nextMeeting = result.meeting;
  if (Object.keys(update).length > 0) {
    const { data: updated, error: uErr } = await admin
      .from('erp_meetings')
      .update(update)
      .eq('id', meetingId)
      .select('*')
      .single();
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }
    nextMeeting = updated;
  }

  // Notify attendees the meeting changed (skip the organizer themselves).
  const attendeeRows = updatedAttendees
    || (await admin
      .from('erp_meeting_attendees')
      .select('user_id')
      .eq('meeting_id', meetingId)).data
    || [];
  const recipientIds = attendeeRows
    .map((r) => r.user_id)
    .filter((id) => id && id !== user.id);
  if (recipientIds.length > 0) {
    const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
    const link = `${base}/erp/meetings?id=${encodeURIComponent(meetingId)}`;
    const organizerName = (profile.full_name && String(profile.full_name).trim()) || user.email || 'Someone';
    const whenLabel = new Date(nextMeeting.scheduled_at).toLocaleString();
    const notifRows = recipientIds.map((uid) => ({
      user_id: uid,
      title: `Meeting updated: ${nextMeeting.title}`,
      body: `${organizerName} updated a meeting scheduled for ${whenLabel}.`,
      link,
    }));
    await admin.from('erp_notifications').insert(notifRows);

    await Promise.allSettled(
      recipientIds.map((uid) =>
        sendPushToUser({
          userId: uid,
          payload: {
            title: `Meeting updated: ${nextMeeting.title}`.slice(0, 100),
            body: `${organizerName} · ${whenLabel}`.slice(0, 140),
            url: link,
          },
        }),
      ),
    );

    await emailMeetingAttendees({
      admin,
      userIds: recipientIds,
      kind: 'update',
      meeting: nextMeeting,
      organizerName,
      meetingUrl: link,
      joinUrl: buildErpMeetingJoinUrlServer({
        jitsiRoom: nextMeeting.jitsi_room,
        locationUrl: nextMeeting.location_url,
      }),
    });
  }

  return NextResponse.json({
    meeting: nextMeeting,
    attendees: attendeeRows,
  });
}

export async function DELETE(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  const { meetingId } = await params;
  if (!isUuid(meetingId)) {
    return NextResponse.json({ error: 'Invalid meeting id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  const admin = createSupabaseAdmin();
  if (!supabase || !admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const result = await loadMeetingForUser({ supabase, admin, meetingId, user, profile });
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status });
  }
  if (!result.canManage) {
    return NextResponse.json({ error: 'Only the organizer can cancel this meeting' }, { status: 403 });
  }

  const { error: uErr } = await admin
    .from('erp_meetings')
    .update({ status: 'cancelled' })
    .eq('id', meetingId);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 400 });
  }

  // Notify everyone the meeting was cancelled.
  const recipientIds = (result.attendees || [])
    .map((a) => a.user_id)
    .filter((id) => id && id !== user.id);
  if (recipientIds.length > 0) {
    const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
    const link = `${base}/erp/meetings?id=${encodeURIComponent(meetingId)}`;
    const organizerName = (profile.full_name && String(profile.full_name).trim()) || user.email || 'Someone';
    const whenLabel = new Date(result.meeting.scheduled_at).toLocaleString();
    const notifRows = recipientIds.map((uid) => ({
      user_id: uid,
      title: `Meeting cancelled: ${result.meeting.title}`,
      body: `${organizerName} cancelled the meeting scheduled for ${whenLabel}.`,
      link,
    }));
    await admin.from('erp_notifications').insert(notifRows);

    await Promise.allSettled(
      recipientIds.map((uid) =>
        sendPushToUser({
          userId: uid,
          payload: {
            title: `Meeting cancelled: ${result.meeting.title}`.slice(0, 100),
            body: `${organizerName} · ${whenLabel}`.slice(0, 140),
            url: link,
          },
        }),
      ),
    );

    await emailMeetingAttendees({
      admin,
      userIds: recipientIds,
      kind: 'cancelled',
      meeting: result.meeting,
      organizerName,
      meetingUrl: link,
      joinUrl: buildErpMeetingJoinUrlServer({
        jitsiRoom: result.meeting.jitsi_room,
        locationUrl: result.meeting.location_url,
      }),
    });
  }

  await admin.from('erp_activity_log').insert({
    project_id: result.meeting.project_id,
    user_id: user.id,
    action: 'meeting_cancelled',
    meta: { meeting_id: meetingId, title: result.meeting.title },
  });

  return NextResponse.json({ ok: true });
}
