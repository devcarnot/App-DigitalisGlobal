'use client';

import { canApplyLeaveRole } from '../../../lib/erp-leave';
import { isErpAdminEquivalent } from '../../../lib/erp-roles';
import ErpLeaveAdmin from '../../../components/erp/ErpLeaveAdmin';
import ErpLeaveMember from '../../../components/erp/ErpLeaveMember';
import { useErpSession } from '../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../components/erp/ErpAccessDeniedCard';

export default function ErpLeavePage() {
  const { profile } = useErpSession();

  if (!canApplyLeaveRole(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Leave requests are available to workspace team members, team leads, and admins." />
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
