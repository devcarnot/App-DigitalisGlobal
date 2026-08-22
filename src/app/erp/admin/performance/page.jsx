'use client';

import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../lib/erp-lazy-route';

const ErpPerformanceDashboard = erpLazy(() => import('../../../../components/erp/ErpPerformanceDashboard'));

export default function ErpAdminPerformancePage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Performance and project pipeline are only available to workspace admins and team leads." />
    );
  }

  return <ErpPerformanceDashboard />;
}
