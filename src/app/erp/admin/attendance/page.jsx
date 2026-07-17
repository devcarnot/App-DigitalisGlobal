'use client';

import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAttendanceAdmin from '../../../../components/erp/ErpAttendanceAdmin';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

export default function ErpAdminAttendancePage() {
  const { erpCan, loading } = useErpSession();

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  if (!erpCan('attendance_admin', 'view')) {
    return (
      <ErpAccessDeniedCard message="Team attendance is available to Super Admin and Team Manager roles (or when enabled in Users & Roles)." />
    );
  }

  return <ErpAttendanceAdmin />;
}
