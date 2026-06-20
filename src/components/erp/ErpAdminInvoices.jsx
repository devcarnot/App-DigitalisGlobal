'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  formatInvoiceMoney,
  formatInvoiceNumber,
  formatInvoiceTableDate,
  invoiceDeliverySubline,
  invoiceDueHeadline,
  invoiceMatchesStatusFilter,
  resolveInvoiceStatus,
} from '../../lib/erp-invoices';
import { INV_UI } from '../../lib/erp-invoice-brand';
import { notifyInvoiceError, notifyInvoiceSuccess } from '../../lib/erp-invoice-notify';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import ErpNativeSelect from './ErpNativeSelect';
import ErpInvoiceLogo from './ErpInvoiceLogo';
import ErpConfirmDialog from './ErpConfirmDialog';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

const DATE_RANGE_OPTIONS = [
  { value: '90', label: 'Last 3 months' },
  { value: '365', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

const BATCH_ACTIONS = [
  { value: '', label: 'Batch actions' },
  { value: 'void', label: 'Void selected' },
  { value: 'delete', label: 'Delete selected' },
];

const ROW_MENU_ITEMS = [
  { id: 'view', label: 'View/Edit' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'send', label: 'Send' },
  { id: 'reminder', label: 'Send reminder' },
  { id: 'task', label: 'Create task' },
  { id: 'share', label: 'Share invoice link' },
  { id: 'print', label: 'Print' },
  { id: 'packing', label: 'Print packing slip' },
  { id: 'void', label: 'Void' },
  { id: 'delete', label: 'Delete' },
  { id: 'activity', label: 'View activity' },
];

const DUE_TONE_CLASS = {
  orange: 'text-orange-600 dark:text-orange-400',
  amber: 'text-amber-600 dark:text-amber-400',
  sky: 'text-sky-600 dark:text-sky-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  slate: 'text-slate-600 dark:text-slate-300',
};

const SUMMARY_TONE = {
  orange: 'text-orange-600 dark:text-orange-400',
  sky: 'text-sky-600 dark:text-sky-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  slate: 'text-slate-700 dark:text-slate-200',
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatActivityDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function SummaryCard({ title, leftLabel, leftValue, rightLabel, rightValue, bar, leftTone = 'slate', rightTone = 'slate' }) {
  return (
    <div className={INV_UI.cardInner}>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <div className="mt-4 flex justify-between gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{leftLabel}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${SUMMARY_TONE[leftTone] || SUMMARY_TONE.slate}`}>
            {leftValue}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{rightLabel}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${SUMMARY_TONE[rightTone] || SUMMARY_TONE.slate}`}>
            {rightValue}
          </p>
        </div>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-200/90 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700/80">
        {bar}
      </div>
    </div>
  );
}

function ReceivePaymentModal({ invoice, busy, onClose, onSubmit }) {
  const balance = Number(invoice?.balance_due ?? invoice?.total) || 0;
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');

  useEffect(() => {
    setAmount(balance > 0 ? String(balance) : '');
  }, [balance, invoice?.id]);

  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#101820]">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Receive payment</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Invoice {formatInvoiceNumber(invoice.invoice_number)} · Balance{' '}
          {formatInvoiceMoney(balance, invoice.currency)}
        </p>
        <label className="mt-5 block">
          <span className={INV_UI.label}>Payment amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${INV_UI.field} mt-1.5`}
            autoFocus
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={INV_UI.btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmit(Number(amount))}
            className={INV_UI.btnPrimary}
          >
            {busy ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityModal({ invoice, onClose }) {
  if (!invoice) return null;

  const events = [
    invoice.created_at ? { label: 'Created', at: invoice.created_at } : null,
    invoice.sent_at ? { label: 'Sent', at: invoice.sent_at } : null,
    invoice.email_opened_at ? { label: 'Viewed by customer', at: invoice.email_opened_at } : null,
    invoice.paid_at ? { label: 'Paid', at: invoice.paid_at } : null,
    invoice.updated_at ? { label: 'Last updated', at: invoice.updated_at } : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#101820]">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Invoice activity</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {formatInvoiceNumber(invoice.invoice_number)}
          {invoice.email_open_count > 0 ? ` · Opened ${invoice.email_open_count} time(s)` : ''}
        </p>
        <ul className="mt-5 space-y-3">
          {events.length === 0 ? (
            <li className="text-sm text-slate-500">No activity recorded yet.</li>
          ) : (
            events.map((ev) => (
              <li key={`${ev.label}-${ev.at}`} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{ev.label}</span>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{formatActivityDate(ev.at)}</span>
              </li>
            ))
          )}
        </ul>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className={INV_UI.btnGhost}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ErpAdminInvoices({ embedded = false, onSummaryChange }) {
  const router = useRouter();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('90');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [openMenuId, setOpenMenuId] = useState(null);
  const [batchAction, setBatchAction] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [voidConfirm, setVoidConfirm] = useState(null);
  const [batchConfirm, setBatchConfirm] = useState(null);
  const [receivePaymentInv, setReceivePaymentInv] = useState(null);
  const [activityInv, setActivityInv] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const menuRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateRange === 'all' ? '' : daysAgo(Number(dateRange) || 90);
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not load invoices.');
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      setSelectedIds(new Set());
    } catch (ex) {
      notifyInvoiceError('Could not load invoices', ex?.message || 'Load failed.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openMenuId) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openMenuId]);

  const visibleInvoices = useMemo(
    () => invoices.filter((inv) => invoiceMatchesStatusFilter(inv, statusFilter)),
    [invoices, statusFilter]
  );

  const allVisibleSelected =
    visibleInvoices.length > 0 && visibleInvoices.every((inv) => selectedIds.has(inv.id));

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleInvoices.map((inv) => inv.id)));
  }

  async function openPdf(id, { packing = false } = {}) {
    const qs = packing ? '?variant=packing' : '';
    const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${id}/pdf${qs}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Could not open PDF.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function sendInvoiceFromList(inv, { reminder = false } = {}) {
    setBusyId(inv.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${inv.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Send failed.');
      notifyInvoiceSuccess(
        reminder ? 'Reminder sent' : 'Invoice sent',
        data.sent_to ? `Sent to ${data.sent_to}` : ''
      );
      await load();
    } catch (ex) {
      notifyInvoiceError(reminder ? 'Could not send reminder' : 'Could not send invoice', ex?.message);
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  async function duplicateInvoiceRow(inv) {
    setBusyId(inv.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${inv.id}/duplicate`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Duplicate failed.');
      notifyInvoiceSuccess('Invoice duplicated', 'Opening the new draft.');
      router.push(`/erp/admin/invoices/${data.invoice?.id || data.invoice_id}`);
    } catch (ex) {
      notifyInvoiceError('Could not duplicate invoice', ex?.message);
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  async function voidInvoiceRow(inv) {
    setBusyId(inv.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${inv.id}/void`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Void failed.');
      notifyInvoiceSuccess('Invoice voided');
      await load();
    } catch (ex) {
      notifyInvoiceError('Could not void invoice', ex?.message);
    } finally {
      setBusyId(null);
      setVoidConfirm(null);
      setOpenMenuId(null);
    }
  }

  async function deleteInvoiceRow() {
    const inv = deleteConfirm;
    if (!inv?.id) return;
    setDeleting(true);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${inv.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not delete invoice.');
      notifyInvoiceSuccess('Invoice deleted');
      setDeleteConfirm(null);
      await load();
    } catch (ex) {
      notifyInvoiceError('Could not delete invoice', ex?.message || 'Delete failed.');
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
      setOpenMenuId(null);
    }
  }

  async function receivePayment(amount) {
    if (!receivePaymentInv?.id) return;
    setPaying(true);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${receivePaymentInv.id}/receive-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Payment failed.');
      notifyInvoiceSuccess('Payment recorded');
      setReceivePaymentInv(null);
      await load();
    } catch (ex) {
      notifyInvoiceError('Could not record payment', ex?.message);
    } finally {
      setPaying(false);
    }
  }

  async function shareInvoiceLink(inv) {
    try {
      const url = `${window.location.origin}/erp/admin/invoices/${inv.id}`;
      await navigator.clipboard.writeText(url);
      notifyInvoiceSuccess('Link copied', 'Invoice editor link copied to clipboard.');
    } catch {
      notifyInvoiceError('Could not copy link', 'Copy the URL from your browser address bar.');
    }
    setOpenMenuId(null);
  }

  async function runBatchAction(action) {
    const ids = [...selectedIds];
    if (!ids.length) return;

    if (action === 'delete') {
      setBatchConfirm({ action: 'delete', ids });
      return;
    }
    if (action === 'void') {
      setBatchConfirm({ action: 'void', ids });
    }
  }

  async function confirmBatchAction() {
    if (!batchConfirm?.ids?.length) return;
    setDeleting(true);
    try {
      for (const id of batchConfirm.ids) {
        if (batchConfirm.action === 'delete') {
          const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${id}`, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) throw new Error(data?.error || 'Batch delete failed.');
        } else {
          const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${id}/void`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) throw new Error(data?.error || 'Batch void failed.');
        }
      }
      notifyInvoiceSuccess(batchConfirm.action === 'delete' ? 'Invoices deleted' : 'Invoices voided');
      setBatchConfirm(null);
      setBatchAction('');
      await load();
    } catch (ex) {
      notifyInvoiceError('Batch action failed', ex?.message);
      setBatchConfirm(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRowAction(inv, actionId) {
    setOpenMenuId(null);
    if (actionId === 'view') {
      router.push(`/erp/admin/invoices/${inv.id}`);
      return;
    }
    if (actionId === 'duplicate') return duplicateInvoiceRow(inv);
    if (actionId === 'send') return sendInvoiceFromList(inv);
    if (actionId === 'reminder') return sendInvoiceFromList(inv, { reminder: true });
    if (actionId === 'task') {
      router.push('/erp/my-tasks');
      notifyInvoiceSuccess('Create a task', `Follow up invoice ${formatInvoiceNumber(inv.invoice_number)}.`);
      return;
    }
    if (actionId === 'share') return shareInvoiceLink(inv);
    if (actionId === 'print') {
      setBusyId(inv.id);
      try {
        await openPdf(inv.id);
      } catch (ex) {
        notifyInvoiceError('Print failed', ex?.message);
      } finally {
        setBusyId(null);
      }
      return;
    }
    if (actionId === 'packing') {
      setBusyId(inv.id);
      try {
        await openPdf(inv.id, { packing: true });
      } catch (ex) {
        notifyInvoiceError('Print failed', ex?.message);
      } finally {
        setBusyId(null);
      }
      return;
    }
    if (actionId === 'void') {
      setVoidConfirm(inv);
      return;
    }
    if (actionId === 'delete') {
      setDeleteConfirm(inv);
      return;
    }
    if (actionId === 'activity') {
      setActivityInv(inv);
    }
  }

  const summary = useMemo(() => {
    const now = startOfLocalDay(new Date()).getTime();
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    let overdue = 0;
    let notDue = 0;
    let paidDeposited = 0;
    let paidNotDeposited = 0;

    for (const inv of invoices) {
      const status = resolveInvoiceStatus(inv);
      const total = Number(inv.total) || 0;
      const balance = Number(inv.balance_due) || 0;
      const issue = inv.issue_date ? parseDateOnlyLocal(inv.issue_date) : null;
      if (!issue || issue.getTime() < startOfLocalDay(yearAgo).getTime()) continue;

      if (status === 'paid') {
        if (issue.getTime() >= startOfLocalDay(monthAgo).getTime()) paidDeposited += total;
      } else if (status !== 'void' && balance > 0) {
        const due = inv.due_date ? parseDateOnlyLocal(inv.due_date) : null;
        if (due && startOfLocalDay(due).getTime() < now) overdue += balance;
        else notDue += balance;
      }
    }

    const unpaidTotal = overdue + notDue || 1;
    const paidTotal = paidDeposited + paidNotDeposited || 1;
    return {
      overdue,
      notDue,
      paidDeposited,
      paidNotDeposited,
      overduePct: Math.round((overdue / unpaidTotal) * 100),
      notDuePct: Math.round((notDue / unpaidTotal) * 100),
      notDepositedPct: Math.round((paidNotDeposited / paidTotal) * 100),
      depositedPct: Math.round((paidDeposited / paidTotal) * 100),
    };
  }, [invoices]);

  useEffect(() => {
    if (!onSummaryChange) return;
    onSummaryChange({
      outstanding: summary.overdue + summary.notDue,
      totalInvoiced: invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0),
    });
  }, [summary, invoices, onSummaryChange]);

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/erp/admin/invoices/new" className={INV_UI.btnAccent}>
            Create invoice
            <span aria-hidden className="text-white/80">▾</span>
          </Link>
        </div>
      ) : (
        <div className={`${INV_UI.card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ErpInvoiceLogo className="hidden h-10 w-auto max-w-[150px] object-contain sm:block" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Billing workspace</p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Invoices</h2>
              </div>
            </div>
            <Link href="/erp/admin/invoices/new" className={INV_UI.btnAccent}>
              Create invoice
              <span aria-hidden className="text-white/80">▾</span>
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          title="Unpaid · Last 365 days"
          leftLabel="Overdue"
          leftValue={formatInvoiceMoney(summary.overdue)}
          rightLabel="Not due yet"
          rightValue={formatInvoiceMoney(summary.notDue)}
          leftTone="orange"
          rightTone="sky"
          bar={
            <>
              <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all" style={{ width: `${summary.overduePct}%` }} />
              <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all" style={{ width: `${summary.notDuePct}%` }} />
            </>
          }
        />
        <SummaryCard
          title="Paid · Last 30 days"
          leftLabel="Not deposited"
          leftValue={formatInvoiceMoney(summary.paidNotDeposited)}
          rightLabel="Deposited"
          rightValue={formatInvoiceMoney(summary.paidDeposited)}
          leftTone="amber"
          rightTone="emerald"
          bar={
            <>
              <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all" style={{ width: `${summary.notDepositedPct}%` }} />
              <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all" style={{ width: `${summary.depositedPct}%` }} />
            </>
          }
        />
      </div>

      <div className={INV_UI.card}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
          {selectedIds.size > 0 ? (
            <ErpNativeSelect
              value={batchAction}
              onChange={(e) => {
                const v = e.target.value;
                setBatchAction('');
                if (v) void runBatchAction(v);
              }}
              className={`${INV_UI.selectFilter} min-w-[10rem] sm:min-w-[11rem]`}
            >
              {BATCH_ACTIONS.map((o) => (
                <option key={o.value || 'none'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </ErpNativeSelect>
          ) : null}
          <ErpNativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INV_UI.selectFilter}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Status: {o.label}
              </option>
            ))}
          </ErpNativeSelect>
          <ErpNativeSelect value={dateRange} onChange={(e) => setDateRange(e.target.value)} className={INV_UI.selectFilter}>
            {DATE_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Date: {o.label}
              </option>
            ))}
          </ErpNativeSelect>
          <button type="button" onClick={() => void load()} className={`${INV_UI.btnGhost} ml-auto`}>
            Refresh
          </button>
          {embedded ? (
            <Link href="/erp/admin/invoices/new" className={`${INV_UI.btnAccent} sm:hidden`}>
              Create invoice
            </Link>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[18%]" />
              <col className="w-[11%]" />
              <col className="w-[18%]" />
              <col />
            </colgroup>
            <thead>
              <tr className={INV_UI.tableHead}>
                <th className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all invoices"
                    className="h-4 w-4 rounded border-slate-300 text-[#103D4D] focus:ring-[#103D4D]/30"
                  />
                </th>
                <th className="px-4 py-3.5 text-left">Date</th>
                <th className="px-4 py-3.5 text-left">No.</th>
                <th className="px-4 py-3.5 text-left">Customer</th>
                <th className="px-4 py-3.5 pr-10 text-right">Amount</th>
                <th className="px-4 py-3.5 pl-6 text-left">Status</th>
                <th className="px-4 py-3.5 text-right">
                  <span className="inline-flex w-full items-center justify-end gap-1.5">
                    Action
                    <span className="text-slate-400" title="Row actions" aria-hidden>
                      ⚙
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                      Loading invoices…
                    </span>
                  </td>
                </tr>
              ) : visibleInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <p className="text-slate-500">No invoices match your filters.</p>
                    <Link href="/erp/admin/invoices/new" className={`${INV_UI.btnPrimary} mt-4 inline-flex`}>
                      Create invoice
                    </Link>
                  </td>
                </tr>
              ) : (
                visibleInvoices.map((inv) => {
                  const due = invoiceDueHeadline(inv);
                  const subline = invoiceDeliverySubline(inv);
                  const customerLabel = inv.customer?.display_name || inv.customer?.company_name || '—';
                  const canReceive =
                    resolveInvoiceStatus(inv) !== 'paid' &&
                    resolveInvoiceStatus(inv) !== 'void' &&
                    Number(inv.balance_due ?? inv.total) > 0;
                  const rowBusy = busyId === inv.id;

                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/30"
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          aria-label={`Select invoice ${formatInvoiceNumber(inv.invoice_number)}`}
                          className="h-4 w-4 rounded border-slate-300 text-[#103D4D] focus:ring-[#103D4D]/30"
                        />
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{formatInvoiceTableDate(inv.issue_date)}</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        {formatInvoiceNumber(inv.invoice_number)}
                      </td>
                      <td className="px-4 py-3.5 font-medium">{customerLabel}</td>
                      <td className="px-4 py-3.5 pr-10 text-right font-extrabold">{formatInvoiceMoney(inv.total, inv.currency)}</td>
                      <td className="px-4 py-3.5 pl-6">
                        <div className="flex items-start gap-1.5">
                          {due.urgent ? (
                            <span className="mt-0.5 text-orange-500" aria-hidden title="Attention">
                              !
                            </span>
                          ) : null}
                          <div>
                            <p className={`font-semibold ${DUE_TONE_CLASS[due.tone] || DUE_TONE_CLASS.slate}`}>{due.text}</p>
                            {subline ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">{subline}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/erp/admin/invoices/${inv.id}`}
                            className="text-xs font-semibold text-[#103D4D] underline-offset-2 hover:underline dark:text-teal-300"
                          >
                            View/Edit
                          </Link>
                          {canReceive ? (
                            <div className="relative" ref={openMenuId === inv.id ? menuRef : null}>
                              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={() => setReceivePaymentInv(inv)}
                                  className="bg-[#103D4D] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0d3442] disabled:opacity-50 dark:bg-[#1a5568]"
                                >
                                  Receive payment
                                </button>
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={() => setOpenMenuId((cur) => (cur === inv.id ? null : inv.id))}
                                  className="border-l border-white/20 bg-[#103D4D] px-2 py-1.5 text-xs text-white hover:bg-[#0d3442] disabled:opacity-50 dark:bg-[#1a5568]"
                                  aria-expanded={openMenuId === inv.id}
                                  aria-haspopup="menu"
                                  aria-label="More invoice actions"
                                >
                                  ▾
                                </button>
                              </div>
                              {openMenuId === inv.id ? (
                                <div className="absolute right-0 top-full z-20 mt-1 min-w-[11.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-[#141c24]">
                                  {ROW_MENU_ITEMS.filter((item) => item.id !== 'reminder' || inv.sent_at).map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      disabled={rowBusy}
                                      onClick={() => void handleRowAction(inv, item.id)}
                                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-[#1a2430]"
                                    >
                                      {item.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="relative" ref={openMenuId === inv.id ? menuRef : null}>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => setOpenMenuId((cur) => (cur === inv.id ? null : inv.id))}
                                className={`${INV_UI.btnAccentSm} gap-1`}
                                aria-expanded={openMenuId === inv.id}
                                aria-haspopup="menu"
                              >
                                Actions
                                <span aria-hidden>▾</span>
                              </button>
                              {openMenuId === inv.id ? (
                                <div className="absolute right-0 top-full z-20 mt-1 min-w-[11.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-[#141c24]">
                                  {ROW_MENU_ITEMS.filter((item) => item.id !== 'reminder' || inv.sent_at).map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      disabled={rowBusy}
                                      onClick={() => void handleRowAction(inv, item.id)}
                                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-[#1a2430]"
                                    >
                                      {item.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReceivePaymentModal
        invoice={receivePaymentInv}
        busy={paying}
        onClose={() => {
          if (!paying) setReceivePaymentInv(null);
        }}
        onSubmit={(amount) => void receivePayment(amount)}
      />

      <ActivityModal invoice={activityInv} onClose={() => setActivityInv(null)} />

      <ErpConfirmDialog
        open={deleteConfirm != null}
        title="Delete invoice?"
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteConfirm(null);
        }}
        onConfirm={() => void deleteInvoiceRow()}
      >
        <p>
          Invoice {formatInvoiceNumber(deleteConfirm?.invoice_number)} will be permanently deleted. This cannot be undone.
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={voidConfirm != null}
        title="Void invoice?"
        confirmLabel="Void"
        tone="danger"
        busy={busyId === voidConfirm?.id}
        onCancel={() => {
          if (busyId !== voidConfirm?.id) setVoidConfirm(null);
        }}
        onConfirm={() => void voidInvoiceRow(voidConfirm)}
      >
        <p>Invoice {formatInvoiceNumber(voidConfirm?.invoice_number)} will be marked void and cannot be paid.</p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={batchConfirm != null}
        title={batchConfirm?.action === 'delete' ? 'Delete selected invoices?' : 'Void selected invoices?'}
        confirmLabel={batchConfirm?.action === 'delete' ? 'Delete all' : 'Void all'}
        tone="danger"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setBatchConfirm(null);
        }}
        onConfirm={() => void confirmBatchAction()}
      >
        <p>
          {batchConfirm?.ids?.length || 0} invoice(s) will be{' '}
          {batchConfirm?.action === 'delete' ? 'permanently deleted' : 'marked void'}.
        </p>
      </ErpConfirmDialog>
    </div>
  );
}
