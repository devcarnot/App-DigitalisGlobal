'use client';

import Link from 'next/link';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpPerformanceDashboard from '../../../../components/erp/ErpPerformanceDashboard';

export default function ErpAdminPerformancePage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 p-10 text-center text-teal-900/80 shadow-lg backdrop-blur-sm">
        <p className="text-base font-medium">Performance and project pipeline are only available to workspace admins and team leads.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return <ErpPerformanceDashboard />;
}
