import { createSupabaseAdmin } from './supabase-admin';
import { computeInvoiceTotals, resolveInvoiceStatus } from './erp-invoices';

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function fetchInvoiceBundle(admin, invoiceId) {
  const { data: invoice, error: invErr } = await admin
    .from('erp_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (invErr) throw new Error(invErr.message);
  if (!invoice) return null;

  const [{ data: lineItems }, { data: customer }] = await Promise.all([
    admin
      .from('erp_invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true }),
    invoice.customer_id
      ? admin.from('erp_invoice_customers').select('*').eq('id', invoice.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    invoice: {
      ...invoice,
      status: resolveInvoiceStatus(invoice),
    },
    line_items: lineItems || [],
    customer: customer || null,
  };
}

/** @param {object} body */
export function normalizeLineItemsInput(body) {
  const raw = Array.isArray(body?.line_items) ? body.line_items : [];
  return raw.map((ln, idx) => {
    const quantity = Number(ln?.quantity) || 0;
    const unit_price = Number(ln?.unit_price) || 0;
    const amount = Math.round(quantity * unit_price * 100) / 100;
    return {
      product_service: typeof ln?.product_service === 'string' ? ln.product_service.trim().slice(0, 200) : '',
      description: typeof ln?.description === 'string' ? ln.description.trim().slice(0, 2000) : '',
      quantity,
      unit_price,
      amount,
      sort_order: idx,
    };
  });
}

/** @param {object} body @param {object[]} lineItems */
export function buildInvoiceRow(body, lineItems, userId, existing = null) {
  const totals = computeInvoiceTotals(lineItems, {
    discount_amount: body?.discount_amount,
    discount_percent: body?.discount_percent,
    shipping_fee: body?.shipping_fee,
    tax_rate: body?.tax_rate,
    deposit_amount: body?.deposit_amount,
    amount_paid: body?.amount_paid ?? existing?.amount_paid,
    show_discount: Boolean(body?.show_discount),
    show_shipping: Boolean(body?.show_shipping),
  });

  const status =
    typeof body?.status === 'string' && body.status ? body.status : existing?.status || 'draft';

  return {
    customer_id: body?.customer_id || null,
    status,
    issue_date: body?.issue_date || existing?.issue_date || new Date().toISOString().slice(0, 10),
    due_date: body?.due_date || null,
    terms: typeof body?.terms === 'string' ? body.terms.trim().slice(0, 80) : 'Net 30',
    currency: body?.currency === 'USD' ? 'USD' : 'AUD',
    subtotal: totals.subtotal,
    discount_amount: totals.discount_amount,
    discount_percent: Number(body?.discount_percent) || 0,
    shipping_fee: totals.shipping_fee,
    deposit_amount: totals.deposit_amount,
    tax_rate: Number(body?.tax_rate) || 0,
    tax_amount: totals.tax_amount,
    total: totals.total,
    amount_paid: Number(body?.amount_paid) ?? Number(existing?.amount_paid) ?? 0,
    balance_due: totals.balance_due,
    customer_note: typeof body?.customer_note === 'string' ? body.customer_note.slice(0, 4000) : null,
    internal_memo: typeof body?.internal_memo === 'string' ? body.internal_memo.slice(0, 4000) : null,
    email_message: typeof body?.email_message === 'string' ? body.email_message.slice(0, 8000) : null,
    show_deposit: Boolean(body?.show_deposit),
    show_discount: Boolean(body?.show_discount),
    show_shipping: Boolean(body?.show_shipping),
    updated_at: new Date().toISOString(),
    ...(existing ? {} : { created_by: userId }),
  };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function replaceInvoiceLineItems(admin, invoiceId, lineItems) {
  const { error: delErr } = await admin.from('erp_invoice_line_items').delete().eq('invoice_id', invoiceId);
  if (delErr) throw new Error(delErr.message);
  if (!lineItems.length) return;
  const rows = lineItems.map((ln) => ({ ...ln, invoice_id: invoiceId }));
  const { error: insErr } = await admin.from('erp_invoice_line_items').insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function listInvoicesWithCustomers(admin, { status, from, to } = {}) {
  let q = admin
    .from('erp_invoices')
    .select('*, customer:erp_invoice_customers(id, display_name, email, company_name)')
    .order('issue_date', { ascending: false })
    .limit(500);
  if (status && status !== 'all') q = q.eq('status', status);
  if (from) q = q.gte('issue_date', from);
  if (to) q = q.lte('issue_date', to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...row,
    status: resolveInvoiceStatus(row),
  }));
}

export function assertAdmin(profile) {
  if (!profile || profile.role !== 'admin') {
    const err = new Error('Only Super Admins can manage invoices.');
    err.status = 403;
    throw err;
  }
}

export function getAdminClient() {
  const admin = createSupabaseAdmin();
  if (!admin) {
    const err = new Error('Server misconfigured');
    err.status = 500;
    throw err;
  }
  return admin;
}

/** Record invoice email open from tracking pixel or Resend webhook. */
export async function recordInvoiceEmailOpen(admin, { token, resendEmailId } = {}) {
  if (!admin) return null;

  let q = admin.from('erp_invoices').select('id, email_opened_at, email_open_count');
  if (token) q = q.eq('email_track_token', token);
  else if (resendEmailId) q = q.eq('resend_email_id', resendEmailId);
  else return null;

  const { data: row, error: loadErr } = await q.maybeSingle();
  if (loadErr || !row?.id) return null;

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from('erp_invoices')
    .update({
      email_opened_at: row.email_opened_at || now,
      email_open_count: (Number(row.email_open_count) || 0) + 1,
      updated_at: now,
    })
    .eq('id', row.id);

  if (upErr) return null;
  return row.id;
}

/** Next invoice number for the create form (matches sequence after sync). */
export async function peekNextInvoiceNumber(admin) {
  const { data, error } = await admin
    .from('erp_invoices')
    .select('invoice_number')
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.invoice_number ? Number(data.invoice_number) : 0) + 1;
}
