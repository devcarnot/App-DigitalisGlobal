/**
 * Client-side helpers for the ERP reminders API.
 */
import { erpAuthorizedFetch } from './erp-client-api';

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
 * @param {{ range?: 'upcoming'|'past'|'all' }} [opts]
 */
export async function listErpReminders(opts = {}) {
  const range = ['upcoming', 'past', 'all'].includes(opts.range) ? opts.range : 'upcoming';
  const qs = buildQuery({ range });
  const res = await erpAuthorizedFetch(`/api/erp/reminders${qs}`, { method: 'GET' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to load reminders');
  return data || { reminders: [], profilesById: {} };
}

/**
 * @param {{ title: string, body?: string, remindAt: string, assignedTo?: string }} payload
 */
export async function createErpReminder(payload) {
  const res = await erpAuthorizedFetch('/api/erp/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to create reminder');
  return data;
}

export async function updateErpReminder(reminderId, patch) {
  const res = await erpAuthorizedFetch(`/api/erp/reminders/${encodeURIComponent(reminderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to update reminder');
  return data;
}

export async function deleteErpReminder(reminderId) {
  const res = await erpAuthorizedFetch(`/api/erp/reminders/${encodeURIComponent(reminderId)}`, {
    method: 'DELETE',
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to delete reminder');
  return data;
}

export async function listErpReminderAssignablePeople() {
  const res = await erpAuthorizedFetch('/api/erp/reminders/assignable-people', { method: 'GET' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || 'Failed to load team members');
  return data || { people: [] };
}
