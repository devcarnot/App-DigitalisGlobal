'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { formatErpRelativeTime } from '../../lib/erp-presence';
import {
  classifyFeedItem,
  isErpCallSignalNotification,
  isErpIncomingCallNotification,
} from '../../lib/erp-activity-feed';

/** Personal feed on the dashboard: unread items from erp_notifications only,
 *  filtered down to things that actually need the user's attention
 *  (task assignments, comments/mentions, messages, invites, …). Each item can
 *  be dismissed individually or all at once to keep the dashboard tidy. */

function IconBell({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M18 8A6 6 0 106 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTask({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 11l2 2 4-4m3 9H6a2 2 0 01-2-2V6a2 2 0 012-2h6l4 4v10a2 2 0 01-2 2z" strokeLinejoin="round" />
    </svg>
  );
}
function IconMessage({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4v8z" strokeLinejoin="round" />
    </svg>
  );
}
function IconInvite({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </svg>
  );
}
function IconLeave({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Visual kind meta for notification chips. */
function kindMeta(kind) {
  switch (kind) {
    case 'task':
      return {
        Icon: IconTask,
        chip: 'Task',
        iconShell:
          'bg-gradient-to-br from-amber-100 to-orange-50 text-amber-950 ring-1 ring-amber-200/90 shadow-inner',
        dot: 'bg-amber-500',
      };
    case 'message':
      return {
        Icon: IconMessage,
        chip: 'Message',
        iconShell:
          'bg-gradient-to-br from-sky-100 to-violet-50 text-sky-900 ring-1 ring-sky-200/90 shadow-inner',
        dot: 'bg-sky-500',
      };
    case 'invite':
      return {
        Icon: IconInvite,
        chip: 'People',
        iconShell:
          'bg-gradient-to-br from-indigo-100 to-violet-50 text-indigo-900 ring-1 ring-indigo-200/90 shadow-inner',
        dot: 'bg-indigo-500',
      };
    case 'leave':
      return {
        Icon: IconLeave,
        chip: 'Leave',
        iconShell:
          'bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-800 ring-1 ring-emerald-200/90 shadow-inner',
        dot: 'bg-emerald-500',
      };
    default:
      return {
        Icon: IconBell,
        chip: 'Update',
        iconShell:
          'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 ring-1 ring-slate-200/90 shadow-inner',
        dot: 'bg-slate-500',
      };
  }
}

/** Ephemeral / noisy notification types we never want on the dashboard summary. */
function shouldHideFromDashboard(row) {
  if (!row) return true;
  if (isErpIncomingCallNotification(row)) return true;
  if (isErpCallSignalNotification(row)) return true;
  return false;
}

const VISIBLE_LIMIT = 8;

export default function ErpDashboardActivityFeed({ userId: userIdProp }) {
  const [userId, setUserId] = useState(userIdProp || null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const reloadTimerRef = useRef(null);

  useEffect(() => {
    if (userIdProp) {
      setUserId(userIdProp);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setUserId(data?.session?.user?.id || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userIdProp]);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('erp_notifications')
        .select('id, title, body, read, link, created_at')
        .eq('user_id', userId)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      setRows((data || []).filter((r) => !shouldHideFromDashboard(r)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Live updates: new inserts prepend, marking as read elsewhere reflects here. */
  useEffect(() => {
    if (!userId) return undefined;
    const ch = supabase
      .channel(`erp-dashboard-feed-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new;
          if (!row?.id || row.read) return;
          if (shouldHideFromDashboard(row)) return;
          setRows((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev].slice(0, 40);
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'erp_notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          if (row.read) {
            setRows((prev) => prev.filter((n) => n.id !== row.id));
          }
        },
      )
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const markOne = useCallback(
    async (id) => {
      if (!id || !userId) return;
      setRows((prev) => prev.filter((n) => n.id !== id));
      setMarking(true);
      try {
        await supabase
          .from('erp_notifications')
          .update({ read: true })
          .eq('id', id)
          .eq('user_id', userId);
      } finally {
        setMarking(false);
        try {
          window.dispatchEvent(new CustomEvent('erp-notifications-reload'));
        } catch {
          /* ignore */
        }
      }
    },
    [userId],
  );

  const markAll = useCallback(async () => {
    if (!userId || rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    setRows([]);
    setMarking(true);
    try {
      await supabase
        .from('erp_notifications')
        .update({ read: true })
        .in('id', ids)
        .eq('user_id', userId);
    } finally {
      setMarking(false);
      try {
        window.dispatchEvent(new CustomEvent('erp-notifications-reload'));
      } catch {
        /* ignore */
      }
    }
  }, [userId, rows]);

  const visible = useMemo(() => rows.slice(0, VISIBLE_LIMIT), [rows]);
  const hasMore = rows.length > VISIBLE_LIMIT;

  return (
    <section
      aria-labelledby="dash-activity-heading"
      className="overflow-hidden rounded-2xl border border-violet-200/50 bg-white/90 shadow-lg shadow-violet-900/10 ring-1 ring-violet-900/[0.05] dark:border-teal-800/50 dark:bg-gradient-to-br dark:from-[#0f1c26] dark:via-[#0a1722] dark:to-[#050b10] dark:shadow-black/40 dark:ring-teal-900/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100/80 bg-gradient-to-r from-violet-50/90 via-white to-slate-50/50 px-4 py-3 sm:px-5 dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2834] dark:via-[#0c1e28] dark:to-[#061018]">
        <div className="min-w-0">
          <h2 id="dash-activity-heading" className="text-sm font-bold text-slate-900 dark:text-white">
            Your updates
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-300">
            Tasks assigned to you, messages, and comments awaiting a look.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/80 px-2.5 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200/70 dark:bg-teal-950/70 dark:text-teal-200 dark:ring-teal-700/45">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600 dark:bg-teal-400" aria-hidden />
              {rows.length} unread
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={marking || rows.length === 0}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 shadow-sm transition hover:border-[#103D4D]/35 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-slate-900 dark:text-slate-200 dark:hover:border-teal-600/45 dark:hover:from-slate-800 dark:hover:to-teal-950/40"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="px-4 py-3 sm:px-5 sm:py-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-[11px] font-medium text-violet-800/60 dark:text-teal-200/85">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700 dark:border-teal-800 dark:border-t-teal-300" />
            Loading your updates…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-violet-200/60 bg-violet-50/30 py-8 text-center dark:border-teal-800/55 dark:bg-gradient-to-br dark:from-[#101f2a]/90 dark:to-[#080f14]/95">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-700 ring-1 ring-emerald-200/70"
              aria-hidden
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">You're all caught up</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              New task assignments, mentions, and messages will show up here.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {visible.map((r) => {
              const kind = classifyFeedItem({ title: r.title, body: r.body, link: r.link });
              const { Icon, chip, iconShell, dot } = kindMeta(kind);
              const href = r.link || '/erp/inbox';
              const rel = r.created_at ? formatErpRelativeTime(r.created_at) : '';
              return (
                <li key={r.id} className="min-w-0">
                  <div className="group flex min-w-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600/70 dark:bg-gradient-to-br dark:from-slate-800/90 dark:to-slate-950 dark:shadow-black/20 dark:hover:border-teal-700/50">
                    <Link
                      href={href}
                      onClick={() => void markOne(r.id)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 p-3"
                      aria-label={`Open: ${r.title || 'notification'}`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconShell}`} aria-hidden>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80">
                            {chip}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                          {rel ? (
                            <span className="text-[10px] font-medium text-slate-400">{rel}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                          {r.title || 'Notification'}
                        </p>
                        {r.body ? (
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-600 dark:text-slate-400">{r.body}</p>
                        ) : null}
                      </div>
                    </Link>
                    <button
                      type="button"
                      disabled={marking}
                      onClick={() => void markOne(r.id)}
                      title="Mark as read"
                      aria-label="Mark as read"
                      className="flex shrink-0 items-center justify-center border-l border-slate-200/80 bg-slate-50/70 px-2.5 text-slate-500 transition hover:bg-white hover:text-[#103D4D] disabled:opacity-40 sm:px-3 dark:border-slate-600/70 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-200"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore ? (
          <p className="mt-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
            +{rows.length - VISIBLE_LIMIT} more recent activities waiting
          </p>
        ) : null}

        <div className="mt-3 border-t border-slate-100 pt-3 text-center dark:border-teal-900/45">
          <Link
            href="/erp/inbox"
            className="text-[11px] font-bold text-[#103D4D] transition hover:text-teal-800 dark:text-teal-200 dark:hover:text-cyan-200"
          >
            Open recent activities →
          </Link>
        </div>
      </div>
    </section>
  );
}
