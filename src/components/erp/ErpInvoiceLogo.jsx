'use client';

import {
  ERP_INVOICE_LOGO_PUBLIC_PATH,
  ERP_INVOICE_WORDMARK_EMAIL_HEIGHT,
  ERP_INVOICE_WORDMARK_EMAIL_WIDTH,
  ERP_INVOICE_WORDMARK_PUBLIC_PATH,
} from '../../lib/erp-invoice-brand';

/** Digitalis branding — wordmark (default) or square favicon icon. */
export default function ErpInvoiceLogo({
  variant = 'wordmark',
  className,
  alt = 'Digitalis Global',
}) {
  const isIcon = variant === 'icon';

  const resolvedClassName =
    className ||
    (isIcon
      ? 'h-10 w-10 shrink-0 object-contain object-center'
      : 'h-9 w-auto max-w-[180px] object-contain object-left dark:brightness-0 dark:invert dark:opacity-95');

  return (
    <img
      src={isIcon ? ERP_INVOICE_LOGO_PUBLIC_PATH : ERP_INVOICE_WORDMARK_PUBLIC_PATH}
      alt={alt}
      className={resolvedClassName}
      width={isIcon ? 40 : ERP_INVOICE_WORDMARK_EMAIL_WIDTH}
      height={isIcon ? 40 : ERP_INVOICE_WORDMARK_EMAIL_HEIGHT}
      draggable={false}
    />
  );
}
