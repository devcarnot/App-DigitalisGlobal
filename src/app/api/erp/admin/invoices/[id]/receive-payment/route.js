import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { assertAdmin, getAdminClient, receiveInvoicePayment } from '../../../../../../../lib/erp-invoice-server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const id = typeof params?.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const admin = getAdminClient();
    const invoice = await receiveInvoicePayment(admin, id, body?.amount);
    return NextResponse.json({ ok: true, invoice });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Payment failed' }, { status: ex?.status || 400 });
  }
}
