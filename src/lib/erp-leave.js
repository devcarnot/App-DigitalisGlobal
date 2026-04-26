/** Annual quotas (calendar year of `start_date`). */
export const ERP_LEAVE_REGULAR_QUOTA = 15;
export const ERP_LEAVE_MEDICAL_QUOTA = 10;

export const ERP_LEAVE_TYPES = /** @type {const} */ (['regular', 'medical']);

export const LEAVE_TYPE_LABELS = {
  regular: 'Regular leave',
  medical: 'Medical leave',
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
