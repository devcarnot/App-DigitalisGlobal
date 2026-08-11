import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { erpInvitePublicBaseUrl } from '../../../../lib/erp-invite-server';
import { sendPushToUser } from '../../../../lib/erp-push-server';
import {
  assertMeetingInviteeRule,
  buildErpMeetingJoinUrlServer,
  emailMeetingAttendees,
} from '../../../../lib/erp-meetings-server';

export const runtime = 'nodejs';

const MIN_DURATION = 5;
const MAX_DURATION = 600;
const ATTENDEE_ROLE_VALUES = new Set(['organizer', 'required', 'optional']);
const STATUS_FILTER_VALUES = new Set(['scheduled', 'cancelled', 'completed']);
const RANGE_VALUES = new Set(['upcoming', 'past', 'all']);

/** Hash the meeting id with the same secret the call-room route uses so the
 *  Jitsi room name is non-trivial to guess from the meeting id alone. */
function buildJitsiRoom(meetingId) {
  const secret =
    process.env.JITSI_ROOM_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 48) ||
    'digitalis-erp-dev-jitsi-room-secret-change-me';
  const hash = crypto.createHmac('sha256', secret).update(`meeting:${meetingId}`).digest('hex');
  return `ErpMeeting${hash.slice(0, 24)}`;
}

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

/** Postgres "undefined_table": table not yet created. Used to keep the
 *  UI friendly before the meetings migration has been applied. */
function isMissingMeetingsTable(err) {
  if (!err) return false;
  if (err.code === '42P01') return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('relation "public.erp_meetings" does not exist') ||
    msg.includes('relation "erp_meetings" does not exist') ||
    msg.includes('schema cache')
  );
}

/** Postgres "undefined_column": used so we can ship the timezone UI before
 *  the corresponding migration has been applied to a given environment. */
function isMissingColumn(err, column) {
  if (!err) return false;
  if (err.code === '42703') return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes(`column "${column}"`) || msg.includes(`column ${column}`) || msg.includes('schema cache');
}

/** Light IANA timezone validation: keeps junk out of the column without a
 *  full timezone DB lookup. */
function isValidIanaTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const MEETING_COLUMNS_FULL =
  'id, title, description, scheduled_at, duration_minutes, time_zone, project_id, location_text, location_url, jitsi_room, created_by, status, created_at, updated_at';
const MEETING_COLUMNS_LEGACY =
  'id, title, description, scheduled_at, duration_minutes, project_id, location_text, location_url, jitsi_room, created_by, status, created_at, updated_at';

