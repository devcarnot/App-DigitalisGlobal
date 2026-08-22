'use client';

import { Suspense } from 'react';
import { erpLazy } from '../../../../lib/erp-lazy-route';
import ErpRouteLoadingFallback from '../../../../components/erp/ErpRouteLoadingFallback';

const ErpAdministration = erpLazy(() => import('../../../../components/erp/ErpAdministration'));

export default function ErpAdministrationPage() {
  return (
    <Suspense fallback={<ErpRouteLoadingFallback />}>
      <ErpAdministration />
    </Suspense>
  );
}
