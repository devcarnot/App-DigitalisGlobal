'use client';

import Link from 'next/link';
import { canApplyLeaveRole } from '../../../lib/erp-leave';
import { isErpAdminEquivalent } from '../../../lib/erp-roles';
import ErpLeaveAdmin from '../../../components/erp/ErpLeaveAdmin';
import ErpLeaveMember from '../../../components/erp/ErpLeaveMember';
import { useErpSession } from '../../../components/erp/useErpSession';

export default function ErpLeavePage() {
  const { profile } = useErpSession();

  if (!canApplyLeaveRole(profile?.role)) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 p-10 text-center text-teal-900/80 shadow-lg backdrop-blur-sm">
        <p className="text-base font-medium">Leave requests are available to workspace team members, team leads, and admins.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  const showAdminLeave = isErpAdminEquivalent(profile?.role);

  return (
    <div className="mx-auto w-full max-w-[min(100%,96rem)] space-y-10">
      {showAdminLeave ? <ErpLeaveAdmin /> : null}
      <div className={showAdminLeave ? 'border-t border-slate-200/80 pt-10' : ''}>
        <ErpLeaveMember />
      </div>
    </div>
  );
}
