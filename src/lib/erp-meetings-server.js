/**
 * Server-only meeting helpers shared by the create/update routes. Keeps the
 * "who is allowed to invite whom" rule in one place so the rules stay in
 * sync between POST /api/erp/meetings and PATCH /api/erp/meetings/[id].
 */
import { sendErpMeetingEmail } from './erp-resend';

const PROJECT_TEAM_ROLES = new Set(['team_lead', 'team_member']);
const ROLES_RESTRICTED_TO_PROJECT_TEAM = new Set(['client', 'team_member']);

export function isProjectTeamOnlyOrganizer(role) {
  return ROLES_RESTRICTED_TO_PROJECT_TEAM.has(role);
}

/**
 * Enforce the "client / team_member can only invite team_lead + team_member of
 * a project they themselves belong to" rule.
 *
 * Resolves `{ ok: true }` when the rule is satisfied or doesn't apply, and
 * `{ ok: false, status, error }` otherwise. Callers should `return NextResponse
 * .json({ error }, { status })` on failure.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.admin Service-role client.
 * @param {string} args.role Organizer role (profile.role).
 * @param {string} args.userId Organizer auth.uid().
 * @param {string|null} args.projectId Project linked on the meeting (or null).
 * @param {string[]} args.inviteeIds Required + optional invitee user ids
 *   (excluding the organizer themselves; nullable rows already filtered out).
 */
export async function assertMeetingInviteeRule({ admin, role, userId, projectId, inviteeIds }) {
  if (!isProjectTeamOnlyOrganizer(role)) return { ok: true };

  if (!projectId) {
    return {
      ok: false,
      status: 400,
      error: 'Please link a project — you can only invite team managers or members of a project.',
    };
  }

  // Verify the organizer is a member of the project.
  const { data: own, error: ownErr } = await admin
    .from('erp_project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    return { ok: false, status: 400, error: ownErr.message };
  }
  if (!own) {
    return {
      ok: false,
      status: 403,
      error: 'You are not a member of that project.',
    };
  }

  if (!inviteeIds || inviteeIds.length === 0) return { ok: true };

  const { data: members, error: mErr } = await admin
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .in('user_id', inviteeIds);
  if (mErr) {
    return { ok: false, status: 400, error: mErr.message };
  }
  const memberIds = new Set((members || []).map((m) => m.user_id));

  const { data: profiles, error: pErr } = await admin
    .from('erp_profiles')
    .select('id, role')
    .in('id', inviteeIds);
  if (pErr) {
    return { ok: false, status: 400, error: pErr.message };
  }
  const allowed = new Set(
    (profiles || [])
      .filter((p) => memberIds.has(p.id) && PROJECT_TEAM_ROLES.has(p.role))
      .map((p) => p.id),
  );

  for (const id of inviteeIds) {
    if (!allowed.has(id)) {
      return {
        ok: false,
        status: 403,
        error: 'You can only invite team managers or members of this project.',
      };
    }
  }
  return { ok: true };
}

/**
 * Resolve the URL meeting attendees should click to join. Uses the meeting's
 * external `location_url` first (Zoom/Meet/Teams link), then falls back to
 * the auto-generated Jitsi room name.
 */
export function buildErpMeetingJoinUrlServer({ jitsiRoom, locationUrl }) {
  if (locationUrl) return locationUrl;
  if (!jitsiRoom) return null;
  const raw = process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.jit.si';
  const domain = raw.replace(/^https?:\/\//, '').split('/')[0].trim() || 'meet.jit.si';
  return `https://${domain}/${encodeURIComponent(jitsiRoom)}`;
}

/**
 * Format `scheduled_at` for the recipient. We can't know each user's tz on
 * the server, so we pick the workspace's locale-aware string in the org
 * default tz. This is good enough for "Sat, May 9, 2026, 1:30 PM" copy in the
 * email body — the calendar (.ics) attachment carries the precise UTC time.
 */
export function formatErpMeetingWhenLabel(scheduledAt, durationMinutes) {
  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return '';
  const minutes = Math.max(5, Math.min(600, Number(durationMinutes) || 30));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const sameDay = start.toDateString() === end.toDateString();
  const dateStr = start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endStr = end.toLocaleString(undefined,
    sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  );
  return `${dateStr} – ${endStr}`;
}

/**
 * Best-effort fan-out of meeting emails to a list of attendees.
 *
 * - Resolves each user's email through the auth admin API (same pattern as
 *   /api/erp/notify-dm). Users without an email are silently skipped.
 * - Runs sends in parallel via Promise.allSettled so a slow recipient can't
 *   block the API response, and a single failure doesn't poison the others.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.admin
 * @param {string[]} args.userIds Recipient profile ids (organizer is usually filtered out by the caller).
 * @param {'invitation'|'update'|'cancelled'|'reminder'} args.kind
 * @param {object} args.meeting Resolved meeting row (id, title, description, scheduled_at, duration_minutes, location_text, location_url, jitsi_room).
 * @param {string} args.organizerName Display name shown in the email.
 * @param {string} args.meetingUrl Workspace deep-link the email's CTA opens.
 * @param {string|null} [args.joinUrl] Resolved join URL (Jitsi or external) — falsy disables the Join button.
 * @param {number|null} [args.minutesUntil] Used for the reminder subject ("In N min: …").
 */
export async function emailMeetingAttendees({
  admin,
  userIds,
  kind,
  meeting,
  organizerName,
  meetingUrl,
  joinUrl,
  minutesUntil,
}) {
  if (!admin || !meeting || !Array.isArray(userIds) || userIds.length === 0) {
    return { sent: 0, attempted: 0 };
  }
  const whenLabel = formatErpMeetingWhenLabel(meeting.scheduled_at, meeting.duration_minutes);
  const location = meeting.location_text || meeting.location_url || joinUrl || '';

  const results = await Promise.allSettled(
    userIds.map(async (userId) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        const email = data?.user?.email;
        if (error || !email) return { ok: false, reason: 'no_email' };
        return await sendErpMeetingEmail({
          to: email,
          kind,
          organizerName,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          description: meeting.description,
          scheduledAt: meeting.scheduled_at,
          durationMinutes: meeting.duration_minutes,
          whenLabel,
          location,
          joinUrl: kind === 'cancelled' ? null : joinUrl || null,
          meetingUrl,
          minutesUntil,
        });
      } catch (e) {
        return { ok: false, reason: e?.message || 'send_failed' };
      }
    }),
  );

  let sent = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.ok) sent += 1;
  }
  return { sent, attempted: userIds.length };
}
