'use client';

import { Suspense } from 'react';
import ErpProjectsGrid from '../../../components/erp/ErpProjectsGridDynamic';

export default function ErpProjectsPage() {
  return (
    <div className="erp-projects-page-inner w-full space-y-2 pb-3 max-lg:pb-2 sm:space-y-4 lg:pb-8">
      <Suspense fallback={null}>
        <ErpProjectsGrid />
      </Suspense>
    </div>
  );
}
