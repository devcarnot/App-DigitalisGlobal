'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { formatMoney, paymentLineStatus, PAYMENT_STATUS_LABELS } from '../../lib/erp-finance';
import { parseDateOnlyLocal, startOfLocalDay } from '../../lib/task-dates';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import { erpCsvSafeFilename } from '../../lib/erp-export-csv';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';
import ErpExportCsvButton from './ErpExportCsvButton';
import ErpNativeSelect from './ErpNativeSelect';
import ErpDateInput from './ErpDateInput';
import ErpConfirmDialog from './ErpConfirmDialog';
import ErpAdminInvoices from './ErpAdminInvoices';
import { formatInvoiceMoney, resolveInvoiceStatus } from '../../lib/erp-invoices';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';
import {
  ERP_DARK_SECTION_AMBER_ALERT,
  ERP_DARK_SECTION_MAIN_PANEL,
  ERP_DARK_TABLE_HEADER_BAR,
} from '../../lib/erp-dark-surfaces';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../lib/erp-upload-limits';

/** Due date if set, else calendar date of line creation (for filtering). */
function paymentLineCalendarDate(ln) {
  if (ln?.due_date) return parseDateOnlyLocal(ln.due_date);
  const c = ln?.created_at ? new Date(ln.created_at) : null;
  if (!c || Number.isNaN(c.getTime())) return null;
  return new Date(c.getFullYear(), c.getMonth(), c.getDate());
}

function calendarDateInRange(d, fromStr, toStr) {
  if (!fromStr && !toStr) return true;
  if (!d) return false;
  const t = startOfLocalDay(d).getTime();
  if (fromStr) {
    const from = startOfLocalDay(parseDateOnlyLocal(fromStr));
    if (from && t < from.getTime()) return false;
  }
  if (toStr) {
    const to = startOfLocalDay(parseDateOnlyLocal(toStr));
    if (to && t > to.getTime()) return false;
  }
  return true;
}

function expenseSpentCalendarDate(e) {
  if (e?.spent_on) return parseDateOnlyLocal(e.spent_on);
  const c = e?.created_at ? new Date(e.created_at) : null;
  if (!c || Number.isNaN(c.getTime())) return null;
  return new Date(c.getFullYear(), c.getMonth(), c.getDate());
}

