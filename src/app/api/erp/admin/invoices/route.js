import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import {
  assertAdmin,
  buildInvoiceRow,
  getAdminClient,
  listInvoicesWithCustomers,
  normalizeLineItemsInput,
  replaceInvoiceLineItems,
} from '../../../../../lib/erp-invoice-server';

export const runtime = 'nodejs';

export async function GET(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';

  try {
    const admin = getAdminClient();
    const invoices = await listInvoicesWithCustomers(admin, {
      status: status === 'all' ? null : status,
      from: from || null,
      to: to || null,
    });
    return NextResponse.json({ ok: true, invoices });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Load failed' }, { status: 400 });
  }
}

export async function POST(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lineItems = normalizeLineItemsInput(body);
  const row = buildInvoiceRow(body, lineItems, user.id);

  try {
    const admin = getAdminClient();
    const { data: invoice, error: insErr } = await admin.from('erp_invoices').insert(row).select('*').single();
    if (insErr) throw new Error(insErr.message);
    await replaceInvoiceLineItems(admin, invoice.id, lineItems);
    const { data: lines } = await admin
      .from('erp_invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('sort_order', { ascending: true });
    return NextResponse.json({ ok: true, invoice, line_items: lines || [] });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Create failed' }, { status: 400 });
  }
}
