'use client';

import { ERP_INVOICE_LOGO_PUBLIC_PATH } from '../../lib/erp-invoice-brand';

/** Digitalis logo used across invoice UI, email preview, and PDF preview. */
export default function ErpInvoiceLogo({ className = 'h-10 w-auto max-w-[160px] object-contain', alt = 'Digitalis Global' }) {
  return <img src={ERP_INVOICE_LOGO_PUBLIC_PATH} alt={alt} className={className} draggable={false} />;
}
