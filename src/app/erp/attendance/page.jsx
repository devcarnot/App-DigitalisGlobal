'use client';

import { canApplyLeaveRole } from '../../../lib/erp-leave';
import { useErpSession } from '../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../lib/erp-lazy-route';

const ErpAttendanceMember = erpLazy(() => import('../../../components/erp/ErpAttendanceMember'));

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
