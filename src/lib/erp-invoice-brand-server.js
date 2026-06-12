import path from 'node:path';
import { getPublicSiteOrigin } from './public-site-url';
import { ERP_INVOICE_LOGO_PUBLIC_PATH, ERP_INVOICE_LOGO_FILENAME } from './erp-invoice-brand';

/** Absolute URL for emails and external previews. */
export function getInvoiceLogoAbsoluteUrl(origin = getPublicSiteOrigin()) {
  const base = String(origin || getPublicSiteOrigin()).replace(/\/+$/, '');
  return `${base}${ERP_INVOICE_LOGO_PUBLIC_PATH}`;
}

/** Server-side path to embed logo in PDFs. */
export function resolveInvoiceLogoFilePath() {
  return path.join(process.cwd(), 'public', ERP_INVOICE_LOGO_FILENAME);
}
