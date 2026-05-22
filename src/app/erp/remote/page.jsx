'use client';

import { canApplyRemoteRole } from '../../../lib/erp-remote-work';
import { isErpAdminEquivalent } from '../../../lib/erp-roles';
import ErpRemoteWorkAdmin from '../../../components/erp/ErpRemoteWorkAdmin';
import ErpRemoteWorkMember from '../../../components/erp/ErpRemoteWorkMember';
import { useErpSession } from '../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../components/erp/ErpAccessDeniedCard';

export default function ErpRemotePage() {
  const { profile } = useErpSession();

  if (!canApplyRemoteRole(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Remote / WFH requests are available to workspace team members, team leads, and admins." />
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
