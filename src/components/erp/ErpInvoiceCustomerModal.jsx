'use client';

import { useEffect, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import ErpInvoiceLogo from './ErpInvoiceLogo';
import { INV_UI } from '../../lib/erp-invoice-brand';

export default function ErpInvoiceCustomerModal({ open, onClose, onSaved, busy = false }) {
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    phone: '',
    company_name: '',
    abn: '',
    billing_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'Australia',
    notes: '',
  });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    setForm({
      display_name: '',
      email: '',
      phone: '',
      company_name: '',
      abn: '',
      billing_address: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'Australia',
      notes: '',
    });
  }, [open]);

  if (!open) return null;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.display_name.trim()) {
      setErr('Customer name is required.');
      return;
    }
    try {
      await onSaved?.(form);
      onClose?.();
    } catch (ex) {
      setErr(ex?.message || 'Could not save customer.');
    }
  }

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="erp-invoice-customer-title"
          className={`${INV_UI.card} flex max-h-[92vh] w-full max-w-2xl flex-col`}
        >
          <div className="relative border-b border-slate-200 px-6 py-5 dark:border-slate-800">
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <ErpInvoiceLogo className="mb-3 h-9 w-auto max-w-[140px] object-contain" />
                <h2 id="erp-invoice-customer-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Add customer
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Billing details for invoices and email delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-lg leading-none text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-[#141c24] dark:hover:bg-[#1a2430]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <form onSubmit={submit} className="overflow-y-auto px-6 py-5">
            {err ? (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
                {err}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={INV_UI.label}>Customer name *</span>
                <input
                  className={INV_UI.field}
                  value={form.display_name}
                  onChange={(e) => setField('display_name', e.target.value)}
                  placeholder="John Smith"
                  autoFocus
                />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>Email</span>
                <input
                  type="email"
                  className={INV_UI.field}
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="customer@example.com"
                />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>Phone</span>
                <input className={INV_UI.field} value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>Company</span>
                <input
                  className={INV_UI.field}
                  value={form.company_name}
                  onChange={(e) => setField('company_name', e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>ABN</span>
                <input
                  className={INV_UI.field}
                  value={form.abn}
                  onChange={(e) => setField('abn', e.target.value)}
                  placeholder="12 345 678 901"
                  inputMode="numeric"
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={INV_UI.label}>Billing address</span>
                <input
                  className={INV_UI.field}
                  value={form.billing_address}
                  onChange={(e) => setField('billing_address', e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>City</span>
                <input className={INV_UI.field} value={form.city} onChange={(e) => setField('city', e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>State</span>
                <input className={INV_UI.field} value={form.state} onChange={(e) => setField('state', e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>Postal code</span>
                <input
                  className={INV_UI.field}
                  value={form.postal_code}
                  onChange={(e) => setField('postal_code', e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={INV_UI.label}>Country</span>
                <input className={INV_UI.field} value={form.country} onChange={(e) => setField('country', e.target.value)} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
              <button type="button" onClick={onClose} disabled={busy} className={INV_UI.btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={INV_UI.btnAccent}>
                {busy ? 'Saving…' : 'Save customer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
