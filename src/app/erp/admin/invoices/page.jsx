'use client';

import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAdminInvoices from '../../../../components/erp/ErpAdminInvoices';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

export default function ErpAdminInvoicesPage() {
  const { profile } = useErpSession();

  if (!isErpGlobalAdmin(profile?.role)) {
    return <ErpAccessDeniedCard message="Invoices are only available to workspace administrators." />;
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="Billing" title="Invoices" accent="emerald" />
      <ErpAdminInvoices />
    </div>
  );
}
