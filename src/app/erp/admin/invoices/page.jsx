'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

/** Legacy route — invoices live under Finance now. */
export default function ErpAdminInvoicesPage() {
  const router = useRouter();
  const { profile } = useErpSession();

  useEffect(() => {
    if (!isErpGlobalAdmin(profile?.role)) return;
    router.replace('/erp/admin/finance?tab=invoices');
  }, [router, profile?.role]);

  if (!isErpGlobalAdmin(profile?.role)) {
    return <ErpAccessDeniedCard message="Invoices are only available to workspace administrators." />;
  }

  return null;
}
