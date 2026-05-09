/**
 * Client-side helpers for the ERP meetings API.
 * Each function adds an Authorization: Bearer header via erpAuthorizedFetch.
 */
import { erpAuthorizedFetch } from './erp-client-api';

const VALID_RANGES = new Set(['upcoming', 'past', 'all']);

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * @param {{ range?: 'upcoming'|'past'|'all', projectId?: string|null, status?: 'scheduled'|'cancelled'|'completed' }} [opts]
 */
export async function listErpMeetings(opts = {}) {
  const range = VALID_RANGES.has(opts.range) ? opts.range : 'upcoming';
  const qs = buildQuery({ range, projectId: opts.projectId || '', status: opts.status || '' });
  const res = await erpAuthorizedFetch(`/api/erp/meetings${qs}`, { method: 'GET' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to load meetings');
  return data || { meetings: [], attendeesByMeeting: {} };
}

export async function getErpMeeting(meetingId) {
  const res = await erpAuthorizedFetch(`/api/erp/meetings/${encodeURIComponent(meetingId)}`, { method: 'GET' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to load meeting');
  return data;
}

/**
 * @param {{ title: string, scheduledAt: string, durationMinutes?: number,
 *           description?: string, projectId?: string|null,
 *           locationText?: string, locationUrl?: string,
 *           attendeeIds?: string[], optionalAttendeeIds?: string[],
 *           generateJitsi?: boolean }} payload
 */
export async function createErpMeeting(payload) {
  const res = await erpAuthorizedFetch('/api/erp/meetings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to create meeting');
  return data;
}

export async function updateErpMeeting(meetingId, patch) {
  const res = await erpAuthorizedFetch(`/api/erp/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to update meeting');
  return data;
}

export async function cancelErpMeeting(meetingId) {
  const res = await erpAuthorizedFetch(`/api/erp/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to cancel meeting');
  return data;
}

/**
 * @param {string} meetingId
 * @param {'accepted'|'declined'|'tentative'|'pending'} status
 */
export async function rsvpErpMeeting(meetingId, status) {
  const res = await erpAuthorizedFetch(`/api/erp/meetings/${encodeURIComponent(meetingId)}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to update RSVP');
  return data;
}

export async function listErpMeetingInvitablePeople(projectId = null) {
  const qs = buildQuery({ projectId: projectId || '' });
  const res = await erpAuthorizedFetch(`/api/erp/meetings/invitable-people${qs}`, { method: 'GET' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to load directory');
  return Array.isArray(data?.people) ? data.people : [];
}

/** Build a Jitsi join URL from a stored room name. Falls back to meet.jit.si. */
export function buildErpMeetingJoinUrl(roomName) {
  if (!roomName) return null;
  const rawDomain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.jit.si';
  const domain = rawDomain.replace(/^https?:\/\//, '').split('/')[0].trim() || 'meet.jit.si';
  return `https://${domain}/${encodeURIComponent(roomName)}`;
}

/** Format a Date as the basic UTC stamp the calendar deep-links + iCal use. */
function toCalendarUtcStamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 line escaping: backslash, semicolons, commas, newlines. */
function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** RFC 5545 says lines should fold at 75 octets; keep it simple and split on 75 chars. */
function foldIcsLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i === 0 ? 75 : i + 74);
    parts.push(i === 0 ? chunk : ` ${chunk}`);
    i += i === 0 ? 75 : 74;
  }
  return parts.join('\r\n');
}

/**
 * @param {{ id: string, title?: string, description?: string|null,
 *           scheduled_at: string, duration_minutes?: number,
 *           location_text?: string|null, location_url?: string|null }} meeting
 * @param {string|null} [joinUrl] - resolved join URL (Jitsi or external)
 * @returns {string} RFC 5545 VCALENDAR text
 */
export function buildErpMeetingIcsContent(meeting, joinUrl) {
  const start = new Date(meeting?.scheduled_at);
  if (Number.isNaN(start.getTime())) return '';
  const minutes = Math.max(5, Math.min(600, Number(meeting?.duration_minutes) || 30));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const stamp = toCalendarUtcStamp(new Date());
  const dtStart = toCalendarUtcStamp(start);
  const dtEnd = toCalendarUtcStamp(end);
  const uid = `${meeting?.id || `erp-${Date.now()}`}@digitalis-erp`;
  const titleSafe = escapeIcsText(meeting?.title || 'Meeting');
  const descParts = [];
  if (meeting?.description) descParts.push(meeting.description);
  if (joinUrl) descParts.push(`Join: ${joinUrl}`);
  const descSafe = escapeIcsText(descParts.join('\n\n'));
  const locationSafe = escapeIcsText(meeting?.location_text || meeting?.location_url || joinUrl || '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Digitalis ERP//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${titleSafe}`,
  ];
  if (descSafe) lines.push(`DESCRIPTION:${descSafe}`);
  if (locationSafe) lines.push(`LOCATION:${locationSafe}`);
  if (joinUrl) lines.push(`URL:${escapeIcsText(joinUrl)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n');
}

/** Trigger a download of the meeting's .ics file in the browser. */
export function downloadErpMeetingIcs(meeting, joinUrl) {
  if (typeof window === 'undefined') return;
  const text = buildErpMeetingIcsContent(meeting, joinUrl);
  if (!text) return;
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = String(meeting?.title || 'meeting').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'meeting';
  a.download = `${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Google Calendar template URL — opens a pre-filled "create event" form. */
export function buildErpMeetingGoogleCalendarUrl(meeting, joinUrl) {
  const start = new Date(meeting?.scheduled_at);
  if (Number.isNaN(start.getTime())) return '';
  const minutes = Math.max(5, Math.min(600, Number(meeting?.duration_minutes) || 30));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', meeting?.title || 'Meeting');
  params.set('dates', `${toCalendarUtcStamp(start)}/${toCalendarUtcStamp(end)}`);
  const detailsParts = [];
  if (meeting?.description) detailsParts.push(meeting.description);
  if (joinUrl) detailsParts.push(`Join: ${joinUrl}`);
  if (detailsParts.length) params.set('details', detailsParts.join('\n\n'));
  const location = meeting?.location_text || meeting?.location_url || joinUrl || '';
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook (live.com / office.com) compose URL — renders a "new event" form. */
export function buildErpMeetingOutlookCalendarUrl(meeting, joinUrl) {
  const start = new Date(meeting?.scheduled_at);
  if (Number.isNaN(start.getTime())) return '';
  const minutes = Math.max(5, Math.min(600, Number(meeting?.duration_minutes) || 30));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const params = new URLSearchParams();
  params.set('path', '/calendar/action/compose');
  params.set('rru', 'addevent');
  params.set('subject', meeting?.title || 'Meeting');
  params.set('startdt', start.toISOString());
  params.set('enddt', end.toISOString());
  const bodyParts = [];
  if (meeting?.description) bodyParts.push(meeting.description);
  if (joinUrl) bodyParts.push(`Join: ${joinUrl}`);
  if (bodyParts.length) params.set('body', bodyParts.join('\n\n'));
  const location = meeting?.location_text || meeting?.location_url || joinUrl || '';
  if (location) params.set('location', location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
