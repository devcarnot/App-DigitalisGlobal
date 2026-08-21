import {
  attendanceKarachiParts,
  attendanceLiveBreakSeconds,
  attendanceRowNetSeconds,
  dateStringAddDays,
  ERP_ATTENDANCE_TIMEZONE,
  isAttendanceWorkWeekday,
  isPastOpenAttendanceRow,
  localDateString,
  parseAttendanceMs,
} from './erp-attendance';
import { ERP_ATTENDANCE_POLICY_DEFAULTS, normalizeAttendancePolicy } from './erp-workspace-settings';

/** Live shift policy — updated when workspace settings load or admin saves. */
export const ERP_ATTENDANCE_POLICY = { ...ERP_ATTENDANCE_POLICY_DEFAULTS };

/** @typedef {typeof ERP_ATTENDANCE_POLICY_DEFAULTS} ErpAttendancePolicy */

/** @param {Partial<ErpAttendancePolicy> | null | undefined} partial */
export function applyAttendancePolicyOverride(partial) {
  const next = normalizeAttendancePolicy({ ...ERP_ATTENDANCE_POLICY, ...(partial || {}) });
  Object.assign(ERP_ATTENDANCE_POLICY, next);
}

function fullDaySec() {
  return ERP_ATTENDANCE_POLICY.fullDayHours * 3600 - ERP_ATTENDANCE_POLICY.fullDayGraceMinutes * 60;
}

function halfDaySec() {
  return ERP_ATTENDANCE_POLICY.halfDayHours * 3600;
}

export function getFullDayNetSeconds() {
  return fullDaySec();
}

