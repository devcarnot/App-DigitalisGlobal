'use client';

import { Suspense } from 'react';
import ErpProjectsGrid from '../../../components/erp/ErpProjectsGrid';

export default function ErpProjectsPage() {
  return (
    <div className="w-full space-y-4 pb-6">
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-12 text-center text-sm text-slate-600 dark:border-teal-900/40 dark:bg-[#121f28]/80 dark:text-slate-400">
            Loading projects…
          </div>
        }
      >
        <ErpProjectsGrid />
      </Suspense>
    </div>
  );
}
