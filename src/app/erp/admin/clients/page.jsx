'use client';

import Link from 'next/link';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpClientsHub from '../../../../components/admin/ErpClientsHub';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';

export default function ErpAdminClientsPage() {
  const { erpCan } = useErpSession();

  if (!erpCan('clients', 'view')) {
    return (
      <div className="rounded-2xl border border-amber-200/50 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-orange-50/60 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-amber-950/80 space-y-4">
        <p className="text-base font-medium">You do not have permission to open the client directory.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="CRM" title="Clients & CRM" accent="amber" />
      <ErpClientsHub />
    </div>
  );
}
