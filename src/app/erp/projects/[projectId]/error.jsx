'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Narrow boundary for project workspace failures — keeps shell when possible. */
export default function ErpProjectPageError({ error, reset }) {
  useEffect(() => {
    console.error('ERP project page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-lg font-bold text-[#103D4D]">Could not load this project</p>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        A client error occurred. Try again or open the project from the list.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Try again
        </button>
        <Link
          href="/erp/projects"
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          All projects
        </Link>
      </div>
    </div>
  );
}
