'use client';

import {
  ERP_INVOICE_WORDMARK_EMAIL_HEIGHT,
  ERP_INVOICE_WORDMARK_EMAIL_WIDTH,
  ERP_INVOICE_WORDMARK_PUBLIC_PATH,
} from '../../lib/erp-invoice-brand';

/** Digitalis wordmark — sharp in UI, email preview, and PDF preview. */
export default function ErpInvoiceLogo({
  className = 'h-9 w-auto max-w-[180px] object-contain object-left dark:brightness-0 dark:invert dark:opacity-95',
  alt = 'Digitalis Global',
}) {
  return (
    <img
      src={ERP_INVOICE_WORDMARK_PUBLIC_PATH}
      alt={alt}
      className={className}
      width={ERP_INVOICE_WORDMARK_EMAIL_WIDTH}
      height={ERP_INVOICE_WORDMARK_EMAIL_HEIGHT}
      draggable={false}
    />
  );
}
