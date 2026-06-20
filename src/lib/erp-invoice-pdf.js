import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import {
  ERP_INVOICE_COMPANY,
  formatInvoiceMoney,
  formatInvoiceNumber,
  invoiceLineAmount,
} from './erp-invoices';
import { resolveInvoiceLogoFilePath } from './erp-invoice-brand-server';

function formatDisplayDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * @param {{ invoice: object, customer: object|null, line_items: object[] }} payload
 * @returns {Promise<Buffer>}
 */
export function buildInvoicePdfBuffer({ invoice, customer, line_items }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = invoice?.currency || 'AUD';
    const company = ERP_INVOICE_COMPANY;

    // Logo (top right)
    try {
      const logoPath = resolveInvoiceLogoFilePath();
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 430, 42, { fit: [115, 52], align: 'right' });
      }
    } catch {
      /* optional logo */
    }

    // Header
    doc.fillColor('#103D4D').fontSize(30).font('Helvetica-Bold').text('INVOICE', 48, 48);
    doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold').text(company.name, 48, 92);
    doc.font('Helvetica').fontSize(9).fillColor('#64748b');
    doc.text(company.addressLine1, 48, 108);
    doc.text(company.addressLine2, 48, 120);
    doc.text(company.email, 48, 136);
    doc.text(company.phone, 48, 148);
    doc.text(company.website, 48, 160);

    // Meta band
    const metaX = 48;
    const metaY = 188;
    doc.fillColor('#0f766e').roundedRect(metaX, metaY, 499, 54, 8).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text(`Invoice no.  ${formatInvoiceNumber(invoice?.invoice_number)}`, metaX + 16, metaY + 12);
    doc.text(`Terms  ${invoice?.terms || 'Net 30'}`, metaX + 180, metaY + 12);
    doc.text(`Invoice date  ${formatDisplayDate(invoice?.issue_date)}`, metaX + 320, metaY + 12);
    if (invoice?.due_date) {
      doc.font('Helvetica').fontSize(8).fillColor('#ccfbf1');
      doc.text(`Due date  ${formatDisplayDate(invoice.due_date)}`, metaX + 16, metaY + 30);
    }

    // Bill to
    doc.fillColor('#103D4D').font('Helvetica-Bold').fontSize(10).text('Bill to', 48, 262);
    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    const custName = customer?.display_name || customer?.company_name || 'Customer';
    doc.text(custName, 48, 278);
    let y = 292;
    if (customer?.company_name && customer.company_name !== customer.display_name) {
      doc.text(customer.company_name, 48, y);
      y += 14;
    }
    if (customer?.abn) {
      doc.text(`ABN ${customer.abn}`, 48, y);
      y += 14;
    }
    if (customer?.billing_address) {
      doc.text(customer.billing_address, 48, y);
      y += 14;
    }
    const cityLine = [customer?.city, customer?.state, customer?.postal_code].filter(Boolean).join(', ');
    if (cityLine) {
      doc.text(cityLine, 48, y);
      y += 14;
    }
    if (customer?.email) doc.text(customer.email, 48, y);

    // Table
    const tableTop = 350;
    doc.fillColor('#e6fffa').rect(48, tableTop, 499, 24).fill();
    doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(8);
    doc.text('#', 54, tableTop + 8);
    doc.text('Product or service', 72, tableTop + 8);
    doc.text('Description', 220, tableTop + 8);
    doc.text('Amount', 480, tableTop + 8, { width: 60, align: 'right' });

    const lines = Array.isArray(line_items) ? line_items : [];
    let rowY = tableTop + 30;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    lines.forEach((ln, idx) => {
      if (idx % 2 === 1) {
        doc.fillColor('#f8fafc').rect(48, rowY - 4, 499, 22).fill();
        doc.fillColor('#334155');
      }
      const amt = Number(ln?.amount) || invoiceLineAmount(ln);
      doc.text(String(idx + 1), 54, rowY);
      doc.text(String(ln?.product_service || ''), 72, rowY, { width: 140 });
      doc.text(String(ln?.description || ''), 220, rowY, { width: 250 });
      doc.text(formatInvoiceMoney(amt, currency), 430, rowY, { width: 110, align: 'right' });
      rowY += 22;
      if (rowY > 680) {
        doc.addPage();
        rowY = 48;
      }
    });

    rowY = Math.max(rowY + 20, 520);
    doc.strokeColor('#cbd5e1').moveTo(320, rowY).lineTo(547, rowY).stroke();
    rowY += 12;
    const totals = [
      ['Subtotal', invoice?.subtotal],
      invoice?.show_discount && Number(invoice?.discount_amount) > 0
        ? ['Discount', -Number(invoice.discount_amount)]
        : null,
      invoice?.show_shipping && Number(invoice?.shipping_fee) > 0
        ? ['Shipping', invoice.shipping_fee]
        : null,
      Number(invoice?.tax_amount) > 0 ? ['Tax', invoice.tax_amount] : null,
      ['Total', invoice?.total],
      Number(invoice?.amount_paid) > 0 ? ['Amount paid', -Number(invoice.amount_paid)] : null,
      ['Balance due', invoice?.balance_due ?? invoice?.total],
    ].filter(Boolean);

    totals.forEach(([label, val]) => {
      const bold = label === 'Total' || label === 'Balance due';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(label === 'Balance due' ? '#0f766e' : '#334155');
      doc.text(label, 320, rowY);
      doc.text(formatInvoiceMoney(val, currency), 430, rowY, { width: 110, align: 'right' });
      rowY += 16;
    });

    if (invoice?.customer_note) {
      rowY += 12;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#103D4D').text('Note to customer', 48, rowY);
      doc.font('Helvetica').fillColor('#64748b').text(String(invoice.customer_note), 48, rowY + 14, { width: 500 });
    }

    doc.end();
  });
}