function formatPolicyClock(totalMinutes) {
  const mins = ((Math.floor(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;
  const h12 = hour % 12 || 12;
  const mm = minute ? `:${String(minute).padStart(2, '0')}` : ':00';
  const ap = hour >= 12 ? 'PM' : 'AM';
  return `${h12}${mm} ${ap}`;
}

export function shiftStartLabel() {
  const p = ERP_ATTENDANCE_POLICY;
  return formatPolicyClock(p.shiftStartHour * 60 + p.shiftStartMinute);
}

export function shiftEndLabel() {
  const p = ERP_ATTENDANCE_POLICY;
  return formatPolicyClock(p.shiftEndHour * 60 + p.shiftEndMinute);
}

export function shiftGraceDeadlineLabel() {
  const p = ERP_ATTENDANCE_POLICY;
  return formatPolicyClock(p.shiftStartHour * 60 + p.shiftStartMinute + p.arrivalGraceMinutes);
}

const FULL_DAY_SEC = () => fullDaySec();
const HALF_DAY_SEC = () => halfDaySec();

/** @typedef {'full'|'short'|'half'|'absent'|'leave'|'missing'|'open'|'off'|'future'|'none'} AttendanceDayOutcome */

/**
 * @param {object} row
 * @param {string} todayStr
 * @param {number} nowMs
 * @param {{ uid?: string, approvedLeaveDates?: Set<string> }} [opts]
 * @returns {AttendanceDayOutcome}
 */
export function classifyAttendanceDayOutcome(row, todayStr, nowMs, opts = {}) {
  const wd = String(row?.work_date || '').slice(0, 10);
  const today = String(todayStr || '').slice(0, 10);
  const leaveDates = opts.approvedLeaveDates;

  if (wd && leaveDates?.has(wd)) return 'leave';
  if (!isAttendanceWorkWeekday(wd) && wd) return 'off';

  if (!row?.check_in_at) {
    if (wd > today) return 'future';
    if (wd === today) return 'none';
    return 'absent';
  }

  if (!row.check_out_at) {
    if (wd === today) return 'open';
    return 'missing';
  }

  const netSec = attendanceRowNetSeconds(row, nowMs, { uid: opts.uid, workDate: wd, todayStr });
  if (netSec >= FULL_DAY_SEC()) return 'full';
  if (netSec >= HALF_DAY_SEC()) return 'short';
  if (netSec > 0) return 'half';
  return 'absent';
}

/** @typedef {'early'|'on_time'|'late'|'none'} AttendanceArrivalBand */

/** @param {string|undefined|null} checkInIso @param {string} [workDateStr] YYYY-MM-DD work day */
export function classifyAttendanceArrival(checkInIso, workDateStr) {
  const parts = attendanceKarachiParts(checkInIso);
  if (!parts) return 'none';

  const wd = workDateStr ? String(workDateStr).slice(0, 10) : parts.dateStr;
  const startMin =
    ERP_ATTENDANCE_POLICY.shiftStartHour * 60 + ERP_ATTENDANCE_POLICY.shiftStartMinute;
  const graceEnd = startMin + ERP_ATTENDANCE_POLICY.arrivalGraceMinutes;

  let checkMin = parts.minutesOfDay;
  if (parts.dateStr > wd) {
    return 'late';
  }
  if (parts.dateStr < wd) {
    return 'early';
  }

  if (checkMin < startMin) return 'early';
  if (checkMin <= graceEnd) return 'on_time';
  return 'late';
}

export const ATTENDANCE_OUTCOME_META = {
  full: { label: 'Full day', cell: 'bg-[#103D4D] text-white', band: 'bg-sky-500' },
  short: { label: 'Short day', cell: 'bg-amber-300 text-amber-950', band: 'bg-[#103D4D]' },
  half: { label: 'Half day', cell: 'bg-orange-400 text-white', band: 'bg-[#103D4D]' },
  absent: { label: 'Absent', cell: 'bg-red-500 text-white', band: 'bg-slate-200' },
  leave: { label: 'Approved leave', cell: 'bg-slate-300 text-slate-700', band: 'bg-slate-200' },
  missing: {
    label: 'Missing punch',
    cell: 'bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#fff_3px_6px)] border border-slate-300 text-slate-700',
    band: 'bg-[#103D4D]',
  },
  open: {
    label: 'Open today',
    cell: 'border-[1.5px] border-dashed border-teal-500 bg-teal-50 text-teal-900',
    band: 'bg-orange-500',
  },
  off: { label: 'Off', cell: 'bg-slate-100 text-slate-400 border border-slate-200', band: '' },
  future: { label: 'Upcoming', cell: 'border border-dashed border-slate-200 text-slate-400', band: '' },
  none: { label: 'Not started', cell: 'border border-dashed border-slate-200 text-slate-400', band: '' },
};

export const ATTENDANCE_ARRIVAL_META = {
  early: { label: 'Early in', band: 'bg-sky-500' },
  on_time: { label: 'On time', band: 'bg-[#103D4D]' },
  late: { label: 'Late in', band: 'bg-orange-500' },
  none: { label: 'No arrival', band: 'bg-slate-200' },
};

/** @param {number} totalSec */
export function formatAttendanceHm(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return '0m';
}

/** @param {object} row */
export function attendanceRowGrossSeconds(row, nowMs, opts = {}) {
  if (!row?.check_in_at) return 0;
  const todayStr = opts.todayStr ? String(opts.todayStr).slice(0, 10) : localDateString();
  if (isPastOpenAttendanceRow(row, todayStr)) return 0;
  const startMs = parseAttendanceMs(row.check_in_at);
  const endMs = row.check_out_at ? parseAttendanceMs(row.check_out_at) : nowMs;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / 1000);
}

/** @param {object} row */
export function attendanceRowBreakTotalSeconds(row, nowMs, opts = {}) {
  const stored = Math.max(0, Number(row.break_seconds_total) || 0);
  const live = attendanceLiveBreakSeconds(row, nowMs, opts);
  return stored + live;
}

/**
 * @param {string} monthStr YYYY-MM
 * @param {object[]} rows
 * @param {string} todayStr
 * @param {number} nowMs
 * @param {{ uid?: string, approvedLeaveDates?: Set<string> }} opts
 */
export function buildMonthCalendarCells(monthStr, rows, todayStr, nowMs, opts = {}) {
  const [y, mo] = String(monthStr).slice(0, 7).split('-').map(Number);
  if (!y || !mo) return [];
  const first = new Date(y, mo - 1, 1);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const rowByDate = Object.fromEntries(
    (rows || []).map((r) => [String(r.work_date).slice(0, 10), r]),
  );
  const cells = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const row = rowByDate[dateStr];
    const outcome = classifyAttendanceDayOutcome(row || { work_date: dateStr }, todayStr, nowMs, opts);
    const arrival = row?.check_in_at ? classifyAttendanceArrival(row.check_in_at, dateStr) : 'none';
    const dt = new Date(`${dateStr}T12:00:00`);
    cells.push({
      dateStr,
      day,
      weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
      isSunday: dt.getDay() === 0,
      isToday: dateStr === String(todayStr).slice(0, 10),
      outcome,
      arrival,
      row: row || null,
    });
  }
  return cells;
}

/**
 * Outcome counts for every day in a calendar month up to today.
 * @param {object[]} rows
 * @param {string} monthStr YYYY-MM
 * @param {string} todayStr
 * @param {number} nowMs
 * @param {{ uid?: string, approvedLeaveDates?: Set<string> }} opts
 */
export function summarizeMonthOutcomes(rows, monthStr, todayStr, nowMs, opts = {}) {
  const [y, mo] = String(monthStr).slice(0, 7).split('-').map(Number);
  if (!y || !mo) {
    return { full: 0, short: 0, half: 0, absent: 0, leave: 0, missing: 0, open: 0 };
  }
  const daysInMonth = new Date(y, mo, 0).getDate();
  const rowByDate = Object.fromEntries(
    (rows || []).map((r) => [String(r.work_date).slice(0, 10), r]),
  );
  const counts = { full: 0, short: 0, half: 0, absent: 0, leave: 0, missing: 0, open: 0 };
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr > todayStr) continue;
    const row = rowByDate[dateStr];
    const outcome = classifyAttendanceDayOutcome(row || { work_date: dateStr }, todayStr, nowMs, opts);
    if (counts[outcome] != null) counts[outcome] += 1;
  }
  return counts;
}

