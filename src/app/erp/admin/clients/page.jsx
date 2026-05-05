'use client';

import Link from 'next/link';
import { isErpWorkspaceRosterEditor } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpClientRoster from '../../../../components/admin/ErpClientRoster';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';

export default function ErpAdminClientsPage() {
  const { profile } = useErpSession();

  if (!isErpWorkspaceRosterEditor(profile?.role)) {
    return (
      <div className="rounded-2xl border border-amber-200/50 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-orange-50/60 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-amber-950/80 space-y-4">
        <p className="text-base font-medium">The client directory is available to workspace admins, team leads, and team members.</p>
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
      <ErpAdminPageHero eyebrow="Directory" title="Clients" accent="amber" />
      <ErpClientRoster />
    </div>
  );
}
