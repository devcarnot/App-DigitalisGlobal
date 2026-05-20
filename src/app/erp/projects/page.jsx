'use client';

import { Suspense } from 'react';
import ErpProjectsGrid from '../../../components/erp/ErpProjectsGridDynamic';

export default function ErpProjectsPage() {
  return (
    <div className="w-full space-y-4 pb-6">
      <Suspense fallback={null}>
        <ErpProjectsGrid />
      </Suspense>
    </div>
  );
}
