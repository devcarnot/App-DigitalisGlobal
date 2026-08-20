'use client';

import React, { Suspense } from 'react';
import ErpAdministration from '../../../../components/erp/ErpAdministration';

function AdministrationFallback() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
    </div>
  );
}

export default function ErpAdministrationPage() {
  return (
    <Suspense fallback={<AdministrationFallback />}>
      <ErpAdministration />
    </Suspense>
  );
}
