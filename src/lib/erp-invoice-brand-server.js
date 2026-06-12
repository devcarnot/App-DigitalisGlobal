import path from 'node:path';
import { getPublicSiteOrigin } from './public-site-url';
import {
  ERP_INVOICE_LOGO_PUBLIC_PATH,
  ERP_INVOICE_LOGO_FILENAME,
  ERP_INVOICE_WORDMARK_PUBLIC_PATH,
  ERP_INVOICE_WORDMARK_FILENAME,
} from './erp-invoice-brand';

/** Absolute URL for the invoice wordmark in emails. */
export function getInvoiceLogoAbsoluteUrl(origin = getPublicSiteOrigin()) {
  const base = String(origin || getPublicSiteOrigin()).replace(/\/+$/, '');
  return `${base}${ERP_INVOICE_WORDMARK_PUBLIC_PATH}`;
}

/** Server-side path to embed wordmark in PDFs. */
export function resolveInvoiceLogoFilePath() {
  return path.join(process.cwd(), 'public', ERP_INVOICE_WORDMARK_FILENAME);
}

export { ERP_INVOICE_LOGO_PUBLIC_PATH, ERP_INVOICE_LOGO_FILENAME };
