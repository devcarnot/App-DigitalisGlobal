'use client';

import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { useErpSession } from '../../../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../../lib/erp-lazy-route';

const ErpAdminInvoiceEditor = erpLazy(() => import('../../../../../components/erp/ErpAdminInvoiceEditor'));

export default function ErpAdminInvoiceNewPage() {
  const { profile } = useErpSession();

  if (!isErpGlobalAdmin(profile?.role)) {
    return <ErpAccessDeniedCard message="Invoices are only available to workspace administrators." />;
  }

  return (
    <div className="space-y-6">
      <ErpAdminInvoiceEditor />
    </div>
  );
}
