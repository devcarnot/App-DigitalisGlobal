import { formatMoney } from './erp-finance';
import { parseDateOnlyLocal, startOfLocalDay } from './task-dates';

/** Default company block shown on invoices (QuickBooks-style). */
export const ERP_INVOICE_COMPANY = {
  name: 'Digitalis Global',
  addressLine1: 'Sydney, NSW',
  addressLine2: 'Sydney, NSW 2200',
  email: 'info@digitalisglobal.com',
  phone: '+61 466312363',
  website: 'www.digitalisglobal.com',
};

export const ERP_INVOICE_TERMS_OPTIONS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

export const ERP_INVOICE_STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

/** Format invoice number with leading zeros (001, 002, …). */
export function formatInvoiceNumber(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1) return '—';
  return String(Math.trunc(num)).padStart(3, '0');
}

/** Default outbound invoice email subject. */
export function defaultInvoiceEmailSubject(invoiceNumber) {
  const label = formatInvoiceNumber(invoiceNumber);
  return label !== '—' ? `Invoice ${label} from Digitalis Global` : 'Invoice from Digitalis Global';
}

/** Parse comma/semicolon-separated email addresses. */
export function parseEmailList(input) {
  if (!input || typeof input !== 'string') return [];
  return input
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @returns {{ ok: true, emails: string[] } | { ok: false, error: string }} */
export function validateEmailList(input, { label = 'Email', required = false } = {}) {
  const emails = parseEmailList(input);
  if (required && !emails.length) return { ok: false, error: `${label} is required.` };
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) return { ok: false, error: `Invalid ${label.toLowerCase()}: ${email}` };
  }
  return { ok: true, emails };
}

/** @param {number|string|null|undefined} n */
export function formatInvoiceMoney(n, currency = 'AUD') {
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  const prefix = currency === 'AUD' ? 'A$' : '$';
  return `${prefix}${formatMoney(x)}`;
}

/** @param {{ quantity?: number|string, unit_price?: number|string }} line */
export function invoiceLineAmount(line) {
  const qty = Number(line?.quantity) || 0;
  const price = Number(line?.unit_price) || 0;
  return Math.round(qty * price * 100) / 100;
}

/**
 * @param {Array<{ quantity?: number|string, unit_price?: number|string, amount?: number|string }>} lines
 * @param {{ discount_amount?: number|string, discount_percent?: number|string, shipping_fee?: number|string, tax_rate?: number|string, deposit_amount?: number|string, amount_paid?: number|string, show_discount?: boolean, show_shipping?: boolean }} opts
 */
export function computeInvoiceTotals(lines, opts = {}) {
  const subtotal = (Array.isArray(lines) ? lines : []).reduce(
    (sum, ln) => sum + (Number(ln?.amount) || invoiceLineAmount(ln)),
    0,
  );
  const roundedSub = Math.round(subtotal * 100) / 100;

  let discount = 0;
  if (opts.show_discount) {
    const pct = Number(opts.discount_percent) || 0;
    const amt = Number(opts.discount_amount) || 0;
    discount = pct > 0 ? Math.round(roundedSub * (pct / 100) * 100) / 100 : amt;
  }

  const afterDiscount = Math.max(0, roundedSub - discount);
  const shipping = opts.show_shipping ? Number(opts.shipping_fee) || 0 : 0;
  const taxable = afterDiscount + shipping;
  const taxRate = Number(opts.tax_rate) || 0;
  const taxAmount = Math.round(taxable * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxable + taxAmount) * 100) / 100;
  const deposit = Number(opts.deposit_amount) || 0;
  const paid = Number(opts.amount_paid) || 0;
  const balanceDue = Math.max(0, Math.round((total - paid) * 100) / 100);

  return {
    subtotal: roundedSub,
    discount_amount: discount,
    shipping_fee: shipping,
    tax_amount: taxAmount,
    total,
    deposit_amount: deposit,
    balance_due: balanceDue,
  };
}

/** @param {{ status?: string, due_date?: string|null, balance_due?: number|string, amount_paid?: number|string, total?: number|string }} row */
export function resolveInvoiceStatus(row, asOf = new Date()) {
  if (row?.status === 'void') return 'void';
  const total = Number(row?.total) || 0;
  const paid = Number(row?.amount_paid) || 0;
  const balance = Number(row?.balance_due);
  const bal = Number.isFinite(balance) ? balance : Math.max(0, total - paid);
  if (total > 0 && bal <= 0.009) return 'paid';
  const due = row?.due_date ? parseDateOnlyLocal(row.due_date) : null;
  if (due && startOfLocalDay(due).getTime() < startOfLocalDay(asOf).getTime() && bal > 0) return 'overdue';
  if (row?.status === 'sent') return 'sent';
  return row?.status === 'draft' ? 'draft' : row?.status || 'draft';
}

/** Badge label — sent invoices show Viewed once the customer opens the email. */
export function resolveInvoiceDisplayStatus(row, asOf = new Date()) {
  const status = resolveInvoiceStatus(row, asOf);
  if (status === 'sent' && row?.email_opened_at) return 'viewed';
  return status;
}

export function invoiceStatusBadgeClass(status) {
  if (status === 'paid')
    return 'bg-emerald-100 text-emerald-900 ring-emerald-200/80 dark:bg-emerald-950/45 dark:text-emerald-100 dark:ring-emerald-800/50';
  if (status === 'overdue')
    return 'bg-orange-100 text-orange-900 ring-orange-200/80 dark:bg-orange-950/45 dark:text-orange-100 dark:ring-orange-800/45';
  if (status === 'sent')
    return 'bg-sky-100 text-sky-900 ring-sky-200/80 dark:bg-sky-950/45 dark:text-sky-100 dark:ring-sky-800/45';
  if (status === 'viewed')
    return 'bg-violet-100 text-violet-900 ring-violet-200/80 dark:bg-violet-950/45 dark:text-violet-100 dark:ring-violet-800/45';
  if (status === 'void')
    return 'bg-slate-100 text-slate-500 ring-slate-200/80 dark:bg-slate-800/70 dark:text-slate-400 dark:ring-slate-700/50';
  return 'bg-slate-100 text-slate-700 ring-slate-200/80 dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-700/50';
}

/** @param {Date} from @param {Date} to */
export function dateInRange(d, from, to) {
  if (!d) return false;
  const t = startOfLocalDay(d).getTime();
  if (from && t < startOfLocalDay(from).getTime()) return false;
  if (to && t > startOfLocalDay(to).getTime()) return false;
  return true;
}

export function defaultInvoiceLine(sortOrder = 0) {
  return {
    product_service: '',
    description: '',
    quantity: 1,
    unit_price: 0,
    amount: 0,
    sort_order: sortOrder,
  };
}

export function emptyInvoiceDraft() {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);
  return {
    customer_id: null,
    status: 'draft',
    issue_date: today,
    due_date: due.toISOString().slice(0, 10),
    terms: 'Net 30',
    currency: 'AUD',
    subtotal: 0,
    discount_amount: 0,
    discount_percent: 0,
    shipping_fee: 0,
    deposit_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 0,
    amount_paid: 0,
    balance_due: 0,
    customer_note: 'Thank you for your business.',
    internal_memo: '',
    email_message: 'Please find your invoice attached. Let us know if you have any questions.',
    show_deposit: false,
    show_discount: false,
    show_shipping: false,
    line_items: [defaultInvoiceLine(0)],
  };
}
