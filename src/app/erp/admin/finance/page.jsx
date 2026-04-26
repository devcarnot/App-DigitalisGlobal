'use client';

import Link from 'next/link';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAdminFinance from '../../../../components/erp/ErpAdminFinance';

export default function ErpAdminFinancePage() {
  const { profile } = useErpSession();

  if (!isErpGlobalAdmin(profile?.role)) {
    return (
      <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-teal-900/80 space-y-4">
        <p className="text-base font-medium">Finance is only available to workspace administrators.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="Money in, money out" title="Finance" accent="emerald" />
      <ErpAdminFinance />
    </div>
  );
}
