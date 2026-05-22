'use client';

import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpPerformanceDashboard from '../../../../components/erp/ErpPerformanceDashboard';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

export default function ErpAdminPerformancePage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Performance and project pipeline are only available to workspace admins and team leads." />
    );
  }

  return <ErpPerformanceDashboard />;
}