/**
 * @param {object[]} rows
 * @param {string} todayStr
 * @param {number} dayCount
 * @param {number} nowMs
 * @param {{ uid?: string, approvedLeaveDates?: Set<string> }} opts
 */
export function summarizeAttendanceOutcomes(rows, todayStr, dayCount, nowMs, opts = {}) {
  const from = dateStringAddDays(todayStr, -(dayCount - 1));
  const counts = { full: 0, short: 0, half: 0, absent: 0, leave: 0, missing: 0, open: 0 };
  let d = from;
  let guard = 0;
  while (d <= todayStr && guard < 400) {
    guard += 1;
    const row = (rows || []).find((r) => String(r.work_date).slice(0, 10) === d);
    const outcome = classifyAttendanceDayOutcome(row || { work_date: d }, todayStr, nowMs, opts);
    if (counts[outcome] != null) counts[outcome] += 1;
    d = dateStringAddDays(d, 1);
  }
  return counts;
}

/** @param {object[]} rows @param {string} todayStr @param {number} nowMs @param {{ uid?: string }} opts */
export function aggregateMemberNetSeconds(rows, todayStr, dayCount, nowMs, opts = {}) {
  const from = dateStringAddDays(todayStr, -(dayCount - 1));
  let total = 0;
  for (const row of rows || []) {
    const wd = String(row.work_date || '').slice(0, 10);
    if (wd < from || wd > todayStr) continue;
    if (!row.check_in_at) continue;
    total += attendanceRowNetSeconds(row, nowMs, { uid: opts.uid, workDate: wd, todayStr });
  }
  return total;
}

export function currentMonthString(d = new Date()) {
  return localDateString(d).slice(0, 7);
}

export function shiftPolicySubtitleFromPolicy(p = ERP_ATTENDANCE_POLICY) {
  const start = formatPolicyClock(p.shiftStartHour * 60 + p.shiftStartMinute);
  const end = formatPolicyClock(p.shiftEndHour * 60 + p.shiftEndMinute);
  const lateAfter = formatPolicyClock(
    p.shiftStartHour * 60 + p.shiftStartMinute + p.arrivalGraceMinutes,
  );
  return `${p.shiftName} · ${start} – ${end} · full day ${p.fullDayHours}h · early before ${start} · late after ${lateAfter} · ${p.timezoneLabel}`;
}

