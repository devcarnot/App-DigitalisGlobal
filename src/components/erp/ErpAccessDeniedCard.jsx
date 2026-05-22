'use client';

import Link from 'next/link';
import { ERP_DARK_ACCOUNT_CARD } from '../../lib/erp-dark-surfaces';

/**
 * Consistent “no permission” empty state for ERP pages (light + dark).
 */
export default function ErpAccessDeniedCard({
  message,
  href = '/erp/dashboard',
  linkLabel = 'Back to Home',
  accent = 'teal',
}) {
  const btnClass =
    accent === 'amber'
      ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700'
      : 'erp-brand-fill hover:opacity-95';

  return (
    <div
      className={`mx-auto max-w-md space-y-4 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 p-10 text-center shadow-lg backdrop-blur-sm dark:border-teal-800/45 dark:from-[#0e1824] dark:via-[#0a1218] dark:to-[#060a0f] dark:text-slate-300 ${ERP_DARK_ACCOUNT_CARD}`}
    >
      <p className="text-base font-medium text-teal-900/90 dark:text-slate-200">{message}</p>
      <Link
        href={href}
        className={`inline-flex rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition ${btnClass}`}
      >
        {linkLabel}
      </Link>
    </div>
  );
}
