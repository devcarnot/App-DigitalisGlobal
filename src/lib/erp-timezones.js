// Lightweight timezone helpers for the meetings UI.
//
// The schedule modal lets organizers enter a wall-clock time directly in (say)
// the client's timezone instead of mentally converting from their own. To keep
// the rest of the app DST-safe we always store an absolute instant
// (`scheduled_at` is `timestamptz`), and only persist the originating zone as
// metadata on `erp_meetings.time_zone`.
//
// All exports are pure JS: no third-party deps: so this file is safe to
// import from both client and server bundles.

const FEATURED_ZONES = Object.freeze([
  'UTC',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Toronto',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Mexico_City',
]);

export function getLocalTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Returns the wall-clock components ({year, month, day, hour, minute, second})
 * of the absolute instant `date` rendered in `timeZone`. Uses the platform's
 * Intl tables so it stays DST-correct.
 */
export function wallTimeParts(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const o = {};
    for (const p of parts) o[p.type] = p.value;
    const hour = parseInt(o.hour, 10);
    return {
      year: parseInt(o.year, 10),
      month: parseInt(o.month, 10),
      day: parseInt(o.day, 10),
      // Some platforms report midnight as "24" under h23: clamp to 0.
      hour: Number.isFinite(hour) ? hour % 24 : 0,
      minute: parseInt(o.minute, 10),
      second: parseInt(o.second || '0', 10),
    };
  } catch {
    // Fallback: treat as the user's local time (still better than crashing).
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
}

/**
 * Renders an absolute `date` as a `YYYY-MM-DDTHH:mm` wall-clock string in the
 * given timezone: matches the value format expected by `<input
 * type="datetime-local">`.
 */
export function ymdHmInZone(date, timeZone) {
  const p = wallTimeParts(date, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Inverse of `ymdHmInZone`: take the wall-clock value the user typed in
 * `<input type="datetime-local">` (e.g. "2026-05-14T15:00") and return the
 * absolute UTC `Date` that maps to that wall time in `timeZone`.
 *
 * We iterate up to three times to converge on DST transition days (and on
 * zones whose offset jumps by half-hours). Returns `null` for unparseable
 * input.
 */
export function zonedWallTimeToUTC(wallString, timeZone) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2})/.exec(String(wallString || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const targetUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(targetUTC);
  for (let i = 0; i < 3; i += 1) {
    const w = wallTimeParts(candidate, timeZone);
    const wAsUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0);
    const diff = wAsUTC - targetUTC;
    if (diff === 0) break;
    candidate = new Date(candidate.getTime() - diff);
  }
  return candidate;
}

/**
 * Returns the timezone offset (in minutes, positive east of UTC) at the
 * given absolute instant.
 */
export function getZoneOffsetMinutes(date, timeZone) {
  const w = wallTimeParts(date, timeZone);
  const wAsUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((wAsUTC - date.getTime()) / 60000);
}

export function formatZoneOffset(date, timeZone) {
  const mins = getZoneOffsetMinutes(date, timeZone);
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function getZoneShortName(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value || '';
  } catch {
    return '';
  }
}

/**
 * Return a featured + alphabetised IANA zone list. We surface a curated
 * "popular zones" group at the top so the dropdown isn't a 400-row scroll
 * for the common case (UTC + the locales most teams operate in).
 */
export function getAllTimeZones() {
  let all = [];
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      all = Intl.supportedValuesOf('timeZone') || [];
    }
  } catch {
    /* not supported on this runtime */
  }
  if (!Array.isArray(all) || all.length === 0) {
    return FEATURED_ZONES.slice();
  }
  const featuredSet = new Set(FEATURED_ZONES);
  const rest = all.filter((z) => !featuredSet.has(z)).sort((a, b) => a.localeCompare(b));
  return [...FEATURED_ZONES, ...rest];
}

export function getFeaturedTimeZones() {
  return FEATURED_ZONES.slice();
}

export function isValidIanaTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    // Throws RangeError for invalid IANA names.
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty label for a timezone option, e.g. `Asia/Karachi · PKT (+05:00)`.
 * The reference instant defaults to "right now" so DST-aware short names show
 * the currently active offset.
 */
export function describeTimeZone(timeZone, refDate = new Date()) {
  const offset = formatZoneOffset(refDate, timeZone);
  const short = getZoneShortName(refDate, timeZone);
  const cleanedShort = short && short !== timeZone ? short : '';
  return cleanedShort ? `${timeZone} · ${cleanedShort} (${offset})` : `${timeZone} (${offset})`;
}
