'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  ERP_INVOICE_STATUS_LABELS,
  formatInvoiceMoney,
  invoiceStatusBadgeClass,
  resolveInvoiceStatus,
} from '../../lib/erp-invoices';
import { INV_UI } from '../../lib/erp-invoice-brand';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import ErpNativeSelect from './ErpNativeSelect';
import ErpInvoiceLogo from './ErpInvoiceLogo';

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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatTableDate(iso) {
  if (!iso) return '—';
  const d = parseDateOnlyLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function SummaryCard({ title, leftLabel, leftValue, rightLabel, rightValue, bar, accent = 'default' }) {
  return (
    <div className={INV_UI.cardInner}>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <div className="mt-4 flex justify-between gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{leftLabel}</p>
          <p className={`mt-1 text-xl font-bold ${accent === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-200'}`}>
            {leftValue}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rightLabel}</p>
          <p className="mt-1 text-xl font-bold text-slate-700 dark:text-slate-200">
            {rightValue}
          </p>
        </div>
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/70">{bar}</div>
    </div>
  );
}

export default function ErpAdminInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('90');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = dateRange === 'all' ? '' : daysAgo(Number(dateRange) || 90);
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (from) qs.set('from', from);
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not load invoices.');
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
    } catch (ex) {
      setError(ex?.message || 'Load failed.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange]);

  useEffect(() => {
    void load();
  }, [load]);

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
    return {
      overdue,
      notDue,
      paidDeposited,
      paidNotDeposited,
      overduePct: Math.round((overdue / unpaidTotal) * 100),
      notDuePct: Math.round((notDue / unpaidTotal) * 100),
      depositedPct: paidDeposited > 0 ? 100 : 0,
    };
  }, [invoices]);

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          title="Unpaid · Last 365 days"
          leftLabel="Overdue"
          leftValue={formatInvoiceMoney(summary.overdue)}
          rightLabel="Not due yet"
          rightValue={formatInvoiceMoney(summary.notDue)}
          accent="orange"
          bar={
            <>
              <div className="bg-orange-500" style={{ width: `${summary.overduePct}%` }} />
              <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${summary.notDuePct}%` }} />
            </>
          }
        />
        <SummaryCard
          title="Paid · Last 30 days"
          leftLabel="Not deposited"
          leftValue={formatInvoiceMoney(summary.paidNotDeposited)}
          rightLabel="Deposited"
          rightValue={formatInvoiceMoney(summary.paidDeposited)}
          accent="default"
          bar={<div className="h-full bg-slate-500" style={{ width: `${summary.depositedPct}%` }} />}
        />
      </div>

      <div className={INV_UI.card}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
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
        </div>

        {error ? (
          <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={INV_UI.tableHead}>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">No.</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5 text-right">Amount</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                      Loading invoices…
                    </span>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <p className="text-slate-500">No invoices yet.</p>
                    <Link href="/erp/admin/invoices/new" className={`${INV_UI.btnPrimary} mt-4 inline-flex`}>
                      Create your first invoice
                    </Link>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const status = resolveInvoiceStatus(inv);
                  const customerLabel = inv.customer?.display_name || inv.customer?.company_name || '—';
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/30"
                    >
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{formatTableDate(inv.issue_date)}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{inv.invoice_number}</td>
                      <td className="px-5 py-3.5 font-medium">{customerLabel}</td>
                      <td className="px-5 py-3.5 text-right font-extrabold">
                        {formatInvoiceMoney(inv.total, inv.currency)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${invoiceStatusBadgeClass(status)}`}
                        >
                          {ERP_INVOICE_STATUS_LABELS[status] || status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/erp/admin/invoices/${inv.id}`}
                          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-200 dark:hover:bg-[#1a2430]"
                        >
                          View / Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
