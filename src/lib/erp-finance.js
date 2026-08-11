import { parseDateOnlyLocal, startOfLocalDay } from './task-dates';

/** @param {{ amount_due: string|number, amount_received: string|number, due_date?: string|null }} row */
export function paymentLineStatus(row, asOf = new Date()) {
  const dueNum = Number(row.amount_due) || 0;
  const rec = Number(row.amount_received) || 0;
  if (dueNum <= 0 && rec <= 0) return 'pending';
  if (rec >= dueNum && dueNum > 0) return 'received';
  if (rec > 0 && rec < dueNum) return 'partial';
  const dl = row.due_date ? parseDateOnlyLocal(row.due_date) : null;
  if (dl && startOfLocalDay(dl).getTime() < startOfLocalDay(asOf).getTime() && rec < dueNum) {
    return 'overdue';
  }
  return 'pending';
}

export const PAYMENT_STATUS_LABELS = {
  pending: 'Pending',
  partial: 'Partial',
  received: 'Received',
  overdue: 'Overdue',
};

export function formatMoney(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 'n/a';
  return x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