export function shiftPolicySubtitle() {
  return shiftPolicySubtitleFromPolicy(ERP_ATTENDANCE_POLICY);
}

/** @typedef {'working'|'break'|'leave'|'not_in'|'done'} AttendancePresenceKind */

/**
 * Live presence for today.
 * @param {object|null|undefined} todayRow
 * @param {string} todayStr
 * @param {{ approvedLeaveDates?: Set<string> }} [opts]
 * @returns {AttendancePresenceKind}
 */
export function classifyMemberPresence(todayRow, todayStr, opts = {}) {
  const wd = String(todayStr || '').slice(0, 10);
  if (opts.approvedLeaveDates?.has(wd)) return 'leave';
  if (!todayRow?.check_in_at) return 'not_in';
  if (todayRow.check_out_at) return 'done';
  if (todayRow.break_started_at) return 'break';
  return 'working';
}

export const ATTENDANCE_PRESENCE_META = {
  working: { label: 'In office', dot: 'bg-[#103D4D]', tone: 'text-slate-800 dark:text-white' },
  break: { label: 'On break', dot: 'bg-amber-400', tone: 'text-slate-800 dark:text-white' },
  leave: { label: 'On leave', dot: 'bg-slate-400', tone: 'text-slate-500 dark:text-slate-200' },
  not_in: { label: 'Not in', dot: 'bg-amber-400', tone: 'text-amber-800 dark:text-amber-200' },
  done: { label: 'Checked out', dot: 'bg-slate-300', tone: 'text-slate-500 dark:text-white' },
};

/**
 * Build approved leave date set from leave request rows.
 * @param {object[]} leaveRows
 * @param {string} userId
 */
export function buildApprovedLeaveDateSet(leaveRows, userId) {
  const set = new Set();
  for (const req of leaveRows || []) {
    if (req.user_id !== userId) continue;
    if (String(req.status || '').toLowerCase() !== 'approved') continue;
    let d = String(req.start_date || '').slice(0, 10);
    const end = String(req.end_date || req.start_date || '').slice(0, 10);
    let guard = 0;
    while (d && d <= end && guard < 400) {
      guard += 1;
      set.add(d);
      d = dateStringAddDays(d, 1);
    }
  }
  return set;
}

/**
 * Flagged days needing member action.
 * @param {object[]} rows
 * @param {string} todayStr
 * @param {number} nowMs
 * @param {{ uid?: string, approvedLeaveDates?: Set<string> }} opts
 */
export function buildAttendanceNeedsMeItems(rows, todayStr, nowMs, opts = {}) {
  const historyDays = opts.historyDays ?? 60;
  const from = dateStringAddDays(todayStr, -historyDays);
  const rowByDate = Object.fromEntries(
    (rows || []).map((r) => [String(r.work_date).slice(0, 10), r]),
  );
  const items = [];
  let d = from;
  let guard = 0;
  while (d < todayStr && guard < 400) {
    guard += 1;
    const row = rowByDate[d];
    const outcome = classifyAttendanceDayOutcome(row || { work_date: d }, todayStr, nowMs, opts);
    if (outcome === 'missing') {
      items.push({
        kind: 'missing',
        dateStr: d,
        attendanceDayId: row?.id || null,
        title: `Missing punch · ${formatAttendanceDayTitle(d)}`,
        body: row?.check_in_at
          ? `In at ${formatAttendanceTimeShort(row.check_in_at)}, no check-out recorded by end of day (${shiftEndLabel()} ${ERP_ATTENDANCE_POLICY.timezoneLabel}).`
          : `Open shift with no check-out recorded by end of day (${shiftEndLabel()} ${ERP_ATTENDANCE_POLICY.timezoneLabel}).`,
      });
    } else if (outcome === 'absent') {
      items.push({
        kind: 'absent',
        dateStr: d,
        attendanceDayId: null,
        title: `Absent · ${formatAttendanceDayTitle(d)}`,
        body: 'No record and no leave on file — request a correction if you were present, apply leave, or explain.',
      });
    }
    d = dateStringAddDays(d, 1);
  }
  return items.sort((a, b) => String(b.dateStr).localeCompare(String(a.dateStr))).slice(0, 12);
}

