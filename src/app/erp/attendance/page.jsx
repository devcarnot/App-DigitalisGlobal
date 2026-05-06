'use client';

import Link from 'next/link';
import { canApplyLeaveRole } from '../../../lib/erp-leave';
import { useErpSession } from '../../../components/erp/useErpSession';
import ErpAttendanceMember from '../../../components/erp/ErpAttendanceMember';

export default function ErpAttendancePage() {
  const { profile } = useErpSession();

  if (!canApplyLeaveRole(profile?.role)) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 p-10 text-center text-teal-900/80 shadow-lg backdrop-blur-sm">
        <p className="text-base font-medium">Check-in is available to workspace team members, team leads, and admins.</p>
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
    <div className="w-full min-w-0">
      <ErpAttendanceMember />
    </div>
  );
}
