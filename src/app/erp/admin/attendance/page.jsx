'use client';

import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAttendanceAdmin from '../../../../components/erp/ErpAttendanceAdmin';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

export default function ErpAdminAttendancePage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Attendance admin is only available to workspace admins and team leads." />
    );
  }

  return <ErpAttendanceAdmin />;
}
