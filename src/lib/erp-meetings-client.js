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
