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

/** Undo checkout button/RPC window — must match DB `erp_attendance_admin_undo_checkout_pk`. */
export const ERP_ATTENDANCE_UNDO_CHECKOUT_WINDOW_MS = 2 * 60 * 60 * 1000;

export function canUndoAttendanceCheckout(checkOutIso, nowMs = Date.now()) {
  if (!checkOutIso) return false;
  const t = new Date(checkOutIso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t <= ERP_ATTENDANCE_UNDO_CHECKOUT_WINDOW_MS;
}

/** Net working seconds for one attendance row (live break + open shift supported). */
export function attendanceRowNetSeconds(row, nowMs = Date.now()) {
  if (!row?.check_in_at) return 0;
  const startMs = new Date(row.check_in_at).getTime();
  if (Number.isNaN(startMs)) return 0;
  const endMs = row.check_out_at ? new Date(row.check_out_at).getTime() : nowMs;
  if (Number.isNaN(endMs) || endMs < startMs) return 0;
  const grossSec = Math.floor((endMs - startMs) / 1000);
  const breakStored = Number(row.break_seconds_total) || 0;
  const breakLiveSec =
    !row.check_out_at && row.break_started_at
      ? Math.max(0, Math.floor((nowMs - new Date(row.break_started_at).getTime()) / 1000))
      : 0;
  return Math.max(0, grossSec - breakStored - breakLiveSec);
}

/** True when row counts toward a rolling average (completed day or open shift today). */
export function attendanceRowCountsForAverage(row, todayStr, nowMs = Date.now()) {
  if (!row?.check_in_at) return false;
  const wd = String(row.work_date || '').slice(0, 10);
  if (wd === todayStr) return true;
  return Boolean(row.check_out_at);
}

export function isWorkDateInRollingWindow(workDate, todayStr, dayCount) {
  const wd = String(workDate || '').slice(0, 10);
  const today = String(todayStr || '').slice(0, 10);
  if (!wd || !today || dayCount < 1) return false;
  const from = dateStringAddDays(today, -(dayCount - 1));
  return wd >= from && wd <= today;
}

/** @returns {{ totalSec: number, dayCount: number, avgSec: number }} */
export function attendanceAverageForWindow(rows, todayStr, dayCount, nowMs = Date.now()) {
  let totalSec = 0;
  let dayCount = 0;
  for (const row of rows || []) {
    if (!isWorkDateInRollingWindow(row.work_date, todayStr, dayCount)) continue;
    if (!attendanceRowCountsForAverage(row, todayStr, nowMs)) continue;
    totalSec += attendanceRowNetSeconds(row, nowMs);
    dayCount += 1;
  }
  return {
    totalSec,
    dayCount,
    avgSec: dayCount > 0 ? Math.round(totalSec / dayCount) : 0,
  };
}

export function formatAttendanceAverageSeconds(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return '0m';
}