/**
 * GET /api/erp/meetings
 * Query params:
 *   range=upcoming|past|all   (default: upcoming)
 *   projectId=<uuid>          (optional)
 *   status=scheduled|cancelled|completed (optional)
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const rangeRaw = (url.searchParams.get('range') || 'upcoming').toLowerCase();
  const range = RANGE_VALUES.has(rangeRaw) ? rangeRaw : 'upcoming';
  const projectId = url.searchParams.get('projectId');
  const statusFilter = url.searchParams.get('status');

  const buildQuery = (columns) => {
    let q = supabase
      .from('erp_meetings')
      .select(columns)
      .order('scheduled_at', { ascending: range !== 'past' });
    const nowIsoLocal = new Date().toISOString();
    if (range === 'upcoming') q = q.gte('scheduled_at', nowIsoLocal);
    if (range === 'past') q = q.lt('scheduled_at', nowIsoLocal);
    if (isUuid(projectId)) q = q.eq('project_id', projectId);
    if (statusFilter && STATUS_FILTER_VALUES.has(statusFilter)) {
      q = q.eq('status', statusFilter);
    }
    return q.limit(200);
  };

  let { data: meetings, error: mErr } = await buildQuery(MEETING_COLUMNS_FULL);
  if (mErr && isMissingColumn(mErr, 'time_zone')) {
    // The time_zone migration hasn't been applied to this environment yet
    // gracefully degrade so the rest of the meetings UI still works.
    ({ data: meetings, error: mErr } = await buildQuery(MEETING_COLUMNS_LEGACY));
  }
  if (mErr) {
    if (isMissingMeetingsTable(mErr)) {
      return NextResponse.json({
        meetings: [],
        attendeesByMeeting: {},
        notProvisioned: true,
      });
    }
    return NextResponse.json({ error: mErr.message }, { status: 400 });
  }

  if (!meetings || meetings.length === 0) {
    return NextResponse.json({ meetings: [], attendeesByMeeting: {} });
  }

  // Pull attendees with the service role so the organizer / invitee can see
  // the full RSVP roster without recursive RLS shenanigans.
  const admin = createSupabaseAdmin();
  const reader = admin || supabase;
  const { data: attendees, error: aErr } = await reader
    .from('erp_meeting_attendees')
    .select('meeting_id, user_id, role, rsvp_status, responded_at')
    .in('meeting_id', meetings.map((m) => m.id));

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 400 });
  }

  const attendeesByMeeting = {};
  for (const row of attendees || []) {
    if (!attendeesByMeeting[row.meeting_id]) attendeesByMeeting[row.meeting_id] = [];
    attendeesByMeeting[row.meeting_id].push(row);
  }

  return NextResponse.json({ meetings, attendeesByMeeting });
}

/**
 * POST /api/erp/meetings
 * body: { title, description?, scheduledAt (ISO), durationMinutes?, projectId?,
 *         locationText?, locationUrl?, attendeeIds[], optionalAttendeeIds[] }
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
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

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const scheduledAtRaw = typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : '';
  const durationMinutes = clampDuration(body.durationMinutes, 30);
  const projectId = isUuid(body.projectId) ? body.projectId : null;
  const timeZone = isValidIanaTimeZone(body.timeZone) ? body.timeZone.trim() : null;
  const locationText = typeof body.locationText === 'string' ? body.locationText.trim().slice(0, 240) : '';
  const locationUrl = typeof body.locationUrl === 'string' ? body.locationUrl.trim().slice(0, 2048) : '';
  const requiredIds = uniqIds(Array.isArray(body.attendeeIds) ? body.attendeeIds : []);
  const optionalIds = uniqIds(Array.isArray(body.optionalAttendeeIds) ? body.optionalAttendeeIds : []);
  const generateJitsi = body.generateJitsi !== false;

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
  }

  // Validate attendee profiles (must exist; clients are allowed).
  const allInviteeIds = [...new Set([...requiredIds, ...optionalIds])].filter((id) => id !== user.id);
  if (allInviteeIds.length > 0) {
    const { data: profiles, error: pErr } = await admin
      .from('erp_profiles')
      .select('id, role')
      .in('id', allInviteeIds);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    const found = new Set((profiles || []).map((p) => p.id));
    for (const id of allInviteeIds) {
      if (!found.has(id)) {
        return NextResponse.json({ error: 'One or more invitees were not found' }, { status: 400 });
      }
    }
  }

  // Clients + team_members can only invite team_lead/team_member of a
  // project they themselves belong to.
  const ruleCheck = await assertMeetingInviteeRule({
    admin,
    role: profile.role,
    userId: user.id,
    projectId,
    inviteeIds: allInviteeIds,
  });
  if (!ruleCheck.ok) {
    return NextResponse.json({ error: ruleCheck.error }, { status: ruleCheck.status });
  }

  // Insert the meeting first (organizer = caller).
  const baseInsert = {
    title,
    description: description || null,
    scheduled_at: scheduledAt.toISOString(),
    duration_minutes: durationMinutes,
    project_id: projectId,
    location_text: locationText || null,
    location_url: locationUrl || null,
    created_by: user.id,
    status: 'scheduled',
  };
  const insertWithZone = timeZone ? { ...baseInsert, time_zone: timeZone } : baseInsert;
  let { data: inserted, error: insErr } = await supabase
    .from('erp_meetings')
    .insert(insertWithZone)
    .select('*')
    .single();
  // If the time_zone column hasn't been provisioned yet on this environment,
  // fall back to the legacy shape so the meeting still gets created.
  if (insErr && timeZone && isMissingColumn(insErr, 'time_zone')) {
    ({ data: inserted, error: insErr } = await supabase
      .from('erp_meetings')
      .insert(baseInsert)
      .select('*')
      .single());
  }

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message || 'Could not create meeting' }, { status: 400 });
  }

  // Generate Jitsi room name (deterministic, requires the meeting id).
  let jitsiRoom = null;
  if (generateJitsi) {
    jitsiRoom = buildJitsiRoom(inserted.id);
    const { error: updErr } = await admin
      .from('erp_meetings')
      .update({ jitsi_room: jitsiRoom })
      .eq('id', inserted.id);
    if (updErr) {
      // Non-fatal: the meeting is still created, just without a generated room name.
      jitsiRoom = null;
    }
  }

  // Insert attendees: organizer + required + optional.
  // NOTE: PostgREST bulk insert uses the union of keys across rows, and omitted
  // keys are sent as explicit NULL (not as "use the column default"). So every
  // row must carry the same shape: otherwise `rsvp_status` / `responded_at`
  // arrive as NULL and the not-null constraint rejects the insert.
  const nowIso = new Date().toISOString();
  const attendeeRows = [
    {
      meeting_id: inserted.id,
      user_id: user.id,
      role: 'organizer',
      rsvp_status: 'accepted',
      responded_at: nowIso,
    },
  ];
  for (const id of requiredIds) {
    if (id === user.id) continue;
    attendeeRows.push({
      meeting_id: inserted.id,
      user_id: id,
      role: 'required',
      rsvp_status: 'pending',
      responded_at: null,
    });
  }
  for (const id of optionalIds) {
    if (id === user.id || requiredIds.includes(id)) continue;
    attendeeRows.push({
      meeting_id: inserted.id,
      user_id: id,
      role: 'optional',
      rsvp_status: 'pending',
      responded_at: null,
    });
  }
  const { error: aErr } = await admin.from('erp_meeting_attendees').insert(attendeeRows);
  if (aErr) {
    // Roll back meeting if we couldn't seed attendees so the row doesn't dangle.
    await admin.from('erp_meetings').delete().eq('id', inserted.id);
    return NextResponse.json({ error: aErr.message }, { status: 400 });
  }

  // Notify everyone except the organizer.
  const recipientIds = attendeeRows.filter((r) => r.user_id !== user.id).map((r) => r.user_id);
  if (recipientIds.length > 0) {
    const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
    const link = `${base}/erp/meetings?id=${encodeURIComponent(inserted.id)}`;
    const organizerName = (profile.full_name && String(profile.full_name).trim()) || user.email || 'Someone';
    const whenLabel = new Date(inserted.scheduled_at).toLocaleString();
    const notifRows = recipientIds.map((uid) => ({
      user_id: uid,
      title: `Meeting invitation: ${title}`,
      body: `${organizerName} invited you to a meeting on ${whenLabel}.`,
      link,
    }));
    await admin.from('erp_notifications').insert(notifRows);

    await Promise.allSettled(
      recipientIds.map((uid) =>
        sendPushToUser({
          userId: uid,
          payload: {
            title: `Meeting invitation: ${title}`.slice(0, 100),
            body: `${organizerName} · ${whenLabel}`.slice(0, 140),
            url: link,
          },
        }),
      ),
    );

    await emailMeetingAttendees({
      admin,
      userIds: recipientIds,
      kind: 'invitation',
      meeting: { ...inserted, jitsi_room: jitsiRoom ?? inserted.jitsi_room ?? null },
      organizerName,
      meetingUrl: link,
      joinUrl: buildErpMeetingJoinUrlServer({ jitsiRoom, locationUrl }),
    });
  }

  // Activity log (project-scoped if applicable).
  await admin.from('erp_activity_log').insert({
    project_id: projectId,
    user_id: user.id,
    action: 'meeting_scheduled',
    meta: {
      meeting_id: inserted.id,
      title,
      scheduled_at: inserted.scheduled_at,
      attendee_count: attendeeRows.length,
    },
  });

  // Return the full meeting + attendees.
  const { data: attendees } = await admin
    .from('erp_meeting_attendees')
    .select('meeting_id, user_id, role, rsvp_status, responded_at')
    .eq('meeting_id', inserted.id);

  return NextResponse.json({
    meeting: { ...inserted, jitsi_room: jitsiRoom ?? inserted.jitsi_room ?? null },
    attendees: attendees || [],
  });
}
