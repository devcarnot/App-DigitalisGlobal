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

/** For `<input type="datetime-local" />`: uses the browser local timezone. */
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
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n/a';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** `work_date` from Postgres as YYYY-MM-DD */
export function formatWorkDate(dateStr) {
  if (!dateStr) return 'n/a';
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDurationBetween(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return 'n/a';
  const a = new Date(checkInIso).getTime();
  const b = new Date(checkOutIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 'n/a';
  const ms = b - a;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Undo checkout button/RPC window: must match DB `erp_attendance_admin_undo_checkout_pk`. */
export const ERP_ATTENDANCE_UNDO_CHECKOUT_WINDOW_MS = 2 * 60 * 60 * 1000;

export function canUndoAttendanceCheckout(checkOutIso, nowMs = Date.now()) {
  if (!checkOutIso) return false;
  const t = new Date(checkOutIso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t <= ERP_ATTENDANCE_UNDO_CHECKOUT_WINDOW_MS;
}

/** Parse attendance timestamptz from Postgres / Supabase into epoch ms. */
export function parseAttendanceMs(iso) {
  if (iso == null || iso === '') return NaN;
  if (typeof iso === 'number' && Number.isFinite(iso)) return iso;
  const raw = String(iso).trim();
  if (!raw) return NaN;
  let t = new Date(raw).getTime();
  if (!Number.isNaN(t)) return t;
  t = new Date(raw.replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? NaN : t;
}

const CHECK_IN_ANCHOR_PREFIX = 'erp-attendance-check-in-ms:';

/** Reject epoch / corrupted anchors (causes 400k+ hour totals). */
const MIN_ATTENDANCE_MS = Date.UTC(2020, 0, 1);

/** Max gross span for one attendance day row (sanity cap). */
const MAX_SHIFT_GROSS_SEC = 86400 * 2;

function isPlausibleAttendanceMs(ms) {
  return Number.isFinite(ms) && ms >= MIN_ATTENDANCE_MS;
}

export function readAttendanceCheckInAnchorMs(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return NaN;
  const raw = sessionStorage.getItem(`${CHECK_IN_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`);
  const n = Number(raw);
  return isPlausibleAttendanceMs(n) ? n : NaN;
}

/** Remove corrupt anchor keys (call from useEffect only, not during render). */
export function purgeInvalidAttendanceCheckInAnchor(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return;
  const key = `${CHECK_IN_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`;
  const raw = sessionStorage.getItem(key);
  if (raw == null) return;
  const n = Number(raw);
  if (!isPlausibleAttendanceMs(n)) sessionStorage.removeItem(key);
}

export function writeAttendanceCheckInAnchorMs(uid, workDate, ms) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return;
  const n = Number(ms);
  if (!isPlausibleAttendanceMs(n)) return;
  sessionStorage.setItem(`${CHECK_IN_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`, String(Math.floor(n)));
}

export function clearAttendanceCheckInAnchorMs(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(`${CHECK_IN_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`);
}

/** Resolve check-in instant for live timers (handles server/client clock skew). */
export function resolveAttendanceCheckInMs(row, { uid, workDate, nowMs = Date.now() } = {}) {
  const dbMs = parseAttendanceMs(row?.check_in_at);
  const workDateStr = workDate ?? row?.work_date;

  // Completed day: always use DB timestamps (never session anchor).
  if (row?.check_out_at) {
    return isPlausibleAttendanceMs(dbMs) ? dbMs : NaN;
  }

  const anchorMs = uid && workDateStr ? readAttendanceCheckInAnchorMs(uid, workDateStr) : NaN;
  const dbOk = isPlausibleAttendanceMs(dbMs);
  const anchorOk = isPlausibleAttendanceMs(anchorMs);

  if (!dbOk && !anchorOk) return NaN;
  if (!dbOk) return anchorMs;
  if (!anchorOk) return dbMs;

  // Server clock ahead of client: prefer local anchor when DB check-in is in the future.
  if (dbMs > nowMs + 2000 && anchorMs <= nowMs + 2000) return anchorMs;

  // Both plausible: use earlier instant, but never pick a corrupt value below min.
  const chosen = Math.min(dbMs, anchorMs);
  return isPlausibleAttendanceMs(chosen) ? chosen : dbMs;
}

/** Net working seconds for one attendance row (live break + open shift supported). */
export function attendanceRowNetSeconds(row, nowMs = Date.now(), opts = {}) {
  if (!row?.check_in_at) return 0;
  const startMs = resolveAttendanceCheckInMs(row, {
    uid: opts.uid,
    workDate: opts.workDate ?? row.work_date,
    nowMs,
  });
  if (!isPlausibleAttendanceMs(startMs)) return 0;
  const endMs = row.check_out_at ? parseAttendanceMs(row.check_out_at) : nowMs;
  if (!isPlausibleAttendanceMs(endMs) || endMs < startMs) return 0;
  const grossSec = Math.min(MAX_SHIFT_GROSS_SEC, Math.floor((endMs - startMs) / 1000));
  const breakStored = Math.max(0, Math.floor(Number(row.break_seconds_total) || 0));
  const breakLiveSec =
    !row.check_out_at && row.break_started_at
      ? Math.max(0, Math.floor((nowMs - parseAttendanceMs(row.break_started_at)) / 1000))
      : 0;
  const breakTotal = Math.min(grossSec, breakStored + breakLiveSec);
  return Math.max(0, grossSec - breakTotal);
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

/** Mon–Sat count as working days for averages (Sun excluded). */
export function isAttendanceWorkWeekday(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow >= 1 && dow <= 6;
}

/** Mon–Sat calendar days in a rolling window ending on todayStr. */
export function countWorkWeekdaysInRollingWindow(todayStr, windowDays) {
  const today = String(todayStr || '').slice(0, 10);
  if (!today || windowDays < 1) return 0;
  let count = 0;
  for (let i = 0; i < windowDays; i += 1) {
    const d = dateStringAddDays(today, -i);
    if (isAttendanceWorkWeekday(d)) count += 1;
  }
  return count;
}

/** @returns {{ totalSec: number, loggedDayCount: number, workDayCount: number, dayCount: number, avgSec: number }} */
export function attendanceAverageForWindow(rows, todayStr, windowDays, nowMs = Date.now(), opts = {}) {
  let totalSec = 0;
  let loggedDayCount = 0;
  for (const row of rows || []) {
    if (!isWorkDateInRollingWindow(row.work_date, todayStr, windowDays)) continue;
    if (!attendanceRowCountsForAverage(row, todayStr, nowMs)) continue;
    totalSec += attendanceRowNetSeconds(row, nowMs, { ...opts, workDate: row.work_date });
    loggedDayCount += 1;
  }
  const workDayCount = countWorkWeekdaysInRollingWindow(todayStr, windowDays);
  return {
    totalSec,
    loggedDayCount,
    workDayCount,
    /** @deprecated Use workDayCount for average denominator; loggedDayCount for days with time. */
    dayCount: workDayCount,
    avgSec: workDayCount > 0 ? Math.round(totalSec / workDayCount) : 0,
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

/** Split stored break seconds into hour/minute/second fields for admin edit forms. */
export function breakSecondsToHms(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  return {
    hours: Math.floor(n / 3600),
    minutes: Math.floor((n % 3600) / 60),
    seconds: n % 60,
  };
}

/** @deprecated Prefer breakSecondsToHms */
export function breakSecondsToHm(totalSec) {
  const { hours, minutes } = breakSecondsToHms(totalSec);
  return { hours, minutes };
}

/** Combine hour/minute/second break fields into total seconds. */
export function breakHmsToSeconds(hours, minutes, seconds = 0) {
  const h = Math.max(0, Math.floor(Number(hours) || 0));
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return h * 3600 + m * 60 + s;
}

/** Combine hour/minute break fields into total seconds. */
export function breakHmToSeconds(hours, minutes) {
  return breakHmsToSeconds(hours, minutes, 0);
}

/** HH:MM:SS label for break / duration previews. */
export function formatDurationHms(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Self-service pause categories while checked in (matches DB erp_normalize_break_type). */
export const ERP_ATTENDANCE_BREAK_GROUPS = [
  { id: 'breaks', label: 'Breaks' },
  { id: 'leave', label: 'Short leave & away' },
  { id: 'work', label: 'Work away' },
  { id: 'other', label: 'Other' },
];

export const ERP_ATTENDANCE_BREAK_TYPES = [
  { id: 'short', group: 'breaks', label: 'Short break', shortLabel: 'Short', hint: 'Tea / coffee (~15 min)' },
  { id: 'lunch', group: 'breaks', label: 'Lunch break', shortLabel: 'Lunch', hint: 'Meal break' },
  { id: 'prayer', group: 'breaks', label: 'Prayer break', shortLabel: 'Prayer', hint: 'Namaz / salah' },
  {
    id: 'short_leave',
    group: 'leave',
    label: 'Short leave',
    shortLabel: 'Short leave',
    hint: 'Few hours off — return same day',
  },
  {
    id: 'personal',
    group: 'leave',
    label: 'Personal leave',
    shortLabel: 'Personal',
    hint: 'Personal errand (same day)',
  },
  {
    id: 'medical',
    group: 'leave',
    label: 'Medical leave',
    shortLabel: 'Medical',
    hint: 'Doctor visit / unwell (same day)',
  },
  {
    id: 'emergency',
    group: 'leave',
    label: 'Emergency leave',
    shortLabel: 'Emergency',
    hint: 'Urgent family or emergency',
  },
  {
    id: 'official',
    group: 'leave',
    label: 'Official errand',
    shortLabel: 'Official',
    hint: 'Bank, client visit, field work',
  },
  {
    id: 'meeting',
    group: 'work',
    label: 'External meeting',
    shortLabel: 'Meeting',
    hint: 'Off-site or external meeting',
  },
  {
    id: 'training',
    group: 'work',
    label: 'Training',
    shortLabel: 'Training',
    hint: 'Course, seminar, or training',
  },
  { id: 'other', group: 'other', label: 'Other pause', shortLabel: 'Other', hint: 'Other paused time today' },
];

const ERP_ATTENDANCE_BREAK_TYPE_IDS = new Set(ERP_ATTENDANCE_BREAK_TYPES.map((t) => t.id));

export function attendanceBreakTypesByGroup() {
  return ERP_ATTENDANCE_BREAK_GROUPS.map((g) => ({
    ...g,
    types: ERP_ATTENDANCE_BREAK_TYPES.filter((t) => t.group === g.id),
  })).filter((g) => g.types.length > 0);
}

export function attendanceBreakTypeMeta(type) {
  const id = normalizeAttendanceBreakType(type);
  return ERP_ATTENDANCE_BREAK_TYPES.find((t) => t.id === id) ?? null;
}

export function normalizeAttendanceBreakType(type) {
  const raw = String(type || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (ERP_ATTENDANCE_BREAK_TYPE_IDS.has(raw)) return raw;
  if (raw === 'general' || raw === 'break' || !raw) return 'general';
  if (['short_break', 'tea', 'coffee', 'tea_break'].includes(raw)) return 'short';
  if (['lunch_break', 'meal'].includes(raw)) return 'lunch';
  if (['namaz', 'salah'].includes(raw)) return 'prayer';
  if (['shortleave', 'half_leave', 'chhuti', 'chutti', 'ghar'].includes(raw)) return 'short_leave';
  if (['sick', 'doctor', 'medical_leave'].includes(raw)) return 'medical';
  if (['urgent'].includes(raw)) return 'emergency';
  if (['work_errand', 'field', 'client_visit', 'bank'].includes(raw)) return 'official';
  if (['external_meeting', 'offsite'].includes(raw)) return 'meeting';
  if (['course', 'seminar', 'workshop'].includes(raw)) return 'training';
  return 'other';
}

export function attendanceBreakTypeLabel(type, { short = false } = {}) {
  const row = attendanceBreakTypeMeta(type);
  if (row) return short ? row.shortLabel : row.label;
  if (normalizeAttendanceBreakType(type) === 'general') return short ? 'Pause' : 'Pause';
  return short ? 'Pause' : 'Pause';
}

/** Label for the active “End …” button. */
export function attendanceBreakEndLabel(type) {
  const row = attendanceBreakTypeMeta(type);
  if (!row) return 'End pause';
  if (row.group === 'breaks') return `End ${row.shortLabel.toLowerCase()} break`;
  return `End ${row.shortLabel.toLowerCase()}`;
}

/** Infer break type from voice / free text (optional). */
export function inferAttendanceBreakTypeFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(short leave|chhuti|chutti|half leave)\b/.test(t)) return 'short_leave';
  if (/\b(medical|doctor|sick)\b/.test(t)) return 'medical';
  if (/\b(emergency|urgent)\b/.test(t)) return 'emergency';
  if (/\b(official|client visit|field work|bank)\b/.test(t)) return 'official';
  if (/\b(meeting|external meeting)\b/.test(t)) return 'meeting';
  if (/\b(training|course|seminar)\b/.test(t)) return 'training';
  if (/\b(lunch|meal)\b/.test(t)) return 'lunch';
  if (/\b(prayer|namaz|salah)\b/.test(t)) return 'prayer';
  if (/\b(personal)\b/.test(t)) return 'personal';
  if (/\b(short|tea|coffee)\b/.test(t)) return 'short';
  return 'general';
}
