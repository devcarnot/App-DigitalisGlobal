'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Catches runtime errors under /erp so users see a recovery UI instead of a bare 500 page.
 */
export default function ErpError({ error, reset }) {
  useEffect(() => {
    console.error('ERP route error:', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-lg font-bold text-[#103D4D]">Workspace unavailable</p>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Something went wrong loading this screen. You can try again or go back to a safe page.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-[#0d3442] hover:to-teal-800"
        >
          Try again
        </button>
        <Link
          href="/erp/dashboard"
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
