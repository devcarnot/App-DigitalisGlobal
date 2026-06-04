'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { buildErpMeetingJoinUrl, listErpMeetings } from '../../lib/erp-meetings-client';
import { useErpSession } from './useErpSession';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const SHOW_LIMIT = 4;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtRelativeDay(d) {
  const today = startOfToday();
  const tomorrow = startOfTomorrow();
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function minutesUntil(d) {
  return Math.round((d.getTime() - Date.now()) / 60000);
}

/**
 * Compact "Today + Next" meetings widget for the dashboard.
 * Hidden entirely when there are no upcoming meetings — keeps the dashboard tidy.
 */
export default function ErpDashboardMeetingsWidget() {
  const { session } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `dashboard:meetings:${uid}` : null;
  const [meetings, setMeetings] = useState(() => pickErpCache(CACHE_KEY, (c) => c.meetings ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));

  const load = useCallback(async () => {
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setMeetings(Array.isArray(cached?.meetings) ? cached.meetings : []);
    }, setLoading);
    try {
      const data = await listErpMeetings({ range: 'upcoming', status: 'scheduled' });
      const nextMeetings = Array.isArray(data?.meetings) ? data.meetings : [];
      writeErpDataCache(CACHE_KEY, { meetings: nextMeetings });
      setMeetings(nextMeetings);
    } catch {
      if (!hasErpDataCache(CACHE_KEY)) setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY]);

  useEffect(() => {
    void load();
  }, [load]);

  const { todayCount, items } = useMemo(() => {
    const now = Date.now();
    const todayStart = startOfToday().getTime();
    const tomorrowStart = startOfTomorrow().getTime();
    let today = 0;
    const upcoming = [];
    for (const m of meetings) {
      const t = new Date(m.scheduled_at).getTime();
      if (Number.isNaN(t)) continue;
      const endT = t + (Number(m.duration_minutes) || 30) * 60 * 1000;
      if (endT <= now) continue;
      if (t >= todayStart && t < tomorrowStart) today += 1;
      upcoming.push(m);
    }
    upcoming.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    return { todayCount: today, items: upcoming.slice(0, SHOW_LIMIT) };
  }, [meetings]);

  if (loading && meetings.length === 0) {
    return (
      <section
        aria-label="Meetings"
        className="rounded-2xl border border-cyan-200/65 bg-white px-4 py-3 shadow-sm dark:border-teal-900/45 dark:bg-[#0a1016] dark:[background-image:none]"
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
          Loading meetings…
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Upcoming meetings"
      className="overflow-hidden rounded-2xl border border-cyan-200/65 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-teal-900/45 dark:bg-[#0a1016] dark:ring-teal-950/25 dark:[background-image:none]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/85 px-4 py-2.5 dark:border-teal-900/45">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#103D4D] dark:text-teal-300">
            Meetings
          </span>
          {todayCount > 0 ? (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800 ring-1 ring-teal-200 dark:bg-teal-900/55 dark:text-teal-100 dark:ring-teal-700/55">
              {todayCount} today
            </span>
          ) : null}
        </div>
        <Link
          href="/erp/meetings"
          className="text-[11px] font-bold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
        >
          View all
        </Link>
      </header>
      <ul className="divide-y divide-slate-200/85 dark:divide-teal-900/45">
        {items.map((m) => {
          const start = new Date(m.scheduled_at);
          const mins = minutesUntil(start);
          const startsSoon = mins >= -10 && mins <= 30;
          const joinUrl = m.location_url || buildErpMeetingJoinUrl(m.jitsi_room);
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 transition hover:bg-slate-50/85 dark:hover:bg-[#0e1824]/85"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-extrabold text-slate-900 dark:text-slate-50">{m.title}</p>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <span className="text-teal-800 dark:text-teal-300">{fmtRelativeDay(start)}</span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                  {fmtTime(start)}
                  {startsSoon && mins >= 0 ? (
                    <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-800/55">
                      In {mins} min
                    </span>
                  ) : null}
                  {mins < 0 ? (
                    <span className="ml-2 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55">
                      Now
                    </span>
                  ) : null}
                </p>
              </div>
              {joinUrl ? (
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
                >
                  Join
                </a>
              ) : (
                <Link
                  href="/erp/meetings"
                  className="rounded-lg border border-slate-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
                >
                  Details
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
