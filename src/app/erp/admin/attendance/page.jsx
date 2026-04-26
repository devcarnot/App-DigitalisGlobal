'use client';

import Link from 'next/link';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAttendanceAdmin from '../../../../components/erp/ErpAttendanceAdmin';

export default function ErpAdminAttendancePage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 p-10 text-center text-teal-900/80 shadow-lg backdrop-blur-sm">
        <p className="text-base font-medium">Attendance and leave approvals are only available to workspace admins and team leads.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return <ErpAttendanceAdmin />;
}
