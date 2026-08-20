/** @typedef {import('./erp-attendance-policy').ErpAttendancePolicy} ErpAttendancePolicy */

/** Default shift policy — morning office hours in Asia/Karachi (GMT+5). */
export const ERP_ATTENDANCE_POLICY_DEFAULTS = {
  shiftName: 'Morning shift',
  fullDayHours: 8,
  fullDayGraceMinutes: 0,
  halfDayHours: 4,
  shiftStartHour: 9,
  shiftStartMinute: 0,
  shiftEndHour: 17,
  shiftEndMinute: 0,
  arrivalGraceMinutes: 15,
  timezoneLabel: 'GMT+5',
};

/** @type {(value: unknown, min: number, max: number, fallback: number) => number} */
function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** @type {(value: unknown, maxLen: number, fallback: string) => string} */
function clampText(value, maxLen, fallback) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return fallback;
  return s.slice(0, maxLen);
}

/**
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {ErpAttendancePolicy}
 */
export function normalizeAttendancePolicy(raw) {
  const d = ERP_ATTENDANCE_POLICY_DEFAULTS;
  const src = raw && typeof raw === 'object' ? raw : {};

  const shiftStartHour = clampInt(src.shiftStartHour, 0, 23, d.shiftStartHour);
  const shiftStartMinute = clampInt(src.shiftStartMinute, 0, 59, d.shiftStartMinute);
  const shiftEndHour = clampInt(src.shiftEndHour, 0, 23, d.shiftEndHour);
  const shiftEndMinute = clampInt(src.shiftEndMinute, 0, 59, d.shiftEndMinute);

  let fullDayHours = clampInt(src.fullDayHours, 1, 16, d.fullDayHours);
  const startMin = shiftStartHour * 60 + shiftStartMinute;
  let endMin = shiftEndHour * 60 + shiftEndMinute;
  if (endMin <= startMin) endMin += 24 * 60;
  const spanHours = Math.max(1, Math.round((endMin - startMin) / 60));
  if (!Number.isFinite(Number(src.fullDayHours))) {
    fullDayHours = spanHours;
  }

  return {
    shiftName: clampText(src.shiftName, 80, d.shiftName),
    fullDayHours,
    fullDayGraceMinutes: clampInt(src.fullDayGraceMinutes, 0, 120, d.fullDayGraceMinutes),
    halfDayHours: clampInt(src.halfDayHours, 1, 12, d.halfDayHours),
    shiftStartHour,
    shiftStartMinute,
    shiftEndHour,
    shiftEndMinute,
    arrivalGraceMinutes: clampInt(src.arrivalGraceMinutes, 0, 120, d.arrivalGraceMinutes),
    timezoneLabel: clampText(src.timezoneLabel, 32, d.timezoneLabel),
  };
}

/**
 * @param {{ attendance_policy?: Record<string, unknown> | null } | null | undefined} row
 */
export function workspaceSettingsFromRow(row) {
  return {
    attendancePolicy: normalizeAttendancePolicy(row?.attendance_policy),
  };
}

/** @param {ErpAttendancePolicy} policy */
export function attendancePolicyToForm(policy) {
  const p = normalizeAttendancePolicy(policy);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    shiftName: p.shiftName,
    shiftStart: `${pad(p.shiftStartHour)}:${pad(p.shiftStartMinute)}`,
    shiftEnd: `${pad(p.shiftEndHour)}:${pad(p.shiftEndMinute)}`,
    fullDayHours: String(p.fullDayHours),
    fullDayGraceMinutes: String(p.fullDayGraceMinutes),
    halfDayHours: String(p.halfDayHours),
    arrivalGraceMinutes: String(p.arrivalGraceMinutes),
    timezoneLabel: p.timezoneLabel,
  };
}

/**
 * @param {Record<string, string>} form
 * @returns {{ policy: ErpAttendancePolicy, error?: string }}
 */
export function attendancePolicyFromForm(form) {
  const parseClock = (raw, label) => {
    const s = String(raw || '').trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return { error: `${label} must be HH:MM (24-hour).` };
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) return { error: `${label} is out of range.` };
    return { hour, minute };
  };

  const start = parseClock(form.shiftStart, 'Shift start');
  if (start.error) return { policy: ERP_ATTENDANCE_POLICY_DEFAULTS, error: start.error };
  const end = parseClock(form.shiftEnd, 'Shift end');
  if (end.error) return { policy: ERP_ATTENDANCE_POLICY_DEFAULTS, error: end.error };

  const policy = normalizeAttendancePolicy({
    shiftName: form.shiftName,
    shiftStartHour: start.hour,
    shiftStartMinute: start.minute,
    shiftEndHour: end.hour,
    shiftEndMinute: end.minute,
    fullDayHours: form.fullDayHours,
    fullDayGraceMinutes: form.fullDayGraceMinutes,
    halfDayHours: form.halfDayHours,
    arrivalGraceMinutes: form.arrivalGraceMinutes,
    timezoneLabel: form.timezoneLabel,
  });

  return { policy };
}
