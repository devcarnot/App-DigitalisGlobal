'use client';

import { canApplyLeaveRole } from '../../../lib/erp-leave';
import { useErpSession } from '../../../components/erp/useErpSession';
import ErpAttendanceMember from '../../../components/erp/ErpAttendanceMember';
import ErpAccessDeniedCard from '../../../components/erp/ErpAccessDeniedCard';

export default function ErpAttendancePage() {
  const { profile } = useErpSession();

  if (!canApplyLeaveRole(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Check-in is available to workspace team members, team leads, and admins." />
    );
  }

  return (
    <div className="w-full min-w-0">
      <ErpAttendanceMember />
    </div>
  );
}
