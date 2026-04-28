import { calendarDayCountInclusive, leaveQuotaYear } from './erp-leave';

export { calendarDayCountInclusive, leaveQuotaYear };

/** Same roles as leave: internal team can request remote / WFH. */
export { canApplyLeaveRole as canApplyRemoteRole } from './erp-leave';

export const REMOTE_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
