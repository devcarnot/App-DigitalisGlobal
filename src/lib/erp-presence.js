/** Heartbeat in useErpSession is 45s; treat as online if last ping is within this window. */
export const ERP_ONLINE_THRESHOLD_MS = 95_000;

export function isErpUserOnline(lastActiveAt) {
  if (!lastActiveAt) return false;
  const t = new Date(lastActiveAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ERP_ONLINE_THRESHOLD_MS;
}

export function formatErpRelativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleString();
}

const ERP_PKT_TZ = 'Asia/Karachi';

/** Absolute date/time in Pakistan Standard Time (activity audit). */
export function formatErpPktDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return `${d.toLocaleString('en-GB', {
      timeZone: ERP_PKT_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })} PKT`;
  } catch {
    return d.toLocaleString();
  }
}