function IconSearch({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

const ACCEPT_RECEIPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_RECEIPT_BYTES = ERP_MAX_UPLOAD_BYTES;

/** Finance form fields — light + dark */
const FIN_FIELD =
  'rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/55 dark:focus:ring-teal-500/20';

const FIN_FIELD_TABLE =
  'rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 dark:border-teal-800/50 dark:bg-[#141c24] dark:text-slate-100 dark:focus:border-teal-600/50 dark:focus:ring-teal-500/15';

function statusBadgeClass(s) {
  if (s === 'received')
    return 'bg-emerald-100 text-emerald-900 ring-emerald-200/80 dark:bg-emerald-950/45 dark:text-emerald-100 dark:ring-emerald-800/50';
  if (s === 'partial')
    return 'bg-amber-100 text-amber-950 ring-amber-200/80 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-800/40';
  if (s === 'overdue')
    return 'bg-rose-100 text-rose-900 ring-rose-200/80 dark:bg-rose-950/45 dark:text-rose-100 dark:ring-rose-800/45';
  return 'bg-slate-100 text-slate-700 ring-slate-200/80 dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-700/50';
}

export default function ErpAdminFinance({ initialTab }) {
  const { session } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = 'admin:finance';

  const [tab, setTab] = useState(() =>
    initialTab === 'invoices' || initialTab === 'expenses' ? initialTab : 'projects',
  );
  const [expenseSubTab, setExpenseSubTab] = useState('office');
  const [projects, setProjects] = useState(() => pickErpCache(CACHE_KEY, (c) => c.projects ?? [], []));
  const [payments, setPayments] = useState(() => pickErpCache(CACHE_KEY, (c) => c.payments ?? [], []));
  const [expenses, setExpenses] = useState(() => pickErpCache(CACHE_KEY, (c) => c.expenses ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [payProjectId, setPayProjectId] = useState('');
  const [payTitle, setPayTitle] = useState('');
  const [payDue, setPayDue] = useState('');
  const [payReceived, setPayReceived] = useState('0');
  const [payDueDate, setPayDueDate] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expVendor, setExpVendor] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [expFile, setExpFile] = useState(null);

  const [editingPayId, setEditingPayId] = useState(null);
  const [editPay, setEditPay] = useState({});

  const [editingExpId, setEditingExpId] = useState(null);
  const [editExp, setEditExp] = useState({});

  const [financeSearch, setFinanceSearch] = useState('');
  const [financeDateFrom, setFinanceDateFrom] = useState('');
  const [financeDateTo, setFinanceDateTo] = useState('');
  const [financeDeleteConfirm, setFinanceDeleteConfirm] = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState({ outstanding: 0, totalInvoiced: 0 });
  const financeLoadGenRef = useRef(0);
  const invoiceBadgeLoadGenRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++financeLoadGenRef.current;
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      if (loadId !== financeLoadGenRef.current) return;
      setProjects(Array.isArray(cached?.projects) ? cached.projects : []);
      setPayments(Array.isArray(cached?.payments) ? cached.payments : []);
      setExpenses(Array.isArray(cached?.expenses) ? cached.expenses : []);
    }, setLoading);
    setError('');
    try {
      const [projsRes, paysRes, exRes] = await Promise.all([
        supabase.from('erp_projects').select('id, name').order('name', { ascending: true }).limit(500),
        supabase
          .from('erp_project_payments')
          .select('id, project_id, title, amount_due, amount_received, due_date, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('erp_company_expenses')
          .select('id, kind, description, amount, spent_on, vendor, attachment_path, notes, created_at')
          .order('spent_on', { ascending: false })
          .limit(2000),
      ]);
      if (loadId !== financeLoadGenRef.current) return;
      if (projsRes.error) throw new Error(projsRes.error.message);
      if (paysRes.error) throw new Error(paysRes.error.message);
      if (exRes.error) throw new Error(exRes.error.message);
      const nextProjects = projsRes.data || [];
      const nextPayments = paysRes.data || [];
      const nextExpenses = exRes.data || [];
      writeErpDataCache(CACHE_KEY, {
        projects: nextProjects,
        payments: nextPayments,
        expenses: nextExpenses,
      });
      setProjects(nextProjects);
      setPayments(nextPayments);
      setExpenses(nextExpenses);
    } catch (e) {
      if (loadId !== financeLoadGenRef.current) return;
      setError(e?.message || 'Could not load finance data');
      if (!hasErpDataCache(CACHE_KEY)) {
        setProjects([]);
        setPayments([]);
        setExpenses([]);
      }
    } finally {
      if (loadId === financeLoadGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialTab === 'invoices' || initialTab === 'expenses' || initialTab === 'projects') {
      setTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (tab === 'invoices') return;
    const loadId = ++invoiceBadgeLoadGenRef.current;
    void (async () => {
      try {
        const res = await erpAuthorizedFetch('/api/erp/admin/invoices');
        const data = await res.json().catch(() => ({}));
        if (loadId !== invoiceBadgeLoadGenRef.current || !res.ok || !data?.ok) return;
        const list = Array.isArray(data.invoices) ? data.invoices : [];
        let outstanding = 0;
        let totalInvoiced = 0;
        for (const inv of list) {
          totalInvoiced += Number(inv.total) || 0;
          const status = resolveInvoiceStatus(inv);
          const balance = Number(inv.balance_due) || 0;
          if (status !== 'paid' && status !== 'void' && balance > 0) outstanding += balance;
        }
        setInvoiceSummary({ outstanding, totalInvoiced });
      } catch {
        /* tab badge is best-effort */
      }
    })();
  }, [tab]);

  const paymentsForView = useMemo(() => {
    if (!financeDateFrom && !financeDateTo) return payments;
    return payments.filter((ln) => calendarDateInRange(paymentLineCalendarDate(ln), financeDateFrom, financeDateTo));
  }, [payments, financeDateFrom, financeDateTo]);

  const paymentsByProject = useMemo(() => {
    const m = {};
    for (const p of paymentsForView) {
      if (!m[p.project_id]) m[p.project_id] = [];
      m[p.project_id].push(p);
    }
    return m;
  }, [paymentsForView]);

  const projectSummaries = useMemo(() => {
    return projects.map((proj) => {
      const lines = paymentsByProject[proj.id] || [];
      let totalDue = 0;
      let totalRec = 0;
      for (const ln of lines) {
        totalDue += Number(ln.amount_due) || 0;
        totalRec += Number(ln.amount_received) || 0;
      }
      return {
        project: proj,
        lines,
        totalDue,
        totalRec,
        balance: totalDue - totalRec,
      };
    });
  }, [projects, paymentsByProject]);

  const officeExpenses = useMemo(() => expenses.filter((e) => e.kind === 'office'), [expenses]);
  const foodExpenses = useMemo(() => expenses.filter((e) => e.kind === 'food'), [expenses]);

  const projectSummariesScoped = useMemo(() => {
    if (!financeDateFrom && !financeDateTo) return projectSummaries;
    return projectSummaries.filter((s) => (s.lines || []).length > 0);
  }, [projectSummaries, financeDateFrom, financeDateTo]);

  const projectSummariesFiltered = useMemo(
    () =>
      filterListBySearch(projectSummariesScoped, financeSearch, ({ project, lines }) => {
        const parts = [project?.name];
        for (const ln of lines || []) {
          parts.push(ln.title, ln.notes);
        }
        return parts;
      }),
    [projectSummariesScoped, financeSearch],
  );

  const officeExpensesFiltered = useMemo(() => {
    let list = filterListBySearch(officeExpenses, financeSearch, (e) => [e.description, e.vendor, e.notes]);
    if (financeDateFrom || financeDateTo) {
      list = list.filter((e) => calendarDateInRange(expenseSpentCalendarDate(e), financeDateFrom, financeDateTo));
    }
    return list;
  }, [officeExpenses, financeSearch, financeDateFrom, financeDateTo]);

  const foodExpensesFiltered = useMemo(() => {
    let list = filterListBySearch(foodExpenses, financeSearch, (e) => [e.description, e.vendor, e.notes]);
    if (financeDateFrom || financeDateTo) {
      list = list.filter((e) => calendarDateInRange(expenseSpentCalendarDate(e), financeDateFrom, financeDateTo));
    }
    return list;
  }, [foodExpenses, financeSearch, financeDateFrom, financeDateTo]);

  const officeTotalFiltered = useMemo(
    () => officeExpensesFiltered.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [officeExpensesFiltered],
  );

  const foodTotalFiltered = useMemo(
    () => foodExpensesFiltered.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [foodExpensesFiltered],
  );

  const expensesTotalFiltered = officeTotalFiltered + foodTotalFiltered;

  const paymentsTotals = useMemo(() => {
    let due = 0;
    let received = 0;
    for (const s of projectSummariesFiltered) {
      due += Number(s.totalDue) || 0;
      received += Number(s.totalRec) || 0;
    }
    return { due, received, outstanding: Math.max(0, due - received) };
  }, [projectSummariesFiltered]);

  const allFilteredPaymentLines = useMemo(
    () =>
      projectSummariesFiltered.flatMap(({ project, lines }) =>
        (lines || []).map((ln) => ({ ...ln, _projectName: project.name })),
      ),
    [projectSummariesFiltered],
  );

  function paymentLineExportColumns(projectName) {
    return [
      { header: 'Project', value: () => projectName },
      { header: 'Title', value: (row) => row.title },
      { header: 'Amount due', value: (row) => row.amount_due },
      { header: 'Amount received', value: (row) => row.amount_received },
      { header: 'Due date', value: (row) => row.due_date || '' },
      {
        header: 'Status',
        value: (row) => PAYMENT_STATUS_LABELS[paymentLineStatus(row)] || paymentLineStatus(row),
      },
      {
        header: 'Balance',
        value: (row) => (Number(row.amount_due) || 0) - (Number(row.amount_received) || 0),
      },
      { header: 'Notes', value: (row) => row.notes || '' },
    ];
  }

  const paymentLinesExportColumnsAll = useMemo(
    () => [
      { header: 'Project', value: (row) => row._projectName },
      { header: 'Title', value: (row) => row.title },
      { header: 'Amount due', value: (row) => row.amount_due },
      { header: 'Amount received', value: (row) => row.amount_received },
      { header: 'Due date', value: (row) => row.due_date || '' },
      {
        header: 'Status',
        value: (row) => PAYMENT_STATUS_LABELS[paymentLineStatus(row)] || paymentLineStatus(row),
      },
      {
        header: 'Balance',
        value: (row) => (Number(row.amount_due) || 0) - (Number(row.amount_received) || 0),
      },
      { header: 'Notes', value: (row) => row.notes || '' },
    ],
    [],
  );

  const expenseExportColumns = useMemo(
    () => [
      { header: 'Date', value: (row) => row.spent_on || '' },
      { header: 'Description', value: (row) => row.description || '' },
      { header: 'Vendor', value: (row) => row.vendor || '' },
      { header: 'Amount', value: (row) => row.amount },
      { header: 'Notes', value: (row) => row.notes || '' },
    ],
    [],
  );

  async function addPayment(e) {
    e.preventDefault();
    if (!payProjectId) return;
    setBusy(true);
    setError('');
    try {
      const due = Number(payDue);
      const rec = Number(payReceived);
      if (Number.isNaN(due) || due < 0) throw new Error('Enter a valid amount due.');
      if (Number.isNaN(rec) || rec < 0) throw new Error('Enter a valid amount received.');
      const { error: iErr } = await supabase.from('erp_project_payments').insert({
        project_id: payProjectId,
        title: payTitle.trim() || 'Client payment',
        amount_due: due,
        amount_received: rec,
        due_date: payDueDate || null,
        notes: payNotes.trim() || null,
      });
      if (iErr) throw new Error(iErr.message);
      setPayTitle('');
      setPayDue('');
      setPayReceived('0');
      setPayDueDate('');
      setPayNotes('');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save payment');
    } finally {
      setBusy(false);
    }
  }

  async function savePaymentEdit(row) {
    setBusy(true);
    setError('');
    try {
      const due = Number(editPay.amount_due);
      const rec = Number(editPay.amount_received);
      if (Number.isNaN(due) || due < 0 || Number.isNaN(rec) || rec < 0) throw new Error('Invalid amounts');
      const { error: uErr } = await supabase
        .from('erp_project_payments')
        .update({
          title: editPay.title?.trim() || 'Client payment',
          amount_due: due,
          amount_received: rec,
          due_date: editPay.due_date || null,
          notes: editPay.notes?.trim() || null,
        })
        .eq('id', row.id);
      if (uErr) throw new Error(uErr.message);
      setEditingPayId(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function executeFinanceDelete() {
    if (!financeDeleteConfirm) return;
    const { kind, id } = financeDeleteConfirm;
    setBusy(true);
    setError('');
    try {
      if (kind === 'payment') {
        const { error: dErr } = await supabase.from('erp_project_payments').delete().eq('id', id);
        if (dErr) throw new Error(dErr.message);
      } else {
        const row = expenses.find((x) => x.id === id);
        if (row?.attachment_path) {
          const res = await erpAuthorizedFetch('/api/erp/trash/dispose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [
                {
                  path: row.attachment_path,
                  display_name: row.description || 'Receipt',
                  mime: null,
                  source_kind: 'finance_expense',
                  source_meta: { expense_id: id },
                },
              ],
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not move attachment to trash');
        }
        const { error: dErr } = await supabase.from('erp_company_expenses').delete().eq('id', id);
        if (dErr) throw new Error(dErr.message);
      }
      setFinanceDeleteConfirm(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not delete');
    } finally {
      setBusy(false);
    }
  }

  async function addExpense(e) {
    e.preventDefault();
    const kind = expenseSubTab === 'food' ? 'food' : 'office';
    setBusy(true);
    setError('');
    try {
      const amt = Number(expAmount);
      if (Number.isNaN(amt) || amt <= 0) throw new Error('Enter a valid amount.');
      let path = null;
      if (expFile && uid) {
        if (!ACCEPT_RECEIPT.includes(expFile.type)) throw new Error('Receipt: JPEG, PNG, WebP, or PDF only.');
        if (expFile.size > MAX_RECEIPT_BYTES) throw new Error(`Receipt must be ${ERP_MAX_UPLOAD_MB} MB or smaller.`);
        const safe = String(expFile.name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 100);
        path = `finance/expenses/${uid}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from('erp-files').upload(path, expFile, {
          contentType: expFile.type || 'application/octet-stream',
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
      }
      const { error: iErr } = await supabase.from('erp_company_expenses').insert({
        kind,
        description: expDesc.trim(),
        amount: amt,
        spent_on: expDate,
        vendor: expVendor.trim() || null,
        notes: expNotes.trim() || null,
        attachment_path: path,
      });
      if (iErr) {
        if (path) await supabase.storage.from('erp-files').remove([path]);
        throw new Error(iErr.message);
      }
      setExpDesc('');
      setExpAmount('');
      setExpVendor('');
      setExpNotes('');
      setExpFile(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save expense');
    } finally {
      setBusy(false);
    }
  }

  async function openReceipt(path) {
    if (!path) return;
    const { data, error: uErr } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (uErr || !data?.signedUrl) return;
    await downloadFromSignedUrlWithFallback(data.signedUrl, basenameFromStoragePath(path));
  }

  async function saveExpenseEdit(row) {
    setBusy(true);
    setError('');
    try {
      const amt = Number(editExp.amount);
      if (Number.isNaN(amt) || amt <= 0) throw new Error('Invalid amount');
      const { error: uErr } = await supabase
        .from('erp_company_expenses')
        .update({
          description: editExp.description?.trim() || '',
          amount: amt,
          spent_on: editExp.spent_on,
          vendor: editExp.vendor?.trim() || null,
          notes: editExp.notes?.trim() || null,
        })
        .eq('id', row.id);
      if (uErr) throw new Error(uErr.message);
      setEditingExpId(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update expense');
    } finally {
      setBusy(false);
    }
  }

  function startEditPay(row) {
    setEditingPayId(row.id);
    setEditPay({
      title: row.title,
      amount_due: String(row.amount_due),
      amount_received: String(row.amount_received),
      due_date: row.due_date || '',
      notes: row.notes || '',
    });
  }

  function startEditExp(row) {
    setEditingExpId(row.id);
    setEditExp({
      description: row.description,
      amount: String(row.amount),
      spent_on: row.spent_on,
      vendor: row.vendor || '',
      notes: row.notes || '',
    });
  }

  const tabBtn = (id, label, sublabel) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`group flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
        tab === id
          ? 'bg-gradient-to-r from-slate-900 to-[#103D4D] text-white shadow-[0_10px_28px_-14px_rgba(15,23,42,0.45)] dark:shadow-black/35'
          : 'border border-slate-200/80 bg-white/85 text-slate-700 hover:border-[#103D4D]/40 hover:text-[#103D4D] dark:border-teal-800/50 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-teal-600/45 dark:hover:text-teal-200'
      }`}
    >
      <span>{label}</span>
      {sublabel ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
            tab === id ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
          }`}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );

  const subTabBtn = (id, label, sublabel) => (
    <button
      type="button"
      onClick={() => setExpenseSubTab(id)}
      className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
        expenseSubTab === id
          ? 'bg-amber-700 text-white shadow-sm'
          : 'border border-amber-200 bg-amber-50/60 text-amber-900 hover:border-amber-300 hover:bg-amber-100/60 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/70'
      }`}
    >
      <span>{label}</span>
      {sublabel ? (
        <span
          className={`rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums ${
            expenseSubTab === id ? 'bg-white/15 text-white' : 'bg-white text-amber-900 dark:bg-amber-950/70 dark:text-amber-100'
          }`}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );

  function KpiCard({ label, value, hint, accent = 'slate' }) {
    const accentMap = {
      slate:
        'from-slate-50 to-white text-slate-900 ring-slate-200/80 dark:from-[#141a22] dark:to-[#0a0f14] dark:text-slate-100 dark:ring-slate-700/50',
      emerald:
        'from-emerald-50 to-white text-emerald-900 ring-emerald-200/70 dark:from-[#0a2218] dark:to-[#060c0c] dark:text-emerald-100 dark:ring-emerald-900/35',
      rose:
        'from-rose-50 to-white text-rose-900 ring-rose-200/70 dark:from-[#1a1014] dark:to-[#0c080a] dark:text-rose-100 dark:ring-rose-900/35',
      amber:
        'from-amber-50 to-white text-amber-900 ring-amber-200/70 dark:from-[#1c1408] dark:to-[#0c0a06] dark:text-amber-100 dark:ring-amber-900/30',
      cyan:
        'from-cyan-50 to-white text-cyan-900 ring-cyan-200/70 dark:from-[#0f1e2a] dark:to-[#060b10] dark:text-cyan-100 dark:ring-teal-900/30',
    };
    const cls = accentMap[accent] || accentMap.slate;
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br ${cls} p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)] ring-1`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1.5 text-xl font-extrabold tabular-nums sm:text-2xl">{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p> : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[min(100%,90rem)] space-y-6 text-[13px] leading-snug text-slate-800 dark:text-slate-200">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {!loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Received from clients"
            value={formatMoney(paymentsTotals.received)}
            hint={`Across ${projectSummariesFiltered.length} project${projectSummariesFiltered.length === 1 ? '' : 's'}`}
            accent="emerald"
          />
          <KpiCard
            label="Outstanding"
            value={formatMoney(paymentsTotals.outstanding)}
            hint={`Total invoiced ${formatMoney(paymentsTotals.due)}`}
            accent="rose"
          />
          <KpiCard
            label="Total expenses"
            value={formatMoney(expensesTotalFiltered)}
            hint="Office + Food combined"
            accent="amber"
          />
          <KpiCard
            label="Net (received − expenses)"
            value={formatMoney(paymentsTotals.received - expensesTotalFiltered)}
            hint="Cash position in date range"
            accent={paymentsTotals.received - expensesTotalFiltered >= 0 ? 'cyan' : 'rose'}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabBtn('projects', 'Client payments', 'by project')}
        {tabBtn('expenses', 'Expenses', formatMoney(expensesTotalFiltered))}
        {tabBtn(
          'invoices',
          'Invoices',
          invoiceSummary.outstanding > 0
            ? formatInvoiceMoney(invoiceSummary.outstanding)
            : invoiceSummary.totalInvoiced > 0
              ? formatInvoiceMoney(invoiceSummary.totalInvoiced)
              : 'billing',
        )}
      </div>

      {!loading && tab !== 'invoices' ? (
        <div className="space-y-3">
          <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} max-w-2xl`}>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50" />
            <label className="block w-full">
              <span className="sr-only">Search finance</span>
              <input
                type="search"
                value={financeSearch}
                onChange={(e) => setFinanceSearch(e.target.value)}
                placeholder="Search project, payment line, vendor, or description…"
                className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-cyan-200/45 bg-white/80 px-4 py-3 ring-1 ring-cyan-900/[0.04] dark:border-teal-900/45 dark:bg-[#0a121a]/95 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Date from</label>
              <ErpDateInput
                value={financeDateFrom}
                onChange={(e) => setFinanceDateFrom(e.target.value)}
                className="w-full min-w-[10rem] rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 sm:w-auto dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:focus:border-teal-600/55 dark:focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Date to</label>
              <ErpDateInput
                value={financeDateTo}
                onChange={(e) => setFinanceDateTo(e.target.value)}
                className="w-full min-w-[10rem] rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 sm:w-auto dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:focus:border-teal-600/55 dark:focus:ring-teal-500/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFinanceDateFrom('');
                  setFinanceDateTo('');
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white dark:border-teal-700/50 dark:bg-[#161e29] dark:[background-image:none] dark:text-slate-100 dark:hover:border-teal-500/50 dark:hover:bg-[#1a2633]"
              >
                Clear dates
              </button>
              {tab === 'projects' ? (
                <ErpExportCsvButton
                  filename={`client-payments-all-${new Date().toISOString().slice(0, 10)}`}
                  rows={allFilteredPaymentLines}
                  columns={paymentLinesExportColumnsAll}
                  label="Export payments CSV"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'invoices' ? (
        <ErpAdminInvoices embedded onSummaryChange={setInvoiceSummary} />
      ) : loading && projects.length === 0 && payments.length === 0 && expenses.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-amber-500" />
        </div>
      ) : (
        <>
          {tab === 'projects' && (
            <div className="space-y-6">
              <section
                className={`rounded-2xl border border-cyan-200/50 bg-white/90 p-4 shadow-[0_12px_36px_-22px_rgba(16,61,77,0.18)] ring-1 ring-cyan-900/[0.04] sm:p-6 ${ERP_DARK_SECTION_MAIN_PANEL}`}
              >
                <h2 className="text-sm font-bold text-[#103D4D] dark:text-teal-200">Add client payment line</h2>
                <form
                  onSubmit={(e) => void addPayment(e)}
                  className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                >
                  <label className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Project
                    <ErpNativeSelect
                      required
                      value={payProjectId}
                      onChange={(e) => setPayProjectId(e.target.value)}
                      className={`mt-1 ${FIN_FIELD} !pl-3 !pr-10 py-2`}
                    >
                      <option value="">Select project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </ErpNativeSelect>
                  </label>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Title
                    <input
                      value={payTitle}
                      onChange={(e) => setPayTitle(e.target.value)}
                      placeholder="Invoice / milestone"
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Amount due
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={payDue}
                      onChange={(e) => setPayDue(e.target.value)}
                      className={`mt-1 ${FIN_FIELD} tabular-nums`}
                    />
                  </label>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Amount received
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={payReceived}
                      onChange={(e) => setPayReceived(e.target.value)}
                      className={`mt-1 ${FIN_FIELD} tabular-nums`}
                    />
                  </label>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Due date
                    <ErpDateInput
                      value={payDueDate}
                      onChange={(e) => setPayDueDate(e.target.value)}
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <label className="flex flex-col sm:col-span-2 xl:col-span-3 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Notes
                    <input
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <div className="flex items-end justify-end sm:col-span-2 xl:col-span-3">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-xl erp-brand-fill px-6 py-2.5 text-sm font-bold text-white shadow-md transition disabled:opacity-40"
                    >
                      Add line
                    </button>
                  </div>
                </form>
              </section>

              {projectSummariesScoped.length > 0 && projectSummariesFiltered.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-cyan-300/50 bg-white/90 py-10 text-center text-sm text-slate-600 dark:border-teal-800/55 dark:bg-[#0f1a22] dark:text-slate-300">
                  No payment records match your search.
                </p>
              ) : null}
              {projectSummaries.length > 0 && projectSummariesScoped.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-amber-200/70 bg-amber-50/50 py-10 text-center text-sm text-amber-950/90 dark:border-amber-800/55 dark:bg-amber-950/25 dark:text-amber-100">
                  No payment lines fall in this date range. Clear dates or widen the range.
                </p>
              ) : null}
              {projectSummariesFiltered.map(({ project, lines, totalDue, totalRec, balance }) => (
                <section
                  key={project.id}
                  className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.2)] ring-1 ring-slate-900/[0.04] ${ERP_DARK_SECTION_MAIN_PANEL}`}
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50/95 via-white to-cyan-50/25 px-4 py-3.5 ${ERP_DARK_TABLE_HEADER_BAR}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{project.name}</h3>
                      <Link
                        href={`/erp/projects/${project.id}`}
                        className="text-[11px] font-bold text-[#103D4D] hover:underline dark:text-teal-300"
                      >
                        Open workspace
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <div className="flex flex-wrap gap-4 text-[12px]">
                        <span className="text-slate-600 dark:text-slate-400">
                          Due: <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(totalDue)}</span>
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          Received:{' '}
                          <span className="font-bold tabular-nums text-emerald-800 dark:text-emerald-300">{formatMoney(totalRec)}</span>
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          Outstanding:{' '}
                          <span
                            className={`font-bold tabular-nums ${balance > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}
                          >
                            {formatMoney(balance)}
                          </span>
                        </span>
                      </div>
                      {lines.length > 0 ? (
                        <ErpExportCsvButton
                          filename={`client-payments-${erpCsvSafeFilename(project.name)}`}
                          rows={lines}
                          columns={paymentLineExportColumns(project.name)}
                        />
                      ) : null}
                    </div>
                  </div>
                  {lines.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">No payment lines yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-teal-900/35 dark:bg-[#0c141c] dark:text-slate-400">
                            <th className="px-3 py-2">Title</th>
                            <th className="px-3 py-2 tabular-nums">Due</th>
                            <th className="px-3 py-2 tabular-nums">Received</th>
                            <th className="px-3 py-2">Due date</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((row) => {
                            const st = paymentLineStatus(row);
                            const bal = (Number(row.amount_due) || 0) - (Number(row.amount_received) || 0);
                            return (
                              <tr
                                key={row.id}
                                className="border-b border-slate-50 hover:bg-cyan-50/20 dark:border-slate-800/40 dark:hover:bg-teal-950/25"
                              >
                                {editingPayId === row.id ? (
                                  <>
                                    <td className="px-3 py-2" colSpan={6}>
                                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                                        <input
                                          value={editPay.title}
                                          onChange={(e) => setEditPay((x) => ({ ...x, title: e.target.value }))}
                                          className={FIN_FIELD_TABLE}
                                        />
                                        <input
                                          type="number"
                                          value={editPay.amount_due}
                                          onChange={(e) => setEditPay((x) => ({ ...x, amount_due: e.target.value }))}
                                          className={`w-28 ${FIN_FIELD_TABLE} tabular-nums`}
                                        />
                                        <input
                                          type="number"
                                          value={editPay.amount_received}
                                          onChange={(e) =>
                                            setEditPay((x) => ({ ...x, amount_received: e.target.value }))
                                          }
                                          className={`w-28 ${FIN_FIELD_TABLE} tabular-nums`}
                                        />
                                        <ErpDateInput
                                          value={editPay.due_date}
                                          onChange={(e) => setEditPay((x) => ({ ...x, due_date: e.target.value }))}
                                          className={FIN_FIELD_TABLE}
                                        />
                                        <input
                                          value={editPay.notes}
                                          onChange={(e) => setEditPay((x) => ({ ...x, notes: e.target.value }))}
                                          placeholder="Notes"
                                          className={`min-w-[8rem] flex-1 ${FIN_FIELD_TABLE}`}
                                        />
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => void savePaymentEdit(row)}
                                          className="rounded-lg erp-brand-fill px-3 py-1 text-[11px] font-bold text-white"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingPayId(null)}
                                          className="text-[11px] font-bold text-slate-600 dark:text-slate-400"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.title}</td>
                                    <td className="px-3 py-2 tabular-nums text-slate-800 dark:text-slate-200">{formatMoney(row.amount_due)}</td>
                                    <td className="px-3 py-2 tabular-nums text-emerald-800 dark:text-emerald-300">
                                      {formatMoney(row.amount_received)}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.due_date || '—'}</td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusBadgeClass(st)}`}
                                      >
                                        {PAYMENT_STATUS_LABELS[st] || st}
                                      </span>
                                      {bal > 0 ? (
                                        <span className="ml-2 text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                                          ({formatMoney(bal)} left)
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => startEditPay(row)}
                                        className="mr-2 text-[11px] font-bold text-[#103D4D] dark:text-teal-300"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setFinanceDeleteConfirm({ kind: 'payment', id: row.id })}
                                        className="text-[11px] font-bold text-rose-700"
                                      >
                                        Delete
                                      </button>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {tab === 'expenses' && (
            <div className="space-y-6">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/50 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 px-3.5 py-2.5 shadow-sm ring-1 ring-amber-900/[0.04] ${ERP_DARK_SECTION_AMBER_ALERT}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {subTabBtn('office', 'Office', formatMoney(officeTotalFiltered))}
                  {subTabBtn('food', 'Food', formatMoney(foodTotalFiltered))}
                </div>
                <div className="text-right text-[12px] font-semibold text-amber-950 dark:text-amber-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80 dark:text-amber-300/90">
                    Office + Food
                  </span>{' '}
                  <span className="ml-1 rounded-full bg-amber-700 px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums text-white shadow-sm">
                    {formatMoney(expensesTotalFiltered)}
                  </span>
                </div>
              </div>

              <section className={`rounded-2xl border border-amber-200/50 bg-white/90 p-4 shadow-md sm:p-5 ${ERP_DARK_SECTION_AMBER_ALERT}`}>
                <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Add {expenseSubTab === 'food' ? 'food' : 'office'} expense
                </h2>
                <form onSubmit={(e) => void addExpense(e)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="sm:col-span-2 flex flex-col text-[10px] font-bold uppercase text-teal-900/75 dark:text-teal-200/95">
                    Description
                    <input
                      required
                      value={expDesc}
                      onChange={(e) => setExpDesc(e.target.value)}
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <label className="flex flex-col text-[10px] font-bold uppercase text-teal-900/75 dark:text-teal-200/95">
                    Amount
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      required
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className={`mt-1 ${FIN_FIELD} tabular-nums`}
                    />
                  </label>
                  <label className="flex flex-col text-[10px] font-bold uppercase text-teal-900/75 dark:text-teal-200/95">
                    Date
                    <ErpDateInput
                      required
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <label className="flex flex-col text-[10px] font-bold uppercase text-teal-900/75 dark:text-teal-200/95">
                    Vendor (optional)
                    <input
                      value={expVendor}
                      onChange={(e) => setExpVendor(e.target.value)}
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <label className="sm:col-span-2 flex flex-col text-[10px] font-bold uppercase text-teal-900/75 dark:text-teal-200/95">
                    Notes
                    <input
                      value={expNotes}
                      onChange={(e) => setExpNotes(e.target.value)}
                      className={`mt-1 ${FIN_FIELD}`}
                    />
                  </label>
                  <label className="sm:col-span-2 flex flex-col text-[10px] font-bold uppercase text-teal-900/75 dark:text-teal-200/95">
                    Receipt (optional)
                    <input
                      type="file"
                      accept={ACCEPT_RECEIPT.join(',')}
                      onChange={(e) => setExpFile(e.target.files?.[0] || null)}
                      className="mt-1 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-amber-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-amber-950 file:dark:bg-amber-950/60 file:dark:text-amber-100"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-40"
                    >
                      Save expense
                    </button>
                  </div>
                </form>
              </section>

              <section className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-md ${ERP_DARK_SECTION_MAIN_PANEL}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-4 py-2 dark:border-teal-900/45 dark:bg-[#0f1822]">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {expenseSubTab === 'food' ? 'Food' : 'Office'} total:{' '}
                    <span className="tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(expenseSubTab === 'food' ? foodTotalFiltered : officeTotalFiltered)}
                    </span>
                  </p>
                  <ErpExportCsvButton
                    filename={`${expenseSubTab}-expenses-${new Date().toISOString().slice(0, 10)}`}
                    rows={expenseSubTab === 'food' ? foodExpensesFiltered : officeExpensesFiltered}
                    columns={expenseExportColumns}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold uppercase text-slate-500 dark:border-teal-900/35 dark:bg-[#0c141c] dark:text-slate-400">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Vendor</th>
                        <th className="px-3 py-2 tabular-nums">Amount</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(expenseSubTab === 'food' ? foodExpensesFiltered : officeExpensesFiltered).map((row) => (
                        <tr key={row.id} className="border-b border-slate-50 hover:bg-amber-50/15 dark:border-slate-800/40 dark:hover:bg-teal-950/20">
                          {editingExpId === row.id ? (
                            <td className="px-3 py-2" colSpan={5}>
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                                <ErpDateInput
                                  value={editExp.spent_on}
                                  onChange={(e) => setEditExp((x) => ({ ...x, spent_on: e.target.value }))}
                                  className={FIN_FIELD_TABLE}
                                />
                                <input
                                  value={editExp.description}
                                  onChange={(e) => setEditExp((x) => ({ ...x, description: e.target.value }))}
                                  className={`min-w-[10rem] flex-1 ${FIN_FIELD_TABLE}`}
                                />
                                <input
                                  value={editExp.vendor}
                                  onChange={(e) => setEditExp((x) => ({ ...x, vendor: e.target.value }))}
                                  placeholder="Vendor"
                                  className={FIN_FIELD_TABLE}
                                />
                                <input
                                  type="number"
                                  value={editExp.amount}
                                  onChange={(e) => setEditExp((x) => ({ ...x, amount: e.target.value }))}
                                  className={`w-28 ${FIN_FIELD_TABLE} tabular-nums`}
                                />
                                <input
                                  value={editExp.notes}
                                  onChange={(e) => setEditExp((x) => ({ ...x, notes: e.target.value }))}
                                  placeholder="Notes"
                                  className={`min-w-[8rem] flex-1 ${FIN_FIELD_TABLE}`}
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void saveExpenseEdit(row)}
                                  className="rounded-lg erp-brand-fill px-3 py-1 text-[11px] font-bold text-white"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingExpId(null)}
                                  className="text-[11px] font-bold text-slate-600 dark:text-slate-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.spent_on}</td>
                              <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.description}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.vendor || '—'}</td>
                              <td className="px-3 py-2 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                {formatMoney(row.amount)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {row.attachment_path ? (
                                  <button
                                    type="button"
                                    onClick={() => void openReceipt(row.attachment_path)}
                                    className="mr-2 text-[11px] font-bold text-[#103D4D] hover:underline dark:text-teal-300"
                                  >
                                    Receipt
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => startEditExp(row)}
                                  className="mr-2 text-[11px] font-bold text-[#103D4D] dark:text-teal-300"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFinanceDeleteConfirm({ kind: 'expense', id: row.id })}
                                  className="text-[11px] font-bold text-rose-700"
                                >
                                  Delete
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(expenseSubTab === 'food' ? foodExpenses : officeExpenses).length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-slate-500">No entries yet.</p>
                  ) : (expenseSubTab === 'food' ? foodExpensesFiltered : officeExpensesFiltered).length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-slate-500">No entries match your search.</p>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      <ErpConfirmDialog
        open={financeDeleteConfirm != null}
        title={financeDeleteConfirm?.kind === 'payment' ? 'Delete payment line?' : 'Delete expense?'}
        confirmLabel="Delete"
        tone="danger"
        busy={busy && financeDeleteConfirm != null}
        onCancel={() => {
          if (!busy) setFinanceDeleteConfirm(null);
        }}
        onConfirm={() => void executeFinanceDelete()}
      >
        <p>
          {financeDeleteConfirm?.kind === 'payment'
            ? 'This removes the client payment line from Finance. This cannot be undone.'
            : 'This removes the expense entry. Any receipt file is moved to Trash first (restorable by admins).'}
        </p>
      </ErpConfirmDialog>
    </div>
  );
}