function formatAttendanceTimeShort(iso) {
  const ms = parseAttendanceMs(iso);
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: ERP_ATTENDANCE_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function formatAttendanceDayTitle(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Aggregate team stats by member_team for admin comparison.
 * @param {object[]} members
 * @param {object[]} attendanceRows
 * @param {string} fromStr
 * @param {string} toStr
 * @param {string} todayStr
 * @param {number} nowMs
 * @param {Map<string, Set<string>>} leaveByUser
 */
export function aggregateTeamAttendanceStats(members, attendanceRows, fromStr, toStr, todayStr, nowMs, leaveByUser = new Map()) {
  const byTeam = new Map();
  const ensure = (team) => {
    const key = team || 'Unassigned';
    if (!byTeam.has(key)) {
      byTeam.set(key, {
        team: key,
        people: 0,
        full: 0,
        short: 0,
        absent: 0,
        late: 0,
        shortfallSec: 0,
        overtimeSec: 0,
        openItems: 0,
        memberIds: new Set(),
      });
    }
    return byTeam.get(key);
  };

  for (const m of members || []) {
    const team = m.member_team?.trim() || 'Unassigned';
    ensure(team).memberIds.add(m.id);
  }

  for (const [, bucket] of byTeam) {
    bucket.people = bucket.memberIds.size;
  }

  const FULL_SEC =
    ERP_ATTENDANCE_POLICY.fullDayHours * 3600 - ERP_ATTENDANCE_POLICY.fullDayGraceMinutes * 60;

  for (const row of attendanceRows || []) {
    const wd = String(row.work_date || '').slice(0, 10);
    if (wd < fromStr || wd > toStr) continue;
    const member = (members || []).find((m) => m.id === row.user_id);
    const team = member?.member_team?.trim() || 'Unassigned';
    const bucket = ensure(team);
    const leaveDates = leaveByUser.get(row.user_id);
    const outcome = classifyAttendanceDayOutcome(row, todayStr, nowMs, {
      uid: row.user_id,
      approvedLeaveDates: leaveDates,
    });
    if (outcome === 'full') bucket.full += 1;
    if (outcome === 'short' || outcome === 'half') bucket.short += 1;
    if (outcome === 'absent') bucket.absent += 1;
    if (outcome === 'missing' || outcome === 'open') bucket.openItems += 1;
    if (row.check_in_at && classifyAttendanceArrival(row.check_in_at, wd) === 'late') bucket.late += 1;
    if (row.check_in_at && row.check_out_at) {
      const net = attendanceRowNetSeconds(row, nowMs, { uid: row.user_id, workDate: wd, todayStr });
      if (net < FULL_SEC) bucket.shortfallSec += FULL_SEC - net;
      if (net > FULL_SEC) bucket.overtimeSec += net - FULL_SEC;
    }
  }

  return [...byTeam.values()]
    .map((b) => ({
      team: b.team,
      people: b.people,
      full: b.full,
      short: b.short,
      absent: b.absent,
      late: b.late,
      shortfallSec: b.shortfallSec,
      overtimeSec: b.overtimeSec,
      openItems: b.openItems,
    }))
    .sort((a, b) => a.team.localeCompare(b.team));
}

/** Org-wide today counts from members + today's rows. */
export function summarizeOrgToday(members, todayRows, todayStr, leaveByUser = new Map()) {
  return summarizeOrgDay(members, todayRows, todayStr, leaveByUser, { isLive: true });
}

/** Org-wide headcount for a single work day (live today or a past snapshot). */
export function summarizeOrgDay(members, dayRows, dateStr, leaveByUser = new Map(), { isLive = false } = {}) {
  const wd = String(dateStr || '').slice(0, 10);
  let onClock = 0;
  let onBreak = 0;
  let onLeave = 0;
  let notIn = 0;
  let early = 0;
  let onTime = 0;
  let late = 0;

  for (const m of members || []) {
    const leaveDates = leaveByUser.get(m.id);
    if (leaveDates?.has(wd)) {
      onLeave += 1;
      continue;
    }
    const row = (dayRows || []).find((r) => r.user_id === m.id);

    if (isLive) {
      if (!row?.check_in_at || row.check_out_at) {
        notIn += 1;
        continue;
      }
      onClock += 1;
      if (row.break_started_at) onBreak += 1;
    } else if (!row?.check_in_at) {
      notIn += 1;
      continue;
    } else {
      onClock += 1;
    }

    if (row?.check_in_at) {
      const band = classifyAttendanceArrival(row.check_in_at, wd);
      if (band === 'early') early += 1;
      else if (band === 'on_time') onTime += 1;
      else if (band === 'late') late += 1;
    }
  }

  return { total: members.length, onClock, onBreak, onLeave, notIn, early, onTime, late, isLive };
}

export const CHART_MAX_HOURS = 10;

export function formatGraceDeadlineLabel() {
  return shiftGraceDeadlineLabel();
}

/** Minutes past the grace window (0 if on time or early). */
export function arrivalGracePastMinutes(checkInIso, workDateStr) {
  const parts = attendanceKarachiParts(checkInIso);
  if (!parts) return 0;
  const wd = workDateStr ? String(workDateStr).slice(0, 10) : parts.dateStr;
  const startMin =
    ERP_ATTENDANCE_POLICY.shiftStartHour * 60 + ERP_ATTENDANCE_POLICY.shiftStartMinute;
  const graceEnd = startMin + ERP_ATTENDANCE_POLICY.arrivalGraceMinutes;
  if (parts.dateStr !== wd) {
    if (parts.dateStr < wd) return 0;
    return Math.max(60, parts.minutesOfDay - graceEnd);
  }
  const checkMin = parts.minutesOfDay;
  return Math.max(0, checkMin - graceEnd);
}

export function formatGracePastLabel(checkInIso, workDateStr) {
  const past = arrivalGracePastMinutes(checkInIso, workDateStr);
  if (past <= 0) return null;
  if (past >= 60) {
    const h = Math.floor(past / 60);
    const m = past % 60;
    return m > 0 ? `${h}h ${m}m past the ${formatGraceDeadlineLabel()} grace` : `${h}h past the ${formatGraceDeadlineLabel()} grace`;
  }
  return `${past}m past the ${formatGraceDeadlineLabel()} grace`;
}

/** Remaining net seconds to reach a full day. */
export function secondsToFullDay(netSec) {
  return Math.max(0, FULL_DAY_SEC() - Math.max(0, netSec || 0));
}

/** Projected check-out if no more breaks from now. */
export function projectCheckoutForFullDay(nowMs, netSec) {
  const remaining = secondsToFullDay(netSec);
  return new Date(nowMs + remaining * 1000);
}

/**
 * Month stats for calendar footer + hours panel.
 * @param {string} monthStr YYYY-MM
 * @param {string} todayStr
 */
export function countMonthScheduleStats(monthStr, todayStr) {
  const [y, mo] = String(monthStr).slice(0, 7).split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  let scheduled = 0;
  let sundays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr > todayStr) continue;
    const dt = new Date(`${dateStr}T12:00:00`);
    if (dt.getDay() === 0) {
      sundays += 1;
    } else {
      scheduled += 1;
    }
  }
  return { scheduled, sundays };
}

