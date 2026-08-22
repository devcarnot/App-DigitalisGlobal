'use client';

import { erpLazy } from '../../../lib/erp-lazy-route';

const ErpFilesLibrary = erpLazy(() => import('../../../components/erp/ErpFilesLibrary'));

export default function ErpFilesPage() {
  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-0 sm:px-1">
      <ErpFilesLibrary />
    </div>
  );
}
