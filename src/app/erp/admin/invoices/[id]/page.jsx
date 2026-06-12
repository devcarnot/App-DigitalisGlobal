'use client';

import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { useErpSession } from '../../../../../components/erp/useErpSession';
import ErpAdminInvoiceEditor from '../../../../../components/erp/ErpAdminInvoiceEditor';
import ErpAccessDeniedCard from '../../../../../components/erp/ErpAccessDeniedCard';

export default function ErpAdminInvoiceEditPage({ params }) {
  const { profile } = useErpSession();
  const invoiceId = typeof params?.id === 'string' ? params.id : null;

  if (!isErpGlobalAdmin(profile?.role)) {
    return <ErpAccessDeniedCard message="Invoices are only available to workspace administrators." />;
  }

  return (
    <div className="space-y-6">
      <ErpAdminInvoiceEditor invoiceId={invoiceId} />
    </div>
  );
}
