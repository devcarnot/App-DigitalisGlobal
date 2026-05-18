import { classifyFeedItem } from './erp-activity-feed';

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractFirstUuid(text) {
  if (text == null || text === '') return null;
  const m = String(text).match(UUID_RE);
  return m ? m[0] : null;
}

/**
 * In-app / inbox rows that refer to leave, including mis-linked rows (e.g. link → attendance).
 */
export function isLeaveWorkspaceNotification(row) {
  if (!row) return false;
  if (classifyFeedItem(row) === 'leave') return true;
  const t = `${row.title || ''} ${row.body || ''}`.toLowerCase();
  if (/new leave request|leave request submitted|leave request updated|time off request/.test(t)) return true;
  if (/\b(requested|submitted)\b.*\b(leave|pto|time off)\b/.test(t)) return true;
  const link = String(row.link || '');
  if (link.includes('/erp/leave')) return true;
  return false;
}

export function resolveLeaveRequestIdFromNotification(row) {
  if (!row) return null;
  const parts = [row.link, row.title, row.body].filter((x) => x != null && String(x).trim() !== '');
  return extractFirstUuid(parts.join('\n'));
}
