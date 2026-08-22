'use client';

import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../lib/erp-lazy-route';

const ErpClientsHub = erpLazy(() => import('../../../../components/admin/ErpClientsHub'));

export default function ErpAdminClientsPage() {
  const { erpCan } = useErpSession();

  if (!erpCan('clients', 'view')) {
    return (
      <ErpAccessDeniedCard
        message="You do not have permission to open the client directory."
        accent="amber"
      />
    );
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="CRM" title="Clients & CRM" accent="amber" />
      <ErpClientsHub />
    </div>
  );
}
