import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { assertAdmin, fetchInvoiceBundle, getAdminClient } from '../../../../../../../lib/erp-invoice-server';
import { buildInvoicePdfBuffer } from '../../../../../../../lib/erp-invoice-pdf';
import { sendErpInvoiceEmail } from '../../../../../../../lib/erp-resend';
import { formatInvoiceMoney, formatInvoiceNumber, defaultInvoiceEmailSubject, validateEmailList } from '../../../../../../../lib/erp-invoices';
import { getPublicSiteOrigin } from '../../../../../../../lib/public-site-url';

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
    const bundle = await fetchInvoiceBundle(admin, id);
    if (!bundle) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const { invoice, customer, line_items } = bundle;
    const to = (typeof body?.to === 'string' && body.to.trim()) || customer?.email || '';
    const toCheck = validateEmailList(to, { label: 'Recipient email', required: true });
    if (!toCheck.ok) return NextResponse.json({ error: toCheck.error }, { status: 400 });

    const ccCheck = validateEmailList(typeof body?.cc === 'string' ? body.cc : '', { label: 'CC' });
    if (!ccCheck.ok) return NextResponse.json({ error: ccCheck.error }, { status: 400 });

    const bccCheck = validateEmailList(typeof body?.bcc === 'string' ? body.bcc : '', { label: 'BCC' });
    if (!bccCheck.ok) return NextResponse.json({ error: bccCheck.error }, { status: 400 });

    const pdfBuffer = await buildInvoicePdfBuffer(bundle);
    const currency = invoice.currency || 'AUD';
    const totalLabel = formatInvoiceMoney(invoice.total, currency);
    const balanceLabel = formatInvoiceMoney(invoice.balance_due, currency);
    const message =
      typeof body?.email_message === 'string' && body.email_message.trim()
        ? body.email_message.trim()
        : invoice.email_message || 'Please find your invoice attached.';

    const invoiceNo = formatInvoiceNumber(invoice.invoice_number);
    const isReminder = Boolean(body?.reminder);
    const subject =
      typeof body?.subject === 'string' && body.subject.trim()
        ? body.subject.trim().slice(0, 500)
        : isReminder
          ? `Reminder: ${defaultInvoiceEmailSubject(invoice.invoice_number)}`
          : defaultInvoiceEmailSubject(invoice.invoice_number);
    const trackToken = randomUUID();
    const trackPixelUrl = `${getPublicSiteOrigin()}/api/erp/invoices/email-open/${trackToken}`;

    const sendRes = await sendErpInvoiceEmail({
      to: toCheck.emails[0],
      cc: ccCheck.emails,
      bcc: bccCheck.emails,
      subject,
      customerName: customer?.display_name || 'Customer',
      invoiceNumber: invoiceNo,
      totalLabel,
      balanceLabel,
      message,
      pdfBuffer,
      pdfFilename: `Invoice-${invoiceNo}.pdf`,
      trackPixelUrl,
      invoiceId: id,
    });

    if (!sendRes.ok) return NextResponse.json({ error: sendRes.error || 'Email send failed' }, { status: 400 });

    const now = new Date().toISOString();
    if (isReminder) {
      await admin
        .from('erp_invoices')
        .update({
          sent_at: now,
          updated_at: now,
        })
        .eq('id', id);
    } else {
      await admin
        .from('erp_invoices')
        .update({
          status: 'sent',
          sent_at: now,
          email_message: message,
          email_cc: ccCheck.emails.length ? ccCheck.emails.join(', ') : null,
          email_bcc: bccCheck.emails.length ? bccCheck.emails.join(', ') : null,
          email_subject: subject,
          email_track_token: trackToken,
          resend_email_id: sendRes.emailId || null,
          email_opened_at: null,
          email_open_count: 0,
          updated_at: now,
        })
        .eq('id', id);
    }

    return NextResponse.json({ ok: true, sent_to: toCheck.emails[0] });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Send failed' }, { status: 400 });
  }
}
