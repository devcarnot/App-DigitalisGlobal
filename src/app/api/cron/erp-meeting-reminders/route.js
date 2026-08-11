/**
 * Pre-meeting reminder cron.
 *
 * Pulls meetings whose start is within the next REMINDER_LEAD_MIN minutes
 * (default 15) and which haven't had a reminder sent yet, then:
 *   1. Inserts an in-app erp_notifications row for each attendee.
 *   2. Best-effort web push to each attendee.
 *   3. Sets erp_meetings.reminder_sent_at = now() so subsequent cron runs
 *      don't double-send.
 *
 * Trigger this every 5 minutes from any external scheduler:
 *   - Vercel Cron (vercel.json schedule)
 *   - Supabase Edge Function on cron
 *   - GitHub Actions workflow / external uptime monitor
 *
 * Auth: same convention as /api/cron/erp-trash-purge: header `x-cron-secret`,
 * `Authorization: Bearer <CRON_SECRET>`, or `?secret=<CRON_SECRET>`.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { sendPushToUser } from '../../../../lib/erp-push-server';
import { erpInvitePublicBaseUrl } from '../../../../lib/erp-invite-server';
import { buildErpMeetingJoinUrlServer, emailMeetingAttendees } from '../../../../lib/erp-meetings-server';

export const runtime = 'nodejs';

const DEFAULT_LEAD_MINUTES = 15;
const MAX_LEAD_MINUTES = 120;

function leadMinutes() {
  const raw = Number(process.env.ERP_MEETING_REMINDER_LEAD_MINUTES);
  if (!Number.isFinite(raw)) return DEFAULT_LEAD_MINUTES;
  if (raw < 1) return 1;
  if (raw > MAX_LEAD_MINUTES) return MAX_LEAD_MINUTES;
  return Math.round(raw);
}

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
  const lead = leadMinutes();
  // Meetings starting between now and now+lead, not cancelled, not yet reminded.
  // We include a tiny -2min grace to cover cron jitter for meetings that have
  // already started but were never reminded.
  const lowerBound = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const upperBound = new Date(now.getTime() + lead * 60 * 1000).toISOString();

  const { data: meetings, error: mErr } = await admin
    .from('erp_meetings')
    .select('id, title, scheduled_at, duration_minutes, project_id, location_url, jitsi_room, created_by')
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', lowerBound)
    .lte('scheduled_at', upperBound)
    .order('scheduled_at', { ascending: true })
    .limit(100);

  if (mErr) {
    return { status: 500, body: { error: mErr.message } };
  }
  if (!meetings || meetings.length === 0) {
    return { status: 200, body: { ok: true, reminded: 0 } };
  }

  const meetingIds = meetings.map((m) => m.id);
  const { data: attendees, error: aErr } = await admin
    .from('erp_meeting_attendees')
    .select('meeting_id, user_id')
    .in('meeting_id', meetingIds);
  if (aErr) {
    return { status: 500, body: { error: aErr.message } };
  }

  const attendeesByMeeting = {};
  for (const row of attendees || []) {
    if (!attendeesByMeeting[row.meeting_id]) attendeesByMeeting[row.meeting_id] = [];
    attendeesByMeeting[row.meeting_id].push(row.user_id);
  }

  // Pre-fetch organizer names so reminder emails can address "From: Name".
  const organizerIds = [...new Set(meetings.map((m) => m.created_by).filter(Boolean))];
  const organizerNameById = {};
  if (organizerIds.length > 0) {
    const { data: orgs } = await admin
      .from('erp_profiles')
      .select('id, full_name')
      .in('id', organizerIds);
    for (const p of orgs || []) {
      organizerNameById[p.id] = p.full_name || 'Organizer';
    }
  }

  const baseUrl = erpInvitePublicBaseUrl().replace(/\/$/, '');
  let totalReminded = 0;
  const stamp = new Date().toISOString();

  for (const meeting of meetings) {
    const recipients = attendeesByMeeting[meeting.id] || [];
    const start = new Date(meeting.scheduled_at);
    const minsUntil = Math.max(0, Math.round((start.getTime() - Date.now()) / 60000));
    const link = `${baseUrl}/erp/meetings?id=${encodeURIComponent(meeting.id)}`;
    const whenLabel = start.toLocaleString();
    const titleSafe = (meeting.title || 'Meeting').slice(0, 80);

    if (recipients.length > 0) {
      const notifRows = recipients.map((uid) => ({
        user_id: uid,
        title: minsUntil > 0 ? `Starting in ${minsUntil} min: ${titleSafe}` : `Starting now: ${titleSafe}`,
        body: `Scheduled for ${whenLabel}`,
        link,
      }));
      await admin.from('erp_notifications').insert(notifRows);

      await Promise.allSettled(
        recipients.map((uid) =>
          sendPushToUser({
            userId: uid,
            payload: {
              title: (minsUntil > 0
                ? `Starting in ${minsUntil} min: ${titleSafe}`
                : `Starting now: ${titleSafe}`).slice(0, 100),
              body: `Scheduled for ${whenLabel}`.slice(0, 140),
              url: link,
            },
          }),
        ),
      );

      await emailMeetingAttendees({
        admin,
        userIds: recipients,
        kind: 'reminder',
        meeting,
        organizerName: organizerNameById[meeting.created_by] || 'Organizer',
        meetingUrl: link,
        joinUrl: buildErpMeetingJoinUrlServer({
          jitsiRoom: meeting.jitsi_room,
          locationUrl: meeting.location_url,
        }),
        minutesUntil: minsUntil,
      });
    }

    // Mark sent regardless of recipient count so we don't keep retrying empty
    // meetings on every cron tick.
    await admin
      .from('erp_meetings')
      .update({ reminder_sent_at: stamp })
      .eq('id', meeting.id);
    totalReminded += recipients.length;
  }

  return {
    status: 200,
    body: {
      ok: true,
      processedMeetings: meetings.length,
      reminded: totalReminded,
      leadMinutes: lead,
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
