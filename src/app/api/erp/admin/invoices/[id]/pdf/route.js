import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { assertAdmin, fetchInvoiceBundle, getAdminClient } from '../../../../../../../lib/erp-invoice-server';
import { buildInvoicePdfBuffer } from '../../../../../../../lib/erp-invoice-pdf';
import { friendlyInvoiceError } from '../../../../../../../lib/erp-invoice-brand';
import { formatInvoiceNumber } from '../../../../../../../lib/erp-invoices';

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

    const pdfBuffer = await buildInvoicePdfBuffer(bundle);
    const filename = `Invoice-${formatInvoiceNumber(bundle.invoice.invoice_number)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (ex) {
    return NextResponse.json({ error: friendlyInvoiceError(ex?.message || 'PDF generation failed') }, { status: 400 });
  }
}
