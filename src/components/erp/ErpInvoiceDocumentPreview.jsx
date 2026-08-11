'use client';

import {
  ERP_INVOICE_COMPANY,
  formatInvoiceMoney,
  formatInvoiceNumber,
  invoiceLineAmount,
} from '../../lib/erp-invoices';
import { INV_UI } from '../../lib/erp-invoice-brand';
import ErpInvoiceLogo from './ErpInvoiceLogo';

function formatDate(iso) {
  if (!iso) return 'n/a';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function TotalsBlock({ invoice, currency, total, balance }) {
  return (
    <div className="w-full max-w-sm space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-[#141c24]">
      <div className="flex justify-between text-slate-600 dark:text-slate-300">
        <span>Subtotal</span>
        <span className="font-medium">{formatInvoiceMoney(invoice?.subtotal, currency)}</span>
      </div>
      {invoice?.show_discount && Number(invoice?.discount_amount) > 0 ? (
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Discount</span>
          <span className="font-medium">-{formatInvoiceMoney(invoice.discount_amount, currency)}</span>
        </div>
      ) : null}
      {invoice?.show_shipping && Number(invoice?.shipping_fee) > 0 ? (
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Shipping</span>
          <span className="font-medium">{formatInvoiceMoney(invoice.shipping_fee, currency)}</span>
        </div>
      ) : null}
      {Number(invoice?.tax_amount) > 0 ? (
        <div className="flex justify-between text-slate-600 dark:text-slate-300">
          <span>Tax</span>
          <span className="font-medium">{formatInvoiceMoney(invoice.tax_amount, currency)}</span>
        </div>
      ) : null}
      <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-slate-100">
        <span>Total</span>
        <span>{total}</span>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-2.5 font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
        <span>Balance due</span>
        <span>{balance}</span>
      </div>
    </div>
  );
}

/** @param {{ mode: 'email'|'pdf', invoice: object, customer: object|null, lineItems: object[] }} props */
export default function ErpInvoiceDocumentPreview({ mode, invoice, customer, lineItems }) {
  const company = ERP_INVOICE_COMPANY;
  const currency = invoice?.currency || 'AUD';
  const lines = Array.isArray(lineItems) ? lineItems : [];
  const total = formatInvoiceMoney(invoice?.total, currency);
  const balance = formatInvoiceMoney(invoice?.balance_due ?? invoice?.total, currency);
  const invoiceNo = formatInvoiceNumber(invoice?.invoice_number);

  if (mode === 'email') {
    return (
      <div className="mx-auto max-w-xl p-4">
        <div className={`${INV_UI.card} overflow-hidden`}>
          <div className="border-b border-slate-100 px-8 py-8 text-center dark:border-slate-800">
            <ErpInvoiceLogo className="mx-auto mb-4 h-9 w-auto max-w-[180px] object-contain dark:brightness-0 dark:invert dark:opacity-95" />
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">Your invoice is ready!</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Invoice {invoiceNo}
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Total {total}</p>
            <p className="mt-1 text-base font-semibold text-slate-700 dark:text-slate-300">Balance due {balance}</p>
          </div>
          <div className="px-8 py-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#141c24]">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {invoice?.email_message || 'The email message you write will go here.'}
              </p>
            </div>
            <button type="button" className={`${INV_UI.btnPrimary} mt-4 w-full`}>
              View details
            </button>
          </div>
          <div className="border-t border-slate-100 px-8 py-4 text-center dark:border-slate-800">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{company.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {company.email} · {company.phone}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className={`${INV_UI.card} p-8 sm:p-10`}>
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-100 pb-8 dark:border-slate-800">
          <div>
            <p className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">INVOICE</p>
            <p className="mt-4 text-sm font-bold text-slate-800 dark:text-slate-100">{company.name}</p>
            <p className="text-xs leading-relaxed text-slate-500">{company.addressLine1}</p>
            <p className="text-xs leading-relaxed text-slate-500">{company.addressLine2}</p>
            <p className="mt-2 text-xs text-slate-500">{company.email}</p>
            <p className="text-xs text-slate-500">{company.phone}</p>
            <p className="text-xs text-slate-500">{company.website}</p>
          </div>
          <div className="flex flex-col items-end gap-4">
            <ErpInvoiceLogo className="h-9 w-auto max-w-[180px] object-contain object-right dark:brightness-0 dark:invert dark:opacity-95" />
            <div className={`${INV_UI.metaBand} min-w-[220px] space-y-1 text-sm text-slate-700 dark:text-slate-300`}>
              <p>
                <span className={INV_UI.label}>Invoice no.</span>{' '}
                <span className="font-medium">{invoiceNo}</span>
              </p>
              <p>
                <span className={INV_UI.label}>Terms</span>{' '}
                <span className="font-medium">{invoice?.terms || 'Net 30'}</span>
              </p>
              <p>
                <span className={INV_UI.label}>Invoice date</span>{' '}
                <span className="font-medium">{formatDate(invoice?.issue_date)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#141c24]">
          <p className={INV_UI.label}>Bill to</p>
          <p className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
            {customer?.display_name || 'Add customer'}
          </p>
          {customer?.company_name ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">{customer.company_name}</p>
          ) : null}
          {customer?.abn ? <p className="text-xs font-semibold text-slate-500">ABN {customer.abn}</p> : null}
          {customer?.billing_address ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">{customer.billing_address}</p>
          ) : null}
          {customer?.email ? <p className="text-sm text-slate-600 dark:text-slate-300">{customer.email}</p> : null}
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={INV_UI.tableHead}>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Product or service</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((ln, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-slate-100 odd:bg-white even:bg-slate-50/70 dark:border-slate-800 dark:odd:bg-transparent dark:even:bg-slate-900/30"
                  >
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{ln.product_service || 'n/a'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ln.description || 'n/a'}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatInvoiceMoney(Number(ln.amount) || invoiceLineAmount(ln), currency)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Add line items in Edit view
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-end">
          <TotalsBlock invoice={invoice} currency={currency} total={total} balance={balance} />
        </div>

        {invoice?.customer_note ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#141c24]">
            <p className={INV_UI.label}>Note to customer</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {invoice.customer_note}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
