'use client';

import React from 'react';
import Link from 'next/link';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import AdminErpStatistics from '../../../../components/admin/AdminErpStatistics';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';

export default function ErpAdminStatisticsPage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-teal-900/80 space-y-4">
        <p className="text-base font-medium">Statistics are only available to workspace admins and team leads.</p>
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
      <ErpAdminPageHero eyebrow="Analytics" title="Statistics" accent="violet" />
      <AdminErpStatistics />
    </div>
  );
}
