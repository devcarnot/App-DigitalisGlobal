'use client';

import { Suspense } from 'react';
import { erpLazy } from '../../../lib/erp-lazy-route';

const ErpAnnouncementsHub = erpLazy(() => import('../../../components/erp/ErpAnnouncementsHub'));

export default function ErpAnnouncementsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-0 sm:px-1">
      <Suspense fallback={null}>
        <ErpAnnouncementsHub />
      </Suspense>
    </div>
  );
}
