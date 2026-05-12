'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { erpAuthorizedFetch } from '../../../lib/erp-client-api';
import ErpAdminPageHero from '../../../components/erp/ErpAdminPageHero';

function SearchBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') || '').trim();
  /** Local controlled value for the on-page search input. Synced with the
   *  `?q=` URL param both ways: typing pushes the new query into the URL
   *  (debounced) so the active fetch + browser history reflect what the
   *  user is looking for, and a URL change (e.g. back/forward) restores
   *  the input. */
  const [inputValue, setInputValue] = useState(q);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [data, setData] = useState(/** @type {{ projects: any[], tasks: any[], people: any[] } | null} */ (null));
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Keep the input mirrored to the URL — back/forward + the header bar both
  // round-trip through the URL, so this is the single source of truth.
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  // Auto-focus the on-page search input when landing here with no query. On
  // mobile the header is icon-only (no space for an input), so this is the
  // primary place users type — opening the keyboard immediately removes a
  // confusing extra tap.
  useEffect(() => {
    if (!q && inputRef.current && typeof window !== 'undefined') {
      // Defer one tick so the iOS / Android virtual keyboard reliably opens.
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [q]);

  const pushQuery = useCallback(
    (value) => {
      const t = String(value || '').trim();
      router.replace(t ? `/erp/search?q=${encodeURIComponent(t)}` : '/erp/search', { scroll: false });
    },
    [router],
  );

  // Debounce typing → URL updates so we don't push a history entry per
  // keystroke; the fetch effect listens on `q` (which comes from the URL),
  // so this also debounces the network request.
  useEffect(() => {
    if (inputValue === q) return undefined;
    const id = window.setTimeout(() => pushQuery(inputValue), 220);
    return () => window.clearTimeout(id);
  }, [inputValue, q, pushQuery]);

  useEffect(() => {
    if (q.length < 2) {
      setData({ projects: [], tasks: [], people: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr('');
    erpAuthorizedFetch(`/api/erp/me/search?q=${encodeURIComponent(q)}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Search failed');
        if (!cancelled) {
          setData({
            projects: j.projects || [],
            tasks: j.tasks || [],
            people: j.people || [],
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      pushQuery(inputValue);
    },
    [inputValue, pushQuery],
  );

  const onClear = useCallback(() => {
    setInputValue('');
    pushQuery('');
    inputRef.current?.focus();
  }, [pushQuery]);

  const hasResults =
    data && (data.projects.length > 0 || data.tasks.length > 0 || data.people.length > 0);

  return (
    <div className="space-y-10">
      <ErpAdminPageHero
        eyebrow="Workspace"
        title="Search"
        description={
          q.length >= 2
            ? `Results for “${q}”`
            : 'Find projects, tasks, and people you have access to.'
        }
        accent="teal"
      />

      <form
        onSubmit={onSubmit}
        role="search"
        aria-label="Search workspace"
        className="relative"
      >
        <span
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-teal-700/60 dark:text-teal-300/70"
          aria-hidden
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search projects, tasks, people…"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="search"
          className="w-full rounded-2xl border border-cyan-200/70 bg-white/95 py-3.5 pl-12 pr-12 text-base text-slate-900 shadow-sm outline-none transition focus:border-cyan-400/80 focus:ring-4 focus:ring-cyan-400/15 dark:border-teal-800/55 dark:bg-[#0a1520]/95 dark:text-slate-100 dark:focus:border-teal-500/70 dark:focus:ring-teal-500/15"
        />
        {inputValue ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </form>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-cyan-300" />
        </div>
      ) : null}

      {err ? (
        <p className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {err}
        </p>
      ) : null}

      {q.length < 2 && !loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Type at least two characters above to find projects, tasks, and people you have access to.
        </p>
      ) : null}

      {!loading && q.length >= 2 && data && !hasResults ? (
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matches found.</p>
      ) : null}

      {data?.projects?.length ? (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-teal-800/70 dark:text-teal-300/80">Projects</h2>
          <ul className="divide-y divide-cyan-100/80 rounded-2xl border border-cyan-200/50 bg-white/90 dark:divide-teal-900/50 dark:border-teal-900/50 dark:bg-[#0a1520]/90">
            {data.projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/erp/projects/${p.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#103D4D] transition-colors hover:bg-cyan-50/80 dark:text-teal-100 dark:hover:bg-white/[0.06]"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-[11px] font-medium text-teal-600/80 dark:text-teal-400/80">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data?.tasks?.length ? (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-teal-800/70 dark:text-teal-300/80">Tasks</h2>
          <ul className="divide-y divide-cyan-100/80 rounded-2xl border border-cyan-200/50 bg-white/90 dark:divide-teal-900/50 dark:border-teal-900/50 dark:bg-[#0a1520]/90">
            {data.tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/erp/projects/${t.project_id}`}
                  className="block px-4 py-3 text-sm transition-colors hover:bg-cyan-50/80 dark:hover:bg-white/[0.06]"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">{t.title}</span>
                  {t.status ? (
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{t.status}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data?.people?.length ? (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-teal-800/70 dark:text-teal-300/80">People</h2>
          <ul className="divide-y divide-cyan-100/80 rounded-2xl border border-cyan-200/50 bg-white/90 dark:divide-teal-900/50 dark:border-teal-900/50 dark:bg-[#0a1520]/90">
            {data.people.map((p) => (
              <li key={p.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900 dark:text-white">{p.full_name?.trim() || '—'}</p>
                {p.contact_email ? (
                  <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">{p.contact_email}</p>
                ) : null}
                {p.role ? (
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-teal-700/80 dark:text-teal-400/75">
                    {String(p.role).replace(/_/g, ' ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function ErpSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-cyan-300" />
        </div>
      }
    >
      <SearchBody />
    </Suspense>
  );
}
