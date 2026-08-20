'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAttendanceAdmin from '../../../../components/erp/ErpAttendanceAdmin';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';

export default function ErpAdminAttendancePage() {
  const router = useRouter();
  const { erpCan, profile, loading } = useErpSession();

  useEffect(() => {
    if (loading || !profile) return;
    if (erpCan('attendance_admin', 'view') && !isErpGlobalAdmin(profile.role)) {
      router.replace('/erp/team');
    }
  }, [loading, profile, erpCan, router]);

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  if (!erpCan('attendance_admin', 'view')) {
    return (
      <ErpAccessDeniedCard message="Org attendance administration is available to Super Admin (or when enabled in Users & Roles)." />
    );
  }

  if (!isErpGlobalAdmin(profile?.role)) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  return <ErpAttendanceAdmin />;
}
