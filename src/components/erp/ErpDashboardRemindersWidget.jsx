'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listErpReminders } from '../../lib/erp-reminders-client';
import { useErpSession } from './useErpSession';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const SHOW_LIMIT = 4;

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function minsUntil(iso) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

/**
 * Compact upcoming reminders widget for the dashboard.
 */
export default function ErpDashboardRemindersWidget() {
  const { session } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `dashboard:reminders:${uid}` : null;
  const [reminders, setReminders] = useState(() => pickErpCache(CACHE_KEY, (c) => c.reminders ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));

  const load = useCallback(async () => {
    beginErpCachedLoad(
      CACHE_KEY,
      (cached) => {
        setReminders(Array.isArray(cached?.reminders) ? cached.reminders : []);
      },
      setLoading,
    );
    try {
      const data = await listErpReminders({ range: 'upcoming' });
      const next = Array.isArray(data?.reminders) ? data.reminders : [];
      writeErpDataCache(CACHE_KEY, { reminders: next });
      setReminders(next);
    } catch {
      if (!hasErpDataCache(CACHE_KEY)) setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    const now = Date.now();
    return reminders
      .filter((r) => !r.completed_at && new Date(r.remind_at).getTime() >= now - 60000)
      .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at))
      .slice(0, SHOW_LIMIT);
  }, [reminders]);

  if (loading && reminders.length === 0) {
    return (
      <section
        aria-label="Reminders"
        className="rounded-2xl border border-cyan-200/65 bg-white px-4 py-3 shadow-sm dark:border-teal-900/45 dark:bg-[#0a1016] dark:[background-image:none]"
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
          Loading reminders…
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Upcoming reminders"
      className="overflow-hidden rounded-2xl border border-cyan-200/65 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-teal-900/45 dark:bg-[#0a1016] dark:ring-teal-950/25 dark:[background-image:none]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/85 px-4 py-2.5 dark:border-teal-900/45">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
            Reminders
          </span>
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
            {items.length}
          </span>
        </div>
        <Link
          href="/erp/reminders"
          className="text-[11px] font-bold uppercase tracking-wide text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
        >
          View all
        </Link>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-teal-950/50">
        {items.map((r) => {
          const mins = minsUntil(r.remind_at);
          const soon = mins >= 0 && mins <= 60;
          return (
            <li key={r.id} className="px-4 py-2.5">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{r.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">
                {fmtWhen(r.remind_at)}
                {soon ? (
                  <span className="ml-2 font-semibold text-amber-700 dark:text-amber-300">
                    {mins <= 0 ? 'now' : `in ${mins} min`}
                  </span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
