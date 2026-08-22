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

/** ERP attendance calendar timezone (matches DB `erp_attendance_timezone()`). */
export const ERP_ATTENDANCE_TIMEZONE = 'Asia/Karachi';

/** Local date + clock in ERP attendance timezone (Asia/Karachi). */
export function attendanceKarachiParts(isoOrMs) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : parseAttendanceMs(isoOrMs);
  if (Number.isNaN(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ERP_ATTENDANCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) return null;
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return {
    dateStr: `${year}-${month}-${day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

/** True when row is a prior-day open shift (missing punch — no hours accrue). */
export function isPastOpenAttendanceRow(row, todayStr) {
  if (!row?.check_in_at || row.check_out_at) return false;
  const wd = String(row.work_date || '').slice(0, 10);
  const today = String(todayStr || '').slice(0, 10);
  return Boolean(wd && today && wd < today);
}

/** Assumed net hours on bar charts when a past day has check-in but no check-out. */
export const ATTENDANCE_CHART_MISSING_CHECKOUT_SEC = 7 * 3600;

/** Net seconds for bar charts — past open shifts render as a full 7h bar. */
export function attendanceRowChartNetSeconds(row, nowMs = Date.now(), opts = {}) {
  const todayStr = opts.todayStr ? String(opts.todayStr).slice(0, 10) : localDateString();
  const workDate = String(opts.workDate ?? row?.work_date ?? '').slice(0, 10);
  const netSec = attendanceRowNetSeconds(row, nowMs, { ...opts, todayStr, workDate });
  if (netSec > 0) return netSec;
  if (row?.check_in_at && !row.check_out_at && isPastOpenAttendanceRow(row, todayStr)) {
    return ATTENDANCE_CHART_MISSING_CHECKOUT_SEC;
  }
  return 0;
}

/** Max gross span for one attendance day row (sanity cap). */
export const MAX_SHIFT_GROSS_SEC = 86400 * 2;

/** Shifts longer than this are treated as corrupt (Super Admin fix / display). */
export const ERP_ATTENDANCE_MAX_PLAUSIBLE_GROSS_SEC = 11 * 3600;

/** @returns {boolean} True when completed row gross time exceeds plausible max. */
export function attendanceRowHasImplausibleGross(row) {
  if (!row?.check_in_at || !row?.check_out_at) return false;
  const a = parseAttendanceMs(row.check_in_at);
  const b = parseAttendanceMs(row.check_out_at);
  if (!isPlausibleAttendanceMs(a) || !isPlausibleAttendanceMs(b) || b < a) return false;
  const grossSec = Math.floor((b - a) / 1000);
  return grossSec > ERP_ATTENDANCE_MAX_PLAUSIBLE_GROSS_SEC;
}

/** Treat implausible completed rows as missing checkout (member + admin UI). */
export function attendanceRowForDisplay(row) {
  if (!row || !attendanceRowHasImplausibleGross(row)) return row;
  return { ...row, check_out_at: null };
}

/** @deprecated use attendanceRowForDisplay */
export const attendanceRowForAdminDisplay = attendanceRowForDisplay;

function isPlausibleAttendanceMs(ms) {
  return Number.isFinite(ms) && ms >= MIN_ATTENDANCE_MS;
}

export function readAttendanceCheckInAnchorMs(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return NaN;
  const raw = sessionStorage.getItem(`${CHECK_IN_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`);
  const n = Number(raw);
  return isPlausibleAttendanceMs(n) ? n : NaN;
}

/** True when row is checked in and not yet checked out. */
export function isOpenAttendanceRow(row) {
  return Boolean(row?.check_in_at && !row?.check_out_at);
}

/** Attendance row for the current work date only (never another day's open shift). */
export function pickTodayAttendanceRow(rows, todayStr) {
  const today = String(todayStr || '').slice(0, 10);
  if (!today) return null;
  return (rows || []).find((r) => String(r.work_date || '').slice(0, 10) === today) ?? null;
}

/** Most recent open shift from a prior work_date (forgot to check out). */
export function findStaleOpenAttendanceRow(rows, todayStr) {
  const today = String(todayStr || '').slice(0, 10);
  const stale = (rows || []).filter((r) => {
    const wd = String(r.work_date || '').slice(0, 10);
    return wd && wd !== today && isOpenAttendanceRow(r);
  });
  if (stale.length === 0) return null;
  stale.sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)));
  return stale[0];
}

/** Sync server work_date; expire stale open shifts (missing punch, no fake checkout). */
export async function syncErpAttendanceDay(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('erp_attendance_sync_pk');
  if (error) throw error;
  const raw = data?.work_date;
  const workDate =
    raw == null
      ? null
      : typeof raw === 'string'
        ? raw.slice(0, 10)
        : String(raw).slice(0, 10);
  return {
    workDate: workDate && /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? workDate : null,
    expiredCount: Math.max(0, Number(data?.expired_count) || 0),
  };
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

const BREAK_START_ANCHOR_PREFIX = 'erp-attendance-break-start-ms:';

export function readAttendanceBreakStartAnchorMs(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return NaN;
  const raw = sessionStorage.getItem(`${BREAK_START_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`);
  const n = Number(raw);
  return isPlausibleAttendanceMs(n) ? n : NaN;
}

export function purgeInvalidAttendanceBreakStartAnchor(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return;
  const key = `${BREAK_START_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`;
  const raw = sessionStorage.getItem(key);
  if (raw == null) return;
  const n = Number(raw);
  if (!isPlausibleAttendanceMs(n)) sessionStorage.removeItem(key);
}

export function writeAttendanceBreakStartAnchorMs(uid, workDate, ms) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return;
  const n = Number(ms);
  if (!isPlausibleAttendanceMs(n)) return;
  sessionStorage.setItem(`${BREAK_START_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`, String(Math.floor(n)));
}

export function clearAttendanceBreakStartAnchorMs(uid, workDate) {
  if (!uid || !workDate || typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(`${BREAK_START_ANCHOR_PREFIX}${uid}:${String(workDate).slice(0, 10)}`);
}

/** Resolve break-start instant for live break timers (handles server/client clock skew). */
export function resolveAttendanceBreakStartMs(breakStartedIso, { uid, workDate, nowMs = Date.now() } = {}) {
  const dbMs = parseAttendanceMs(breakStartedIso);
  const anchorMs = uid && workDate ? readAttendanceBreakStartAnchorMs(uid, workDate) : NaN;
  const dbOk = isPlausibleAttendanceMs(dbMs);
  const anchorOk = isPlausibleAttendanceMs(anchorMs);

  if (!dbOk && !anchorOk) return NaN;
  if (!dbOk) return anchorMs;
  if (!anchorOk) return dbMs;

  if (dbMs > nowMs + 2000 && anchorMs <= nowMs + 2000) return anchorMs;

  const chosen = Math.min(dbMs, anchorMs);
  return isPlausibleAttendanceMs(chosen) ? chosen : dbMs;
}

/** Live break seconds for an open break (uses break-start anchor when needed). */
export function attendanceLiveBreakSeconds(row, nowMs = Date.now(), opts = {}) {
  if (!row?.break_started_at || row.check_out_at) return 0;
  const todayStr = opts.todayStr ? String(opts.todayStr).slice(0, 10) : localDateString();
  if (isPastOpenAttendanceRow(row, todayStr)) return 0;
  const startMs = resolveAttendanceBreakStartMs(row.break_started_at, {
    uid: opts.uid,
    workDate: opts.workDate ?? row.work_date,
    nowMs,
  });
  if (!isPlausibleAttendanceMs(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
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
  const workDate = String(opts.workDate ?? row.work_date ?? '').slice(0, 10);
  const todayStr = opts.todayStr ? String(opts.todayStr).slice(0, 10) : localDateString();
  if (isPastOpenAttendanceRow(row, todayStr)) return 0;

  const startMs = resolveAttendanceCheckInMs(row, {
    uid: opts.uid,
    workDate,
    nowMs,
  });
  if (!isPlausibleAttendanceMs(startMs)) return 0;
  const endMs = row.check_out_at ? parseAttendanceMs(row.check_out_at) : nowMs;
  if (!isPlausibleAttendanceMs(endMs) || endMs < startMs) return 0;
  const grossSec = Math.min(MAX_SHIFT_GROSS_SEC, Math.floor((endMs - startMs) / 1000));
  const breakStored = Math.max(0, Math.floor(Number(row.break_seconds_total) || 0));
  const breakLiveSec =
    !row.check_out_at && row.break_started_at
      ? attendanceLiveBreakSeconds(row, nowMs, opts)
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
    /** Days with logged time in the window (average denominator). */
    dayCount: loggedDayCount,
    avgSec: loggedDayCount > 0 ? Math.round(totalSec / loggedDayCount) : 0,
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

/** Break category groups (charts / admin). */
export const ERP_ATTENDANCE_BREAK_GROUPS = [
  { id: 'breaks', label: 'Breaks' },
  { id: 'leave', label: 'Leave' },
  { id: 'work', label: 'Work' },
  { id: 'other', label: 'Other' },
];

/** Known break / pause types (matches DB `erp_normalize_break_type`). */
export const ERP_ATTENDANCE_BREAK_TYPES = [
  { id: 'lunch', group: 'breaks', label: 'Lunch break', shortLabel: 'Lunch' },
  { id: 'prayer', group: 'breaks', label: 'Namaz break', shortLabel: 'Namaz' },
  { id: 'short', group: 'breaks', label: 'Short break', shortLabel: 'Short' },
  { id: 'personal', group: 'breaks', label: 'Personal break', shortLabel: 'Personal' },
  { id: 'medical', group: 'leave', label: 'Medical break', shortLabel: 'Medical' },
  { id: 'short_leave', group: 'leave', label: 'Short leave', shortLabel: 'Short leave' },
  { id: 'official', group: 'work', label: 'Official errand', shortLabel: 'Official' },
  { id: 'meeting', group: 'work', label: 'Meeting', shortLabel: 'Meeting' },
  { id: 'training', group: 'work', label: 'Training', shortLabel: 'Training' },
  { id: 'other', group: 'other', label: 'Other', shortLabel: 'Other' },
];

/** Options shown in the member “Break options” menu. */
export const ERP_ATTENDANCE_BREAK_MENU_TYPES = [
  'lunch',
  'prayer',
  'short',
  'personal',
  'medical',
  'official',
  'meeting',
  'other',
];

const BREAK_TYPE_BY_ID = Object.fromEntries(ERP_ATTENDANCE_BREAK_TYPES.map((t) => [t.id, t]));

export function attendanceBreakTypesByGroup() {
  const map = new Map();
  for (const g of ERP_ATTENDANCE_BREAK_GROUPS) map.set(g.id, []);
  for (const t of ERP_ATTENDANCE_BREAK_TYPES) {
    if (!map.has(t.group)) map.set(t.group, []);
    map.get(t.group).push(t);
  }
  return [...map.entries()].map(([group, types]) => ({
    group,
    label: ERP_ATTENDANCE_BREAK_GROUPS.find((g) => g.id === group)?.label || group,
    types,
  }));
}

export function attendanceBreakTypeMeta(type) {
  const id = normalizeAttendanceBreakType(type);
  return BREAK_TYPE_BY_ID[id] || BREAK_TYPE_BY_ID.other;
}

export function attendanceBreakTypeLabel(type, { short = false } = {}) {
  const meta = attendanceBreakTypeMeta(type);
  return short ? meta.shortLabel : meta.label;
}

export function normalizeAttendanceBreakType(type) {
  const v = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (['short', 'short_break', 'tea', 'coffee', 'tea_break'].includes(v)) return 'short';
  if (['lunch', 'lunch_break', 'meal'].includes(v)) return 'lunch';
  if (['prayer', 'namaz', 'salah'].includes(v)) return 'prayer';
  if (['short_leave', 'shortleave', 'half_leave', 'chhuti', 'chutti'].includes(v)) return 'short_leave';
  if (v === 'personal') return 'personal';
  if (['medical', 'medical_leave', 'sick', 'doctor'].includes(v)) return 'medical';
  if (['emergency', 'urgent'].includes(v)) return 'emergency';
  if (['official', 'work_errand', 'field', 'client_visit', 'bank'].includes(v)) return 'official';
  if (['meeting', 'external_meeting', 'offsite'].includes(v)) return 'meeting';
  if (['training', 'course', 'seminar', 'workshop'].includes(v)) return 'training';
  if (v === 'other') return 'other';
  if (['general', 'break', ''].includes(v)) return 'general';
  return 'other';
}

export function attendanceBreakEndLabel(breakType) {
  if (breakType && breakType !== 'general') {
    return `End ${attendanceBreakTypeLabel(breakType, { short: true }).toLowerCase()}`;
  }
  return 'Resume work';
}

/** Infer break type from voice / free text. */
export function inferAttendanceBreakTypeFromText(text) {
  const raw = String(text || '').toLowerCase();
  if (/\b(lunch|meal)\b/.test(raw)) return 'lunch';
  if (/\b(namaz|prayer|salah)\b/.test(raw)) return 'prayer';
  if (/\b(short leave|chhuti|chutti)\b/.test(raw)) return 'short_leave';
  if (/\b(medical|doctor|sick)\b/.test(raw)) return 'medical';
  if (/\b(meeting|client)\b/.test(raw)) return 'meeting';
  if (/\b(training|course|workshop)\b/.test(raw)) return 'training';
  if (/\b(official|bank|errand|field)\b/.test(raw)) return 'official';
  if (/\b(personal)\b/.test(raw)) return 'personal';
  if (/\b(tea|coffee|short)\b/.test(raw)) return 'short';
  return 'general';
}

const NEEDS_ME_DISMISS_PREFIX = 'erp-attendance-needs-me-dismissed:';

export function needsMeDismissKey(kind, dateStr) {
  return `${kind}:${String(dateStr).slice(0, 10)}`;
}

export function readDismissedNeedsMeSet(uid) {
  if (!uid || typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(`${NEEDS_ME_DISMISS_PREFIX}${uid}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function dismissNeedsMeItem(uid, kind, dateStr) {
  if (!uid || typeof localStorage === 'undefined') return;
  const set = readDismissedNeedsMeSet(uid);
  set.add(needsMeDismissKey(kind, dateStr));
  localStorage.setItem(`${NEEDS_ME_DISMISS_PREFIX}${uid}`, JSON.stringify([...set]));
}

export function filterDismissedNeedsMeItems(uid, items) {
  if (!uid) return items || [];
  const dismissed = readDismissedNeedsMeSet(uid);
  return (items || []).filter((item) => !dismissed.has(needsMeDismissKey(item.kind, item.dateStr)));
}
