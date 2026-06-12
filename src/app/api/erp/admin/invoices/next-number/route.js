import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { formatInvoiceNumber } from '../../../../../../lib/erp-invoices';
import { assertAdmin, getAdminClient, peekNextInvoiceNumber } from '../../../../../../lib/erp-invoice-server';

export const runtime = 'nodejs';

export async function GET(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  try {
    const admin = getAdminClient();
    const next_invoice_number = await peekNextInvoiceNumber(admin);
    return NextResponse.json({
      ok: true,
      next_invoice_number,
      formatted: formatInvoiceNumber(next_invoice_number),
    });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Could not load next number' }, { status: 400 });
  }
}
