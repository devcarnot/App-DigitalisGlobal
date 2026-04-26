/** Local calendar date YYYY-MM-DD (for DB `date` columns and check-in/out). */
export function localDateString(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Add days to YYYY-MM-DD without using device timezone (UTC math). */
export function dateStringAddDays(dateStr, deltaDays) {
  const s = String(dateStr || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return localDateString();
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d) + deltaDays * 86400000;
  const out = new Date(t);
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, '0')}-${String(out.getUTCDate()).padStart(2, '0')}`;
}

/** For `<input type="datetime-local" />` — uses the browser local timezone. */
export function isoToDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses datetime-local string to ISO UTC for PostgREST `timestamptz`. */
export function datetimeLocalValueToIsoUtc(localStr) {
  if (!localStr || !String(localStr).trim()) return null;
  const d = new Date(localStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Format ISO timestamptz for display in locale. */
export function formatAttendanceDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** `work_date` from Postgres as YYYY-MM-DD */
export function formatWorkDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDurationBetween(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return '—';
  const a = new Date(checkInIso).getTime();
  const b = new Date(checkOutIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return '—';
  const ms = b - a;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
