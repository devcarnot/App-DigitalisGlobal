'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { erpAuthorizedFetch } from '../../../lib/erp-client-api';
import ErpAdminPageHero from '../../../components/erp/ErpAdminPageHero';

function SearchBody() {
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') || '').trim();
  const [data, setData] = useState(/** @type {{ projects: any[], tasks: any[], people: any[] } | null} */ (null));
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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

  const hasResults =
    data && (data.projects.length > 0 || data.tasks.length > 0 || data.people.length > 0);

  return (
    <div className="space-y-10">
      <ErpAdminPageHero
        eyebrow="Workspace"
        title="Search"
        description={q.length >= 2 ? `Results for “${q}”` : 'Enter at least 2 characters in the header search.'}
        accent="teal"
      />

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
          Use the search field in the top bar (or below on mobile) to find projects, tasks, and people you have access to.
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
