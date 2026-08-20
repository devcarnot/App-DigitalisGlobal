/** Annual quotas (calendar year of `start_date`). */
export const ERP_LEAVE_ANNUAL_QUOTA = 25;
export const ERP_LEAVE_CASUAL_QUOTA = 10;
export const ERP_LEAVE_SICK_QUOTA = 15;
export const ERP_LEAVE_COMP_OFF_QUOTA = 0;

/** Casual + sick share one pool of 25 days. */
export const ERP_LEAVE_CASUAL_SICK_POOL = ERP_LEAVE_CASUAL_QUOTA + ERP_LEAVE_SICK_QUOTA;

/** Leave apply form still uses regular / medical — mapped to annual / sick. */
export const ERP_LEAVE_REGULAR_QUOTA = ERP_LEAVE_ANNUAL_QUOTA;
export const ERP_LEAVE_MEDICAL_QUOTA = ERP_LEAVE_SICK_QUOTA;

export const ERP_LEAVE_TYPES = /** @type {const} */ (['regular', 'medical', 'casual']);

export const LEAVE_TYPE_LABELS = {
  regular: 'Casual leave',
  medical: 'Sick leave',
  casual: 'Casual leave',
};

export const LEAVE_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** @param {string | Date} startIso */
/** @param {string | Date} endIso */
export function calendarDayCountInclusive(startIso, endIso) {
  const a = new Date(startIso);
  const b = new Date(endIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const s = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const e = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

/** @param {string | Date} startIso */
export function leaveQuotaYear(startIso) {
  const d = new Date(startIso);
  return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}

export function canApplyLeaveRole(role) {
  return role === 'admin' || role === 'team_lead' || role === 'team_member';
}

/** @param {object[]} rows @param {string} leaveType @param {{ includePending?: boolean }} [options] */
export function tallyLeaveDaysByType(rows, leaveType, options = {}) {
  const includePending = options.includePending !== false;
  let used = 0;
  for (const r of rows || []) {
    if (r.leave_type !== leaveType) continue;
    if (r.status === 'approved') used += r.day_count || 0;
    else if (includePending && r.status === 'pending') used += r.day_count || 0;
  }
  return used;
}

/** @param {object[]} rows @param {(row: object) => boolean} matches */
export function tallyLeaveDaysWhere(rows, matches, options = {}) {
  const includePending = options.includePending !== false;
  let approved = 0;
  let pending = 0;
  for (const r of rows || []) {
    if (!matches(r)) continue;
    if (r.status === 'approved') approved += r.day_count || 0;
    else if (includePending && r.status === 'pending') pending += r.day_count || 0;
  }
  return { approved, pending, total: approved + pending };
}

/** Legacy rows stored casual days as `regular` before the `casual` type existed. */
export function tallyCasualLeaveDays(rows, options = {}) {
  return (
    tallyLeaveDaysByType(rows, 'casual', options) + tallyLeaveDaysByType(rows, 'regular', options)
  );
}

export function tallySickLeaveDays(rows, options = {}) {
  return tallyLeaveDaysByType(rows, 'medical', options);
}

/** Annual pool = casual + sick combined (max 25). */
export function tallyAnnualPoolUsed(rows, options = {}) {
  return tallyCasualLeaveDays(rows, options) + tallySickLeaveDays(rows, options);
}

function formatLeaveDayLabel(startDate, endDate) {
  const s = String(startDate || '').slice(0, 10);
  const e = String(endDate || '').slice(0, 10);
  if (!s) return '—';
  const fmt = (ymd) => {
    const d = new Date(`${ymd}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? ymd
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (!e || s === e) return fmt(s);
  return `${fmt(s)}–${fmt(e)}`;
}

/** Human-readable approved leave lines for the attendance sidebar. */
export function buildLeaveBreakdownLines(rows, year) {
  return (rows || [])
    .filter((r) => leaveQuotaYear(r.start_date) === year && r.status === 'approved')
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .map((r) => {
      const kind = r.leave_type === 'medical' ? 'sick' : 'casual';
      const days = r.day_count || 0;
      const label = formatLeaveDayLabel(r.start_date, r.end_date);
      return `${label} ${kind} leave${days === 1 ? '' : ` (${days}d)`}`;
    });
}

export function buildMemberLeaveBalances(rows) {
  const casual = tallyLeaveDaysWhere(rows, (r) => isCasualLeaveType(r.leave_type));
  const sick = tallyLeaveDaysWhere(rows, (r) => r.leave_type === 'medical');
  const casualUsed = casual.approved;
  const sickUsed = sick.approved;
  const annualUsed = casualUsed + sickUsed;
  const casualPending = casual.pending;
  const sickPending = sick.pending;
  return [
    {
      id: 'casual',
      label: 'Casual',
      used: casualUsed,
      pending: casualPending,
      left: Math.max(0, ERP_LEAVE_CASUAL_QUOTA - casualUsed - casualPending),
      total: ERP_LEAVE_CASUAL_QUOTA,
    },
    {
      id: 'medical',
      label: 'Sick',
      used: sickUsed,
      pending: sickPending,
      left: Math.max(0, ERP_LEAVE_SICK_QUOTA - sickUsed - sickPending),
      total: ERP_LEAVE_SICK_QUOTA,
    },
    {
      id: 'annual',
      label: 'Annual',
      used: annualUsed,
      pending: casualPending + sickPending,
      left: Math.max(0, ERP_LEAVE_ANNUAL_QUOTA - annualUsed - casualPending - sickPending),
      total: ERP_LEAVE_ANNUAL_QUOTA,
    },
    {
      id: 'comp_off',
      label: 'Comp off',
      used: 0,
      pending: 0,
      left: ERP_LEAVE_COMP_OFF_QUOTA,
      total: ERP_LEAVE_COMP_OFF_QUOTA,
    },
  ];
}

function isCasualLeaveType(leaveType) {
  return leaveType === 'casual' || leaveType === 'regular';
}

/** Approved / pending breakdown for admin tables and member stats. */
export function summarizeMemberLeaveYear(rows, year) {
  const yearRows = (rows || []).filter((r) => leaveQuotaYear(r.start_date) === year);
  let casualA = 0;
  let casualP = 0;
  let sickA = 0;
  let sickP = 0;
  for (const r of yearRows) {
    const d = r.day_count || 0;
    if (r.leave_type === 'medical') {
      if (r.status === 'approved') sickA += d;
      else if (r.status === 'pending') sickP += d;
    } else if (isCasualLeaveType(r.leave_type)) {
      if (r.status === 'approved') casualA += d;
      else if (r.status === 'pending') casualP += d;
    }
  }
  const casualUsed = casualA + casualP;
  const sickUsed = sickA + sickP;
  return {
    casualA,
    casualP,
    sickA,
    sickP,
    casualUsed: casualA,
    sickUsed: sickA,
    casualUsedIncludingPending: casualUsed,
    sickUsedIncludingPending: sickUsed,
    annualUsed: casualA + sickA,
    annualUsedIncludingPending: casualUsed + sickUsed,
    casualLeft: Math.max(0, ERP_LEAVE_CASUAL_QUOTA - casualUsed),
    sickLeft: Math.max(0, ERP_LEAVE_SICK_QUOTA - sickUsed),
    annualLeft: Math.max(0, ERP_LEAVE_ANNUAL_QUOTA - casualUsed - sickUsed),
  };
}

/** Remaining days member can request for a leave type (respects sub-quota + 25-day pool). */
export function leaveDaysRemainingForType(rows, leaveType) {
  const casualUsed = tallyCasualLeaveDays(rows, { includePending: true });
  const sickUsed = tallySickLeaveDays(rows, { includePending: true });
  const poolLeft = Math.max(0, ERP_LEAVE_ANNUAL_QUOTA - casualUsed - sickUsed);
  if (leaveType === 'medical') {
    return Math.min(Math.max(0, ERP_LEAVE_SICK_QUOTA - sickUsed), poolLeft);
  }
  // casual + legacy regular
  return Math.min(Math.max(0, ERP_LEAVE_CASUAL_QUOTA - casualUsed), poolLeft);
}
