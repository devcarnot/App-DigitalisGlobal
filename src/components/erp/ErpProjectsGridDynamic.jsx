'use client';

import dynamic from 'next/dynamic';

/** Code-split: projects list is heavy; load after route shell. */
export default dynamic(() => import('./ErpProjectsGrid'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-12 text-center text-sm text-slate-600 dark:border-teal-900/40 dark:bg-[#121f28]/80 dark:text-slate-400">
      Loading projects…
    </div>
  ),
});
