import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import {
  assertAdmin,
  buildInvoiceRow,
  fetchInvoiceBundle,
  fetchInvoiceLineItems,
  getAdminClient,
  normalizeLineItemsInput,
  replaceInvoiceLineItems,
} from '../../../../../../lib/erp-invoice-server';
import { resolveInvoiceStatus } from '../../../../../../lib/erp-invoices';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const id = typeof params?.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });

  try {
    const admin = getAdminClient();
    const bundle = await fetchInvoiceBundle(admin, id);
    if (!bundle) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    return NextResponse.json({ ok: true, ...bundle });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Load failed' }, { status: 400 });
  }
}

export async function PATCH(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const id = typeof params?.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const admin = getAdminClient();
    const { data: existing, error: loadErr } = await admin.from('erp_invoices').select('*').eq('id', id).maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const lineItems = body?.line_items ? normalizeLineItemsInput(body) : null;
    const itemsForTotals = lineItems ?? (await fetchInvoiceLineItems(admin, id));
    const row = buildInvoiceRow(body, itemsForTotals, user.id, existing);
    row.status = resolveInvoiceStatus({ ...existing, ...row });

    const { data: invoice, error: upErr } = await admin.from('erp_invoices').update(row).eq('id', id).select('*').single();
    if (upErr) throw new Error(upErr.message);

    if (lineItems) await replaceInvoiceLineItems(admin, id, lineItems);

    const bundle = await fetchInvoiceBundle(admin, id);
    return NextResponse.json({ ok: true, ...bundle, invoice: bundle?.invoice || invoice });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Update failed' }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const id = typeof params?.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });

  try {
    const admin = getAdminClient();
    const { error: delErr } = await admin.from('erp_invoices').delete().eq('id', id);
    if (delErr) throw new Error(delErr.message);
    return NextResponse.json({ ok: true });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Delete failed' }, { status: 400 });
  }
}