/** Packing slip — line items and quantities only (no pricing). */
export function buildPackingSlipPdfBuffer({ invoice, customer, line_items }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#103D4D').fontSize(24).font('Helvetica-Bold').text('PACKING SLIP', 48, 48);
    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    doc.text(`Invoice no. ${formatInvoiceNumber(invoice?.invoice_number)}`, 48, 82);
    doc.text(`Date ${formatDisplayDate(invoice?.issue_date)}`, 48, 96);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#103D4D').text('Ship to', 48, 130);
    doc.font('Helvetica').fillColor('#475569');
    const custName = customer?.display_name || customer?.company_name || 'Customer';
    doc.text(custName, 48, 146);
    let y = 160;
    if (customer?.billing_address) {
      doc.text(customer.billing_address, 48, y);
      y += 14;
    }
    const cityLine = [customer?.city, customer?.state, customer?.postal_code].filter(Boolean).join(', ');
    if (cityLine) doc.text(cityLine, 48, y);

    const tableTop = 210;
    doc.fillColor('#e6fffa').rect(48, tableTop, 499, 24).fill();
    doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(8);
    doc.text('#', 54, tableTop + 8);
    doc.text('Product or service', 72, tableTop + 8);
    doc.text('Description', 240, tableTop + 8);
    doc.text('Qty', 500, tableTop + 8, { width: 40, align: 'right' });

    const lines = Array.isArray(line_items) ? line_items : [];
    let rowY = tableTop + 30;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    lines.forEach((ln, idx) => {
      if (idx % 2 === 1) {
        doc.fillColor('#f8fafc').rect(48, rowY - 4, 499, 22).fill();
        doc.fillColor('#334155');
      }
      doc.text(String(idx + 1), 54, rowY);
      doc.text(String(ln?.product_service || ''), 72, rowY, { width: 160 });
      doc.text(String(ln?.description || ''), 240, rowY, { width: 250 });
      doc.text(String(Number(ln?.quantity) || 0), 480, rowY, { width: 60, align: 'right' });
      rowY += 22;
    });

    doc.end();
  });
}
