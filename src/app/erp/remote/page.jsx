'use client';

import Link from 'next/link';
import { canApplyRemoteRole } from '../../../lib/erp-remote-work';
import { isErpAdminEquivalent } from '../../../lib/erp-roles';
import ErpRemoteWorkAdmin from '../../../components/erp/ErpRemoteWorkAdmin';
import ErpRemoteWorkMember from '../../../components/erp/ErpRemoteWorkMember';
import { useErpSession } from '../../../components/erp/useErpSession';

export default function ErpRemotePage() {
  const { profile } = useErpSession();

  if (!canApplyRemoteRole(profile?.role)) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 p-10 text-center text-teal-900/80 shadow-lg backdrop-blur-sm">
        <p className="text-base font-medium">
          Remote / WFH requests are available to workspace team members, team leads, and admins.
        </p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  const showAdminRemote = isErpAdminEquivalent(profile?.role);

  return (
    <div className="mx-auto w-full max-w-[min(100%,96rem)] space-y-10">
      {showAdminRemote ? <ErpRemoteWorkAdmin /> : null}
      <div className={showAdminRemote ? 'border-t border-slate-200/80 pt-10' : ''}>
        <ErpRemoteWorkMember />
      </div>
    </div>
  );
}
