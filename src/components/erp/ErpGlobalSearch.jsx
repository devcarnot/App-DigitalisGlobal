'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS } from '../../lib/erp-list-search';

/**
 * Sticky header search: submits to `/erp/search?q=…`. Full bar on md+; icon link on small screens.
 */
export default function ErpGlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !pathname?.startsWith('/erp/search')) return;
    const sp = new URLSearchParams(window.location.search);
    setQ(sp.get('q') || '');
  }, [pathname]);

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const t = q.trim();
      router.push(t ? `/erp/search?q=${encodeURIComponent(t)}` : '/erp/search');
    },
    [q, router],
  );

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="relative hidden min-h-0 max-w-xl min-w-[10rem] md:block"
        role="search"
        aria-label="Search workspace"
      >
        <span
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-teal-700/50 dark:text-teal-300/55"
          aria-hidden
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </span>
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects, tasks, people…"
          className={`${ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS} h-10 max-w-none py-2 pr-3 text-[13px]`}
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      <Link
        href="/erp/search"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/90 text-[#103D4D] shadow-sm dark:border-slate-600 dark:from-slate-800 dark:to-slate-900/95 dark:text-cyan-100 md:hidden"
        aria-label="Open search"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      </Link>
    </>
  );
}