/** Count arrival bands for scheduled days in a month up to today. */
export function summarizeMonthArrivalBands(rows, monthStr, todayStr) {
  const [y, mo] = String(monthStr).slice(0, 7).split('-').map(Number);
  if (!y || !mo) return { early: 0, on_time: 0, late: 0, none: 0 };
  const daysInMonth = new Date(y, mo, 0).getDate();
  const rowByDate = Object.fromEntries(
    (rows || []).map((r) => [String(r.work_date).slice(0, 10), r]),
  );
  const counts = { early: 0, on_time: 0, late: 0, none: 0 };
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr > todayStr) continue;
    if (!isAttendanceWorkWeekday(dateStr)) continue;
    const row = rowByDate[dateStr];
    if (!row?.check_in_at) {
      counts.none += 1;
      continue;
    }
    const band = classifyAttendanceArrival(row.check_in_at, dateStr);
    if (counts[band] != null) counts[band] += 1;
  }
  return counts;
}

/** Count arrival bands for rows in month up to today. */
export function summarizeArrivalBands(rows, monthStr, todayStr) {
  return summarizeMonthArrivalBands(rows, monthStr, todayStr);
}

/**
 * Member month hours stats for the three summary tiles.
 * @param {object[]} rows
 * @param {string} monthStr
 * @param {string} todayStr
 * @param {number} nowMs
 * @param {string} [uid]
 */
