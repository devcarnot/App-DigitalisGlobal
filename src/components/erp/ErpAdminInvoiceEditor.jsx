'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  ERP_INVOICE_COMPANY,
  ERP_INVOICE_TERMS_OPTIONS,
  computeInvoiceTotals,
  defaultInvoiceEmailSubject,
  defaultInvoiceLine,
  emptyInvoiceDraft,
  formatInvoiceMoney,
  formatInvoiceNumber,
  validateEmailList,
} from '../../lib/erp-invoices';
import ErpDateInput from './ErpDateInput';
import ErpNativeSelect from './ErpNativeSelect';
import ErpInvoiceCustomerModal from './ErpInvoiceCustomerModal';
import ErpInvoiceDocumentPreview from './ErpInvoiceDocumentPreview';
import ErpInvoiceLogo from './ErpInvoiceLogo';
import { INV_UI } from '../../lib/erp-invoice-brand';
import { notifyInvoiceError, notifyInvoiceSuccess } from '../../lib/erp-invoice-notify';

const FIELD = INV_UI.field;

function SidebarToggle({ label, checked, onChange, badge, disabled = false }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
        {badge ? (
          <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-pink-700 dark:bg-pink-950/40 dark:text-pink-200">
            New
          </span>
        ) : null}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-emerald-500 peer-disabled:opacity-50 dark:bg-slate-700 dark:peer-checked:bg-emerald-500" />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** @param {{ invoiceId?: string|null }} props */
export default function ErpAdminInvoiceEditor({ invoiceId = null }) {
  const router = useRouter();
  const isNew = !invoiceId;
  const [tab, setTab] = useState('edit');
  const [draft, setDraft] = useState(emptyInvoiceDraft);
  const [invoiceNumber, setInvoiceNumber] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendCc, setSendCc] = useState('');
  const [sendBcc, setSendBcc] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendSubjectEdited, setSendSubjectEdited] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState({
    sent_at: null,
    email_opened_at: null,
    email_open_count: 0,
  });

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === draft.customer_id) || null,
    [customers, draft.customer_id],
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals(draft.line_items, {
        discount_amount: draft.discount_amount,
        discount_percent: draft.discount_percent,
        shipping_fee: draft.shipping_fee,
        tax_rate: draft.tax_rate,
        deposit_amount: draft.deposit_amount,
        amount_paid: draft.amount_paid,
        show_discount: draft.show_discount,
        show_shipping: draft.show_shipping,
      }),
    [draft],
  );

  const previewInvoice = useMemo(
    () => ({
      ...draft,
      invoice_number: invoiceNumber,
      ...totals,
    }),
    [draft, invoiceNumber, totals],
  );

  const loadCustomers = useCallback(async () => {
    const res = await erpAuthorizedFetch('/api/erp/admin/invoices/customers');
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) setCustomers(Array.isArray(data.customers) ? data.customers : []);
  }, []);

  const loadInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${invoiceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not load invoice.');
      const inv = data.invoice;
      setInvoiceNumber(inv.invoice_number);
      setDraft({
        customer_id: inv.customer_id,
        status: inv.status,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        terms: inv.terms,
        currency: inv.currency,
        subtotal: inv.subtotal,
        discount_amount: inv.discount_amount,
        discount_percent: inv.discount_percent,
        shipping_fee: inv.shipping_fee,
        deposit_amount: inv.deposit_amount,
        tax_rate: inv.tax_rate,
        tax_amount: inv.tax_amount,
        total: inv.total,
        amount_paid: inv.amount_paid,
        balance_due: inv.balance_due,
        customer_note: inv.customer_note || '',
        internal_memo: inv.internal_memo || '',
        email_message: inv.email_message || '',
        show_deposit: inv.show_deposit,
        show_discount: inv.show_discount,
        show_shipping: inv.show_shipping,
        line_items: (data.line_items || []).length
          ? data.line_items.map((ln) => ({
              product_service: ln.product_service || '',
              description: ln.description || '',
              quantity: ln.quantity,
              unit_price: ln.unit_price,
              amount: ln.amount,
            }))
          : [defaultInvoiceLine(0)],
      });
      if (data.customer?.email) setSendTo(data.customer.email);
      setSendCc(inv.email_cc || '');
      setSendBcc(inv.email_bcc || '');
      setSendSubject(inv.email_subject || defaultInvoiceEmailSubject(inv.invoice_number));
      setSendSubjectEdited(Boolean(inv.email_subject));
      setEmailDelivery({
        sent_at: inv.sent_at || null,
        email_opened_at: inv.email_opened_at || null,
        email_open_count: Number(inv.email_open_count) || 0,
      });
    } catch (ex) {
      notifyInvoiceError('Could not load invoice', ex?.message || 'Load failed.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (invoiceId) void loadInvoice();
  }, [invoiceId, loadInvoice]);

  const loadNextInvoiceNumber = useCallback(async () => {
    setLoading(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/invoices/next-number');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not load invoice number.');
      setInvoiceNumber(data.next_invoice_number);
    } catch (ex) {
      notifyInvoiceError('Could not load invoice number', ex?.message || 'Could not load invoice number.');
      setInvoiceNumber(1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isNew) void loadNextInvoiceNumber();
  }, [isNew, loadNextInvoiceNumber]);

  const invoiceNumberLabel = formatInvoiceNumber(invoiceNumber);
  const invoicePersisted = Boolean(invoiceId);
  const showEmailDeliveryFields = invoicePersisted && tab === 'email';

  useEffect(() => {
    if (selectedCustomer?.email) setSendTo(selectedCustomer.email);
  }, [selectedCustomer?.email]);

  useEffect(() => {
    if (sendSubjectEdited || invoiceNumber == null) return;
    setSendSubject(defaultInvoiceEmailSubject(invoiceNumber));
  }, [invoiceNumber, sendSubjectEdited]);

  useEffect(() => {
    if (!invoicePersisted && tab !== 'edit') setTab('edit');
  }, [invoicePersisted, tab]);

  function patchDraft(patch) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function updateLine(idx, patch) {
    setDraft((prev) => {
      const lines = [...prev.line_items];
      const next = { ...lines[idx], ...patch };
      if ('amount' in patch) {
        next.amount = Math.round((Number(next.amount) || 0) * 100) / 100;
      }
      lines[idx] = next;
      return { ...prev, line_items: lines };
    });
  }

  function addLine() {
    setDraft((prev) => ({
      ...prev,
      line_items: [...prev.line_items, defaultInvoiceLine(prev.line_items.length)],
    }));
  }

  function clearLines() {
    setDraft((prev) => ({ ...prev, line_items: [defaultInvoiceLine(0)] }));
  }

  function removeLine(idx) {
    setDraft((prev) => {
      const lines = prev.line_items.filter((_, i) => i !== idx);
      return { ...prev, line_items: lines.length ? lines : [defaultInvoiceLine(0)] };
    });
  }

  async function saveCustomer(form) {
    setBusy(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/invoices/customers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not create customer.');
      await loadCustomers();
      patchDraft({ customer_id: data.customer.id });
      if (data.customer.email) setSendTo(data.customer.email);
      notifyInvoiceSuccess('Customer added');
    } catch (ex) {
      notifyInvoiceError('Could not create customer', ex?.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveInvoice() {
    setBusy(true);
    const payload = {
      ...draft,
      ...totals,
      line_items: draft.line_items,
    };
    try {
      const res = await erpAuthorizedFetch(
        isNew ? '/api/erp/admin/invoices' : `/api/erp/admin/invoices/${invoiceId}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Save failed.');
      notifyInvoiceSuccess('Invoice saved');
      if (isNew && data.invoice?.id) {
        router.replace(`/erp/admin/invoices/${data.invoice.id}`);
        return true;
      }
      setInvoiceNumber(data.invoice?.invoice_number ?? invoiceNumber);
      return true;
    } catch (ex) {
      notifyInvoiceError('Could not save invoice', ex?.message || 'Save failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendInvoice() {
    if (!invoiceId) {
      notifyInvoiceError('Send invoice', 'Save the invoice before sending.');
      return;
    }
    setTab('email');
    if (!sendTo.trim()) {
      notifyInvoiceError('Send invoice', 'Enter a customer email address on the Email view.');
      return;
    }
    const toCheck = validateEmailList(sendTo, { label: 'Recipient email', required: true });
    if (!toCheck.ok) {
      notifyInvoiceError('Send invoice', toCheck.error);
      return;
    }
    const ccCheck = validateEmailList(sendCc, { label: 'CC' });
    if (!ccCheck.ok) {
      notifyInvoiceError('Send invoice', ccCheck.error);
      return;
    }
    const bccCheck = validateEmailList(sendBcc, { label: 'BCC' });
    if (!bccCheck.ok) {
      notifyInvoiceError('Send invoice', bccCheck.error);
      return;
    }
    if (!sendSubject.trim()) {
      notifyInvoiceError('Send invoice', 'Enter an email subject.');
      return;
    }
    setBusy(true);
    try {
      const saved = await saveInvoice();
      if (!saved) return;
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${invoiceId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          to: sendTo.trim(),
          cc: sendCc.trim(),
          bcc: sendBcc.trim(),
          subject: sendSubject.trim(),
          email_message: draft.email_message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Send failed.');
      notifyInvoiceSuccess('Invoice sent', `Emailed to ${data.sent_to}.`);
      await loadInvoice();
    } catch (ex) {
      notifyInvoiceError('Could not send invoice', ex?.message || 'Send failed.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!invoiceId) {
      notifyInvoiceError('Download PDF', 'Save the invoice before downloading PDF.');
      return;
    }
    setTab('pdf');
    setBusy(true);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/invoices/${invoiceId}/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'PDF download failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${formatInvoiceNumber(invoiceNumber) || invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      notifyInvoiceSuccess('PDF downloaded');
    } catch (ex) {
      notifyInvoiceError('PDF download failed', ex?.message || 'PDF download failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={`${INV_UI.card} flex min-h-[320px] items-center justify-center p-10`}>
        <div className="text-center">
          <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-[#141c24]">
            <ErpInvoiceLogo variant="icon" className="h-6 w-6 opacity-70" />
          </span>
          <p className="text-sm font-medium text-slate-500">Loading invoice…</p>
        </div>
      </div>
    );
  }

  const company = ERP_INVOICE_COMPANY;

  return (
    <div className="space-y-5">
      <div className={`${INV_UI.card} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <ErpInvoiceLogo variant="icon" className="hidden h-10 w-10 sm:block" />
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Invoice {invoiceNumberLabel !== '—' ? invoiceNumberLabel : 'New'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Edit, preview email/PDF, save, and send to your customer.</p>
            </div>
          </div>
          <div className={INV_UI.tabBar}>
            <button type="button" className={INV_UI.tab(tab === 'edit')} onClick={() => setTab('edit')}>
              Edit
            </button>
            {invoicePersisted ? (
              <>
                <button type="button" className={INV_UI.tab(tab === 'email')} onClick={() => setTab('email')}>
                  Email view
                </button>
                <button type="button" className={INV_UI.tab(tab === 'pdf')} onClick={() => setTab('pdf')}>
                  PDF view
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className={INV_UI.card}>

        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 border-b border-slate-100 p-4 sm:p-6 lg:border-b-0 lg:border-r dark:border-slate-800">
            {tab === 'edit' ? (
              <div className="space-y-6">
                <div className={INV_UI.invoiceHeader}>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
                    <div className="flex items-center gap-4">
                      <ErpInvoiceLogo variant="icon" className="h-11 w-11 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-2xl font-bold leading-none tracking-tight text-slate-900 dark:text-slate-100">
                          INVOICE
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-none text-slate-800 dark:text-slate-200">
                          {company.name}
                        </p>
                        <dl className="mt-2.5 grid gap-x-8 gap-y-1 text-xs leading-snug text-slate-500 sm:grid-cols-2 dark:text-slate-400">
                          <div className="space-y-1">
                            <dd>{company.addressLine1}</dd>
                            <dd>{company.addressLine2}</dd>
                          </div>
                          <div className="space-y-1">
                            <dd>{company.email}</dd>
                            <dd>{company.phone}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-200/80 pt-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4 lg:w-[32rem] lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-700/80">
                      <label className="flex flex-col gap-1.5">
                        <span className={INV_UI.metaLabel}>Invoice no.</span>
                        <input
                          className={`${INV_UI.metaField} font-mono tabular-nums tracking-wide`}
                          value={invoiceNumberLabel}
                          readOnly
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className={INV_UI.metaLabel}>Terms</span>
                        <ErpNativeSelect
                          value={draft.terms}
                          onChange={(e) => patchDraft({ terms: e.target.value })}
                          className={INV_UI.metaFieldSelect}
                          wrapperClassName="w-full"
                        >
                          {ERP_INVOICE_TERMS_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </ErpNativeSelect>
                      </label>
                      <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className={INV_UI.metaLabel}>Invoice date</span>
                        <ErpDateInput
                          value={draft.issue_date}
                          onChange={(v) => patchDraft({ issue_date: v })}
                          className="w-full max-w-none"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className={INV_UI.customerPicker}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={INV_UI.label}>Customer</span>
                    <button type="button" onClick={() => setCustomerModalOpen(true)} className={INV_UI.btnAccentSm}>
                      + New customer
                    </button>
                  </div>
                  <ErpNativeSelect
                    value={draft.customer_id || ''}
                    onChange={(e) => patchDraft({ customer_id: e.target.value || null })}
                    className={INV_UI.selectTrigger}
                  >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name}
                        {c.company_name ? ` · ${c.company_name}` : ''}
                        {c.abn ? ` · ABN ${c.abn}` : ''}
                      </option>
                    ))}
                  </ErpNativeSelect>
                  {selectedCustomer ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-[#141c24]">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedCustomer.display_name}</p>
                      {selectedCustomer.company_name ? (
                        <p className="text-slate-600 dark:text-slate-300">{selectedCustomer.company_name}</p>
                      ) : null}
                      {selectedCustomer.abn ? (
                        <p className="text-xs font-semibold text-slate-500">ABN {selectedCustomer.abn}</p>
                      ) : null}
                      {selectedCustomer.email ? (
                        <p className="mt-1 text-xs text-slate-500">{selectedCustomer.email}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Choose an existing customer or create a new one.</p>
                  )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm dark:border-slate-800">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-10" />
                      <col className="w-[22%]" />
                      <col className="w-[34%]" />
                      <col className="w-20" />
                      <col className="w-28" />
                      <col className="w-20" />
                    </colgroup>
                    <thead>
                      <tr className={INV_UI.tableHead}>
                        <th className="px-3 py-3">#</th>
                        <th className="px-3 py-3 text-left">Product/service</th>
                        <th className="px-3 py-3 text-left">Description</th>
                        <th className="px-3 py-3 text-left">Qty</th>
                        <th className="px-3 py-3 text-left">Amount</th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.line_items.map((ln, idx) => (
                        <tr key={idx} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800 dark:odd:bg-transparent dark:even:bg-slate-900/30">
                          <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <input
                              className={`${INV_UI.fieldSm} w-full min-w-0`}
                              value={ln.product_service}
                              onChange={(e) => updateLine(idx, { product_service: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              className={`${INV_UI.fieldSm} w-full min-w-0`}
                              value={ln.description}
                              onChange={(e) => updateLine(idx, { description: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={`${INV_UI.fieldSm} w-full min-w-0`}
                              value={ln.quantity}
                              onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={`${INV_UI.fieldSm} w-full min-w-0`}
                              value={ln.amount}
                              onChange={(e) => updateLine(idx, { amount: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addLine} className={INV_UI.btnGhost}>
                    Add product or service
                  </button>
                  <button type="button" onClick={clearLines} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
                    Clear all lines
                  </button>
                </div>

                <div className="flex justify-end">
                  <div className={`${INV_UI.cardInner} w-full max-w-sm space-y-2.5 text-sm`}>
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{formatInvoiceMoney(totals.subtotal, draft.currency)}</span>
                    </div>
                    {draft.show_discount ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>Discount</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${FIELD} w-24 text-right`}
                          value={draft.discount_amount}
                          onChange={(e) => patchDraft({ discount_amount: e.target.value })}
                        />
                      </div>
                    ) : null}
                    {draft.show_shipping ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>Shipping</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${FIELD} w-24 text-right`}
                          value={draft.shipping_fee}
                          onChange={(e) => patchDraft({ shipping_fee: e.target.value })}
                        />
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <span>Tax %</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${FIELD} w-24 text-right`}
                        value={draft.tax_rate}
                        onChange={(e) => patchDraft({ tax_rate: e.target.value })}
                      />
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-bold dark:border-slate-700">
                      <span>Total</span>
                      <span>{formatInvoiceMoney(totals.total, draft.currency)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                      <span>Balance due</span>
                      <span>{formatInvoiceMoney(totals.balance_due, draft.currency)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className={INV_UI.label}>Note to customer</span>
                    <textarea rows={3} className={FIELD} value={draft.customer_note} onChange={(e) => patchDraft({ customer_note: e.target.value })} />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={INV_UI.label}>Internal memo</span>
                    <textarea rows={3} className={FIELD} value={draft.internal_memo} onChange={(e) => patchDraft({ internal_memo: e.target.value })} />
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <ErpInvoiceDocumentPreview
                  mode={tab === 'email' ? 'email' : 'pdf'}
                  invoice={previewInvoice}
                  customer={selectedCustomer}
                  lineItems={draft.line_items}
                />
                {showEmailDeliveryFields ? (
                  <div className="space-y-4">
                    {emailDelivery.sent_at ? (
                      <div
                        className={`rounded-xl border px-4 py-3 text-sm ${
                          emailDelivery.email_opened_at
                            ? 'border-violet-200/80 bg-violet-50/70 text-violet-950 dark:border-violet-900/45 dark:bg-violet-950/25 dark:text-violet-100'
                            : 'border-sky-200/80 bg-sky-50/70 text-sky-950 dark:border-sky-900/45 dark:bg-sky-950/25 dark:text-sky-100'
                        }`}
                      >
                        <p className="font-semibold">
                          {emailDelivery.email_opened_at ? 'Email viewed by customer' : 'Email sent — not opened yet'}
                        </p>
                        <p className="mt-1 text-xs opacity-80">
                          Sent {new Date(emailDelivery.sent_at).toLocaleString()}
                          {emailDelivery.email_opened_at
                            ? ` · Opened ${new Date(emailDelivery.email_opened_at).toLocaleString()}`
                            : ''}
                          {emailDelivery.email_open_count > 1
                            ? ` · ${emailDelivery.email_open_count} opens`
                            : ''}
                        </p>
                      </div>
                    ) : null}
                    <div className={`${INV_UI.cardInner} space-y-4`}>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <label className="block space-y-1.5 sm:col-span-1">
                          <span className={INV_UI.label}>Send to</span>
                          <input
                            type="email"
                            className={FIELD}
                            value={sendTo}
                            onChange={(e) => setSendTo(e.target.value)}
                            placeholder="customer@example.com"
                          />
                        </label>
                        <label className="block space-y-1.5 sm:col-span-1">
                          <span className={INV_UI.label}>CC</span>
                          <input
                            type="text"
                            className={FIELD}
                            value={sendCc}
                            onChange={(e) => setSendCc(e.target.value)}
                            placeholder="Optional, comma-separated"
                            autoComplete="off"
                          />
                        </label>
                        <label className="block space-y-1.5 sm:col-span-1">
                          <span className={INV_UI.label}>BCC</span>
                          <input
                            type="text"
                            className={FIELD}
                            value={sendBcc}
                            onChange={(e) => setSendBcc(e.target.value)}
                            placeholder="Optional, comma-separated"
                            autoComplete="off"
                          />
                        </label>
                      </div>
                      <label className="block space-y-1.5">
                        <span className={INV_UI.label}>Subject</span>
                        <input
                          type="text"
                          className={FIELD}
                          value={sendSubject}
                          onChange={(e) => {
                            setSendSubjectEdited(true);
                            setSendSubject(e.target.value);
                          }}
                          placeholder={defaultInvoiceEmailSubject(invoiceNumber)}
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className={INV_UI.label}>Email message</span>
                        <textarea
                          rows={3}
                          className={FIELD}
                          value={draft.email_message}
                          onChange={(e) => patchDraft({ email_message: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-[#0a1018] lg:border-t-0 lg:border-l">
            <div className="mb-4 flex items-center gap-3">
              <ErpInvoiceLogo variant="icon" className="h-8 w-8 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Invoice {invoiceNumberLabel !== '—' ? invoiceNumberLabel : 'New'}</p>
                <p className="text-xs text-slate-500">Settings & payment options</p>
              </div>
            </div>
            <div className="space-y-1 rounded-2xl border border-slate-200/80 bg-white/70 p-2 dark:border-slate-800 dark:bg-[#141c24]">
              <p className={INV_UI.label + ' px-2 pt-1'}>Payment options</p>
              <SidebarToggle label="Invoice total" checked disabled onChange={() => {}} />
              <SidebarToggle
                label="Deposit"
                badge
                checked={draft.show_deposit}
                onChange={(v) => patchDraft({ show_deposit: v })}
              />
              <SidebarToggle
                label="Discount"
                checked={draft.show_discount}
                onChange={(v) => patchDraft({ show_discount: v })}
              />
              <SidebarToggle
                label="Shipping fee"
                checked={draft.show_shipping}
                onChange={(v) => patchDraft({ show_shipping: v })}
              />
            </div>
            <label className="mt-4 block space-y-1.5 text-sm">
              <span className={INV_UI.label}>Due date</span>
              <ErpDateInput value={draft.due_date || ''} onChange={(v) => patchDraft({ due_date: v })} />
            </label>
            <label className="mt-4 block space-y-1.5 text-sm">
              <span className={INV_UI.label}>Amount paid</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                value={draft.amount_paid}
                onChange={(e) => patchDraft({ amount_paid: e.target.value })}
              />
            </label>
          </aside>
        </div>

        <div
          className={`flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50 ${
            invoicePersisted ? 'justify-between' : 'justify-end'
          }`}
        >
          {invoicePersisted ? (
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={busy}
              className={INV_UI.btnGhost}
            >
              Print or download PDF
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveInvoice()} disabled={busy} className={INV_UI.btnGhost}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {invoicePersisted ? (
              <button type="button" onClick={() => void sendInvoice()} disabled={busy} className={INV_UI.btnAccent}>
                {busy ? 'Working…' : 'Review and send'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <ErpInvoiceCustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onSaved={saveCustomer}
        busy={busy}
      />
    </div>
  );
}
