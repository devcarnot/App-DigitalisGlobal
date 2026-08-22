'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../lib/erp-lazy-route';

const ErpAdminFinance = erpLazy(() => import('../../../../components/erp/ErpAdminFinance'));

function ErpAdminFinancePageInner() {
  const { profile } = useErpSession();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get('tab');

  if (!isErpGlobalAdmin(profile?.role)) {
    return <ErpAccessDeniedCard message="Finance is only available to workspace administrators." />;
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="Money in, money out" title="Finance" accent="emerald" />
      <ErpAdminFinance initialTab={initialTab} />
    </div>
  );
}

export default function ErpAdminFinancePage() {
  return (
    <Suspense fallback={null}>
      <ErpAdminFinancePageInner />
    </Suspense>
  );
}