export function computeMemberMonthStats(rows, monthStr, todayStr, nowMs, uid) {
  const prefix = String(monthStr).slice(0, 7);
  let totalNet = 0;
  let completeDays = 0;
  let shortfallSec = 0;
  let shortDayShortfall = 0;
  let shortDayCount = 0;
  let overtimeSec = 0;
  let overtimeDayLabel = '';
  let scheduledDays = 0;

  for (const row of rows || []) {
    const wd = String(row.work_date || '').slice(0, 10);
    if (!wd.startsWith(prefix) || wd > todayStr) continue;
    if (!isAttendanceWorkWeekday(wd)) continue;
    scheduledDays += 1;
    if (!row.check_in_at || !row.check_out_at) continue;
    const net = attendanceRowNetSeconds(row, nowMs, { uid, workDate: wd, todayStr });
    totalNet += net;
    completeDays += 1;
    if (net >= FULL_DAY_SEC()) {
      const ot = net - FULL_DAY_SEC();
      if (ot > overtimeSec) {
        overtimeSec = ot;
        overtimeDayLabel = formatAttendanceDayTitle(wd);
      }
    } else {
      shortfallSec += FULL_DAY_SEC() - net;
      if (net >= HALF_DAY_SEC()) {
        shortDayShortfall += FULL_DAY_SEC() - net;
        shortDayCount += 1;
      }
    }
  }

  const targetSec = scheduledDays * FULL_DAY_SEC();
  const avgSec = completeDays > 0 ? Math.round(totalNet / completeDays) : 0;

  return {
    totalNet,
    targetSec,
    completeDays,
    scheduledDays,
    avgSec,
    shortfallSec,
    shortDayShortfall,
    shortDayCount,
    overtimeSec,
    overtimeDayLabel,
  };
}

/** Payroll period lock day (20th of month) for "Needs me" deadline. */
export function attendancePeriodLockLabel(todayStr) {
  const [y, mo] = String(todayStr).slice(0, 10).split('-').map(Number);
  const d = new Date(y, mo - 1, 20);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Flagged payroll items derived from attendance rows. */
export function computePayrollFlags(rows, todayStr, nowMs, opts = {}) {
  let lateMarks = 0;
  let unexplainedAbsent = 0;
  let halfDays = 0;
  let absentLabel = '';
  let halfLabel = '';

  for (const row of rows || []) {
    const wd = String(row.work_date || '').slice(0, 10);
    if (wd > todayStr) continue;
    const outcome = classifyAttendanceDayOutcome(row, todayStr, nowMs, opts);
    if (row.check_in_at && classifyAttendanceArrival(row.check_in_at, wd) === 'late') lateMarks += 1;
    if (outcome === 'absent') {
      unexplainedAbsent += 1;
      absentLabel = formatAttendanceDayTitle(wd);
    }
    if (outcome === 'half') {
      halfDays += 1;
      halfLabel = formatAttendanceDayTitle(wd);
    }
  }

  return { lateMarks, unexplainedAbsent, halfDays, absentLabel, halfLabel };
}
