'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpAdminPageHero from './ErpAdminPageHero';
import { classifyFeedItem, mapActivityRowToFeedItem, isErpMessagingNotification } from '../../lib/erp-activity-feed';
import { isLeaveWorkspaceNotification } from '../../lib/erp-notification-leave';
import { useErpSession } from './useErpSession';
import { useErpLeaveNotificationModal } from '../../hooks/useErpLeaveNotificationModal';

function IconSearch({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLeave({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMessage({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4v8z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTask({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 11l2 2 4-4m3 9H6a2 2 0 01-2-2V6a2 2 0 012-2h6l4 4v10a2 2 0 01-2 2z" strokeLinejoin="round" />
    </svg>
  );
}

function IconInvite({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </svg>
  );
}

function IconBell({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M18 8A6 6 0 106 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** @param {'leave' | 'message' | 'task' | 'invite' | 'default'} kind */
function kindMeta(kind) {
  switch (kind) {
    case 'leave':
      return {
        Icon: IconLeave,
        chip: 'Leave',
        iconShell:
          'bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 ring-1 ring-emerald-200/90 shadow-inner dark:from-emerald-950/50 dark:to-teal-950/40 dark:text-emerald-200 dark:ring-emerald-800/40',
      };
    case 'message':
      return {
        Icon: IconMessage,
        chip: 'Message',
        iconShell:
          'bg-gradient-to-br from-sky-100 to-violet-50 text-sky-900 ring-1 ring-sky-200/90 shadow-inner dark:from-sky-950/45 dark:to-violet-950/35 dark:text-sky-200 dark:ring-sky-800/40',
      };
    case 'task':
      return {
        Icon: IconTask,
        chip: 'Work',
        iconShell:
          'bg-gradient-to-br from-amber-100 to-orange-50 text-amber-950 ring-1 ring-amber-200/90 shadow-inner dark:from-amber-950/45 dark:to-orange-950/30 dark:text-amber-100 dark:ring-amber-800/40',
      };
    case 'invite':
      return {
        Icon: IconInvite,
        chip: 'People',
        iconShell:
          'bg-gradient-to-br from-indigo-100 to-violet-50 text-indigo-900 ring-1 ring-indigo-200/90 shadow-inner dark:from-indigo-950/45 dark:to-violet-950/35 dark:text-indigo-200 dark:ring-indigo-800/40',
      };
    default:
      return {
        Icon: IconBell,
        chip: 'Update',
        iconShell:
          'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 ring-1 ring-slate-200/90 shadow-inner dark:from-[#141c24] dark:to-[#0a1218] dark:text-teal-200 dark:ring-teal-800/45',
      };
  }
}

function startOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/** Bucket for section headers (ClickUp-style groupings). */
function inboxBucket(createdAt) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Older' };
  const today = startOfLocalDay(new Date());
  const day = startOfLocalDay(d);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) return { key: 'today', label: 'Today' };
  if (diffDays === 1) return { key: 'yesterday', label: 'Yesterday' };
  if (diffDays >= 2 && diffDays <= 6) return { key: 'week', label: 'Earlier this week' };
  if (diffDays <= 31 && day.getMonth() === today.getMonth() && day.getFullYear() === today.getFullYear()) {
    return { key: 'earlier-month', label: 'Earlier this month' };
  }
  return {
    key: `my-${day.getFullYear()}-${day.getMonth()}`,
    label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };
}

function groupRows(rows) {
  const sorted = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const out = [];
  let lastKey = null;
  for (const row of sorted) {
    const { key, label } = inboxBucket(row.created_at);
    const rk = row.feedKey || row.id;
    if (key !== lastKey) {
      lastKey = key;
      out.push({ type: 'header', key: `${key}-${rk}`, label });
    }
    out.push({ type: 'row', key: rk, row });
  }
  return out;
}

const PAGE_SIZE = 20;

export default function ErpInbox() {
  const { profile, session } = useErpSession();
  const userId = session?.user?.id;
  const { leaveModalEl, openLeaveFromNotificationRow } = useErpLeaveNotificationModal({
    viewerRole: profile?.role,
    userId,
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [marking, setMarking] = useState(false);
  const [page, setPage] = useState(1);
  const activityReloadTimerRef = useRef(null);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    const uid = sessionData.session.user.id;
    const [notifRes, actRes] = await Promise.all([
      supabase
        .from('erp_notifications')
        .select('id, title, body, read, link, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('erp_activity_log')
        .select('id, user_id, project_id, action, meta, created_at')
        .order('created_at', { ascending: false })
        .limit(400),
    ]);

    const notifs = (notifRes.error ? [] : notifRes.data || []).filter((n) => !isErpMessagingNotification(n));
    const acts = (actRes.error ? [] : actRes.data || []).filter((r) => r.action !== 'message_sent');

    const profileById = {};
    const projectNameById = {};
    const uids = [...new Set(acts.map((r) => r.user_id).filter(Boolean))];
    const pids = [...new Set(acts.map((r) => r.project_id).filter(Boolean))];

    if (uids.length) {
      const CHUNK = 80;
      for (let i = 0; i < uids.length; i += CHUNK) {
        const slice = uids.slice(i, i + CHUNK);
        const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', slice);
        for (const p of profs || []) {
          if (p?.id) profileById[p.id] = p;
        }
      }
    }
    if (pids.length) {
      const CHUNK = 80;
      for (let i = 0; i < pids.length; i += CHUNK) {
        const slice = pids.slice(i, i + CHUNK);
        const { data: projs } = await supabase.from('erp_projects').select('id, name').in('id', slice);
        for (const p of projs || []) {
          if (p?.id) projectNameById[p.id] = p.name || 'Project';
        }
      }
    }

    const notificationItems = notifs.map((n) => ({
      feedKey: `n-${n.id}`,
      kind: 'notification',
      notificationId: n.id,
      title: n.title,
      body: n.body,
      read: n.read,
      link: n.link,
      created_at: n.created_at,
    }));

    const activityItems = acts.map((r) => mapActivityRowToFeedItem(r, profileById, projectNameById));

    const merged = [...notificationItems, ...activityItems]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 500);

    if (mountedRef.current === false) return;
    setItems(merged);
    setLoading(false);
  }, []);

  /** Tracks whether the component is mounted so the async `load()` and the
   *  debounced realtime reload don't call setState after unmount. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let ch;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid || cancelled) return;
      ch = supabase
        .channel(`erp-inbox-${uid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'erp_notifications', filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new;
            if (!row?.id) return;
            if (isErpMessagingNotification(row)) return;
            if (!mountedRef.current) return;
            setItems((prev) => {
              if (prev.some((n) => n.feedKey === `n-${row.id}`)) return prev;
              const item = {
                feedKey: `n-${row.id}`,
                kind: 'notification',
                notificationId: row.id,
                title: row.title,
                body: row.body,
                read: row.read,
                link: row.link,
                created_at: row.created_at,
              };
              return [item, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 500);
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'erp_notifications', filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new;
            if (!row?.id) return;
            if (isErpMessagingNotification(row)) return;
            if (!mountedRef.current) return;
            setItems((prev) => {
              const idx = prev.findIndex((n) => n.kind === 'notification' && n.notificationId === row.id);
              if (idx < 0) return prev;
              const next = [...prev];
              const cur = next[idx];
              next[idx] = {
                ...cur,
                title: row.title ?? cur.title,
                body: row.body ?? cur.body,
                read: row.read ?? cur.read,
                link: row.link ?? cur.link,
              };
              return next;
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'erp_activity_log' },
          () => {
            // Activity log is global; debounce more aggressively and skip
            // entirely while the tab isn't visible — the next visibility
            // change or page focus will trigger a fresh load() anyway.
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            if (activityReloadTimerRef.current) clearTimeout(activityReloadTimerRef.current);
            activityReloadTimerRef.current = setTimeout(() => {
              activityReloadTimerRef.current = null;
              if (!mountedRef.current) return;
              void load();
            }, 1500);
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (activityReloadTimerRef.current) clearTimeout(activityReloadTimerRef.current);
      if (ch) supabase.removeChannel(ch);
    };
  }, [load]);

  const searchFiltered = useMemo(
    () => filterListBySearch(items, search, (n) => [n.title, n.body]),
    [items, search],
  );

  const filtered = useMemo(() => {
    if (filter === 'unread') return searchFiltered.filter((n) => n.kind === 'notification' && !n.read);
    return searchFiltered;
  }, [searchFiltered, filter]);

  const unreadCount = useMemo(() => items.filter((n) => n.kind === 'notification' && !n.read).length, [items]);

  const unreadInSearch = useMemo(
    () => searchFiltered.filter((n) => n.kind === 'notification' && !n.read).length,
    [searchFiltered],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  /** Clamp current page when the filtered list shrinks (e.g. after marking read, searching). */
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  /** Reset to first page whenever filter/search changes. */
  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageItems = useMemo(() => filtered.slice(pageStart, pageEnd), [filtered, pageStart, pageEnd]);
  const grouped = useMemo(() => groupRows(pageItems), [pageItems]);

  const markRead = async (notificationId) => {
    if (!notificationId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) return;
    setMarking(true);
    try {
      await supabase.from('erp_notifications').update({ read: true }).eq('id', notificationId).eq('user_id', uid);
      setItems((prev) =>
        prev.map((n) => (n.kind === 'notification' && n.notificationId === notificationId ? { ...n, read: true } : n)),
      );
    } finally {
      setMarking(false);
    }
  };

  const markAllRead = async () => {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return;
    setMarking(true);
    try {
      const { error } = await supabase
        .from('erp_notifications')
        .update({ read: true })
        .eq('read', false)
        .eq('user_id', uid);
      if (!error) {
        setItems((prev) => prev.map((n) => (n.kind === 'notification' ? { ...n, read: true } : n)));
      }
    } finally {
      setMarking(false);
    }
  };

  function formatShortDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <>
      <div className="w-full max-w-none space-y-5 text-[13px] leading-snug text-slate-800 dark:text-slate-200">
      <ErpAdminPageHero eyebrow="Feed" title="Recent Activity" accent="violet" />

      <div className="flex flex-col gap-3 rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white via-white to-cyan-50/20 p-3 shadow-[0_12px_40px_-24px_rgba(16,61,77,0.18)] ring-1 ring-cyan-900/[0.05] dark:border-teal-900/45 dark:bg-gradient-to-br dark:from-[#0c1822] dark:via-[#0a141c] dark:to-[#061018] dark:shadow-black/40 dark:ring-teal-900/35 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:p-4">
        <div className={`min-w-0 w-full sm:flex-1 ${ERP_SEARCH_ICON_WRAP_CLASS} sm:max-w-md`}>
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-[#103D4D]/50 dark:text-teal-400/50" />
          <label className="block w-full">
            <span className="sr-only">Search notifications</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or message…"
              className={ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS}
              autoComplete="off"
            />
          </label>
        </div>
        <div
          className="inline-flex w-fit max-w-full shrink-0 self-center rounded-2xl border border-slate-800/25 bg-slate-900 p-1 shadow-inner sm:self-center"
          role="tablist"
          aria-label="Recent Activity filter"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => setFilter('unread')}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
              filter === 'unread'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-teal-900/35'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Unread
            {(search.trim() ? unreadInSearch : unreadCount) > 0 ? (
              <span
                className={`ml-1.5 tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  filter === 'unread' ? 'bg-white/20 text-white' : 'bg-amber-500/95 text-amber-950'
                }`}
              >
                {search.trim() ? unreadInSearch : unreadCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
              filter === 'all'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/35'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
        </div>
        <button
          type="button"
          disabled={marking || (search.trim() ? unreadInSearch === 0 : unreadCount === 0)}
          onClick={() => void markAllRead()}
          className="h-11 w-fit max-w-full shrink-0 self-center rounded-2xl erp-brand-fill px-5 text-xs font-bold text-white shadow-lg shadow-[#103D4D]/25 transition disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:min-h-[42px] sm:self-center"
        >
          Mark all read
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 rounded-full border-[3px] border-cyan-200/50 border-t-[#103D4D] border-r-violet-500 animate-spin shadow-md" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-violet-200/60 bg-gradient-to-br from-slate-50 via-white to-violet-50/40 py-16 text-center shadow-inner dark:border-violet-900/45 dark:from-[#0f1420] dark:via-[#0a0e18] dark:to-violet-950/30">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {search.trim()
              ? 'Nothing matches your search.'
              : filter === 'unread'
                ? 'No unread notifications.'
                : 'No activity yet.'}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Try switching to All or clearing the search box.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {grouped.map((entry) =>
            entry.type === 'header' ? (
              <li key={entry.key} className="col-span-full pt-2 first:pt-0">
                <div className="flex items-center gap-2 px-1">
                  <span
                    className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-teal-800/50"
                    aria-hidden
                  />
                  <span className="flex items-center gap-2 rounded-full bg-slate-100/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 ring-1 ring-slate-200/80 dark:bg-[#121f28]/90 dark:text-teal-200/90 dark:ring-teal-800/45">
                    <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[#103D4D] to-violet-600" aria-hidden />
                    {entry.label}
                  </span>
                  <span
                    className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-teal-800/50"
                    aria-hidden
                  />
                </div>
              </li>
            ) : (
              <li key={entry.key} className="min-w-0">
                {(() => {
                  const row = entry.row;
                  const kind = classifyFeedItem(row);
                  const { Icon, chip, iconShell } = kindMeta(kind);
                  const href = row.link || '/erp/dashboard';
                  const unread = row.kind === 'notification' && !row.read;
                  const leave = row.kind === 'notification' && isLeaveWorkspaceNotification(row);
                  return (
                    <div
                      className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                        unread
                          ? 'border-cyan-300/45 bg-gradient-to-br from-white via-cyan-50/40 to-violet-50/30 shadow-md ring-1 ring-cyan-400/15 dark:border-teal-700/45 dark:bg-gradient-to-br dark:from-[#121f28] dark:via-[#101a28] dark:to-[#0a1620] dark:ring-teal-600/25'
                          : 'border-slate-200/85 bg-white/95 shadow-sm hover:border-slate-300/90 hover:shadow-md dark:border-teal-800/45 dark:bg-[#101a22]/95 dark:hover:border-teal-700/55 dark:shadow-black/25'
                      }`}
                    >
                      <div className="flex min-w-0 items-stretch">
                        {leave ? (
                          <button
                            type="button"
                            aria-label={`Open: ${row.title || 'notification'}`}
                            className="group flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-4 text-left sm:gap-4"
                            onClick={() => void openLeaveFromNotificationRow(row)}
                          >
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconShell}`}
                              aria-hidden
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80 dark:bg-[#141c24] dark:text-teal-200/85 dark:ring-teal-800/50">
                                  {chip}
                                </span>
                                {unread ? (
                                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-900 ring-1 ring-cyan-400/40 dark:bg-teal-900/50 dark:text-teal-100 dark:ring-teal-600/40">
                                    New
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100 sm:text-base">
                                {row.title}
                              </p>
                              {row.body ? (
                                <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{row.body}</p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#103D4D] transition group-hover:gap-1.5 dark:text-teal-300">
                                  View details
                                  <IconChevron className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                                <time
                                  dateTime={row.created_at}
                                  className="rounded-full bg-slate-100/90 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80 dark:bg-[#141c24] dark:text-slate-400 dark:ring-teal-800/45"
                                >
                                  {formatShortDate(row.created_at)}
                                </time>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <Link
                            href={href}
                            aria-label={`Open: ${row.title || 'notification'}`}
                            className="group flex min-w-0 flex-1 items-start gap-3 p-4 sm:gap-4"
                            onClick={() => {
                              if (unread) void markRead(row.notificationId);
                            }}
                          >
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconShell}`}
                              aria-hidden
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80 dark:bg-[#141c24] dark:text-teal-200/85 dark:ring-teal-800/50">
                                  {chip}
                                </span>
                                {unread ? (
                                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-900 ring-1 ring-cyan-400/40 dark:bg-teal-900/50 dark:text-teal-100 dark:ring-teal-600/40">
                                    New
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100 sm:text-base">
                                {row.title}
                              </p>
                              {row.body ? (
                                <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{row.body}</p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#103D4D] transition group-hover:gap-1.5 dark:text-teal-300">
                                  Open
                                  <IconChevron className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                                <time
                                  dateTime={row.created_at}
                                  className="rounded-full bg-slate-100/90 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80 dark:bg-[#141c24] dark:text-slate-400 dark:ring-teal-800/45"
                                >
                                  {formatShortDate(row.created_at)}
                                </time>
                              </div>
                            </div>
                          </Link>
                        )}
                        {unread ? (
                          <div className="flex shrink-0 flex-col justify-center border-l border-slate-200/80 bg-slate-50/60 dark:border-teal-900/40 dark:bg-[#0f1822]/90">
                            <button
                              type="button"
                              disabled={marking}
                              onClick={() => void markRead(row.notificationId)}
                              className="px-3 py-4 text-[10px] font-bold uppercase tracking-wide text-slate-600 transition hover:bg-white hover:text-[#103D4D] dark:text-slate-400 dark:hover:bg-teal-950/80 dark:hover:text-teal-200 sm:px-4"
                            >
                              Mark
                              <br className="hidden sm:block" />
                              read
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
              </li>
            ),
          )}
        </ul>
      )}

      {!loading && filtered.length > PAGE_SIZE ? (
        <InboxPagination
          page={page}
          totalPages={totalPages}
          pageStart={pageStart}
          pageEnd={Math.min(pageEnd, filtered.length)}
          total={filtered.length}
          onChange={(p) => {
            setPage(p);
            if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        />
      ) : null}
    </div>
      {leaveModalEl}
    </>
  );
}

function getPageNumbers(page, totalPages) {
  const pages = new Set();
  pages.add(1);
  pages.add(totalPages);
  for (let p = page - 1; p <= page + 1; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('ellipsis');
    out.push(sorted[i]);
  }
  return out;
}

function InboxPagination({ page, totalPages, pageStart, pageEnd, total, onChange }) {
  const pages = getPageNumbers(page, totalPages);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;
  const btnBase =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-xl border px-3 text-xs font-bold transition';
  const neutral =
    'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#103D4D]/35 hover:bg-slate-50 dark:border-teal-800/50 dark:bg-[#141c24] dark:text-slate-200 dark:hover:border-teal-600/45 dark:hover:bg-[#182630]';
  const disabled = 'cursor-not-allowed opacity-40';
  return (
    <nav
      className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-teal-800/45 dark:bg-[#101a22]/95 dark:ring-teal-900/25 sm:flex-row sm:items-center sm:justify-between sm:px-4"
      aria-label="Recent Activity pagination"
    >
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Showing <span className="text-slate-800 tabular-nums dark:text-slate-200">{pageStart + 1}</span>–
        <span className="text-slate-800 tabular-nums dark:text-slate-200">{pageEnd}</span> of{' '}
        <span className="text-slate-800 tabular-nums dark:text-slate-200">{total}</span>
      </p>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={atStart}
          className={`${btnBase} ${atStart ? `${neutral} ${disabled}` : neutral}`}
          aria-label="Previous page"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
          <span className="ml-1 hidden sm:inline">Prev</span>
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span
              key={`e-${i}`}
              className="inline-flex h-9 items-center justify-center px-1 text-xs font-bold text-slate-400"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`${btnBase} ${
                p === page
                  ? 'border-[#103D4D] erp-brand-fill text-white shadow-md shadow-[#103D4D]/20'
                  : neutral
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={atEnd}
          className={`${btnBase} ${atEnd ? `${neutral} ${disabled}` : neutral}`}
          aria-label="Next page"
        >
          <span className="mr-1 hidden sm:inline">Next</span>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
