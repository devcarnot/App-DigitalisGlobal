'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  listErpReminders,
  listErpReminderAssignablePeople,
  updateErpReminder,
} from '../../lib/erp-reminders-client';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  invalidateErpDataCachePrefix,
  pickErpCache,
  readErpDataCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';
import { formatErpFetchError } from '../../lib/supabase-errors';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import ErpAccessDeniedCard from './ErpAccessDeniedCard';
import { ERP_DARK_PRIMARY_BUTTON } from '../../lib/erp-dark-surfaces';

const ErpReminderModal = dynamic(() => import('./ErpReminderModal'), { ssr: false });

const ASSIGNABLE_CACHE_KEY = 'reminders:assignable-people';

function remindersCacheKey(userId, tab) {
  return userId ? `reminders:${tab}:${userId}` : null;
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

function relativeWhen(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((t - Date.now()) / 60000);
  if (mins < 0) return 'Overdue';
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) return `in ${Math.round(mins / 60)} hr`;
  const days = Math.round(mins / (24 * 60));
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

const PRIMARY_BUTTON = [
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/60',
  'px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/20',
  'transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-50',
  'dark:border-teal-600/55',
  ERP_DARK_PRIMARY_BUTTON,
].join(' ');

const TAB_CLASS = (active) =>
  [
    'rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition',
    active
      ? 'bg-white text-[#103D4D] shadow-sm dark:bg-teal-900/70 dark:text-teal-100'
      : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-[#121f28]/80',
  ].join(' ');

function applyReminderCache(cached, apply) {
  const c = cached && typeof cached === 'object' ? cached : {};
  apply({
    reminders: Array.isArray(c.reminders) ? c.reminders : [],
    profilesById: c.profilesById && typeof c.profilesById === 'object' ? c.profilesById : {},
    notProvisioned: Boolean(c.notProvisioned),
  });
}

async function fetchAndCacheReminders(userId, range) {
  const key = remindersCacheKey(userId, range);
  if (!key) return;
  const data = await listErpReminders({ range });
  writeErpDataCache(key, {
    reminders: Array.isArray(data.reminders) ? data.reminders : [],
    profilesById: data.profilesById && typeof data.profilesById === 'object' ? data.profilesById : {},
    notProvisioned: Boolean(data.notProvisioned),
  });
}

export default function ErpRemindersHub() {
  const { erpCan, profile, session } = useErpSession();
  const userId = session?.user?.id || null;
  const canView = erpCan('reminders', 'view');
  const canCreate = erpCan('reminders', 'create');
  const canEdit = erpCan('reminders', 'edit');
  const isAdmin = isErpGlobalAdmin(profile?.role);

  const [tab, setTab] = useState('upcoming');
  const cacheKey = remindersCacheKey(userId, tab);

  const [reminders, setReminders] = useState(() =>
    pickErpCache(cacheKey, (c) => (Array.isArray(c?.reminders) ? c.reminders : []), []),
  );
  const [profilesById, setProfilesById] = useState(() =>
    pickErpCache(cacheKey, (c) => (c?.profilesById && typeof c.profilesById === 'object' ? c.profilesById : {}), {}),
  );
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(cacheKey));
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState('');
  const [notProvisioned, setNotProvisioned] = useState(() =>
    Boolean(pickErpCache(cacheKey, (c) => c?.notProvisioned, false)),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [assignablePeople, setAssignablePeople] = useState(() =>
    pickErpCache(ASSIGNABLE_CACHE_KEY, (c) => (Array.isArray(c?.people) ? c.people : []), []),
  );

  const hydrateFromCache = useCallback(
    (key) => {
      applyReminderCache(readErpDataCache(key), ({ reminders: rows, profilesById: profiles, notProvisioned: np }) => {
        setReminders(rows);
        setProfilesById(profiles);
        setNotProvisioned(np);
      });
    },
    [],
  );

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!canView || !userId || !cacheKey) return;
      if (!hasErpDataCache(cacheKey)) {
        setReminders([]);
        setProfilesById({});
        setLoading(true);
      } else {
        beginErpCachedLoad(
          cacheKey,
          (cached) => {
            applyReminderCache(cached, ({ reminders: rows, profilesById: profiles, notProvisioned: np }) => {
              setReminders(rows);
              setProfilesById(profiles);
              setNotProvisioned(np);
            });
          },
          setLoading,
        );
      }
      if (!silent) setRevalidating(hasErpDataCache(cacheKey));
      setError('');
      try {
        await fetchAndCacheReminders(userId, tab);
        hydrateFromCache(cacheKey);
      } catch (e) {
        setError(formatErpFetchError(e?.message || 'Could not load reminders'));
        if (!hasErpDataCache(cacheKey)) {
          setReminders([]);
          setProfilesById({});
        }
      } finally {
        setLoading(false);
        setRevalidating(false);
      }
    },
    [canView, cacheKey, hydrateFromCache, tab, userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canView || !userId) return;
    const otherTab = tab === 'upcoming' ? 'past' : 'upcoming';
    const otherKey = remindersCacheKey(userId, otherTab);
    if (otherKey && !hasErpDataCache(otherKey)) {
      void fetchAndCacheReminders(userId, otherTab).catch(() => {});
    }
  }, [canView, tab, userId]);

  useEffect(() => {
    if (!modalOpen || !isAdmin || !canCreate) return;
    if (hasErpDataCache(ASSIGNABLE_CACHE_KEY)) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listErpReminderAssignablePeople();
        const people = Array.isArray(data.people) ? data.people : [];
        writeErpDataCache(ASSIGNABLE_CACHE_KEY, { people });
        if (!cancelled) setAssignablePeople(people);
      } catch {
        if (!cancelled) setAssignablePeople([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, isAdmin, canCreate]);

  const sorted = useMemo(() => {
    const rows = [...reminders];
    if (tab === 'upcoming') {
      rows.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
    } else {
      rows.sort((a, b) => new Date(b.remind_at).getTime() - new Date(a.remind_at).getTime());
    }
    return rows;
  }, [reminders, tab]);

  const bumpRemindersCache = useCallback(() => {
    invalidateErpDataCachePrefix('reminders:');
    void load({ silent: true });
  }, [load]);

  const handleSaved = useCallback(() => {
    bumpRemindersCache();
  }, [bumpRemindersCache]);

  const handleDeleted = useCallback(
    (id) => {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      invalidateErpDataCachePrefix('reminders:');
    },
    [],
  );

  const markDone = useCallback(
    async (id) => {
      setBusyId(id);
      try {
        await updateErpReminder(id, { completed: true });
        setReminders((prev) => prev.filter((r) => r.id !== id));
        invalidateErpDataCachePrefix('reminders:');
      } catch (e) {
        setError(formatErpFetchError(e?.message || 'Could not update reminder'));
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  if (!canView) {
    return (
      <ErpAccessDeniedCard
        title="Reminders"
        message="Reminders access has been disabled for your role. Ask your workspace admin to enable it from Users & Roles."
      />
    );
  }

  const showSkeleton = loading && reminders.length === 0;

  return (
    <div className="w-full space-y-4">
      <header className="rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-800 px-4 py-4 text-white shadow-xl shadow-teal-900/25 ring-1 ring-slate-900/20 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Workspace</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Reminders</h1>
            <p className="mt-1 max-w-xl text-sm text-cyan-100/85">
              Schedule reminders for yourself
              {isAdmin ? ' or any team member' : ''}. You&apos;ll get a push notification and in-app alert when
              it&apos;s time.
            </p>
          </div>
          {canCreate ? (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + New reminder
            </button>
          ) : null}
        </div>
      </header>

      {notProvisioned ? (
        <p className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
          Reminders database table is not set up yet. Run the latest Supabase migration (
          <code className="text-xs">20260713130000_erp_reminders.sql</code>).
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2 dark:border-teal-900/45 dark:bg-[#0a1016]">
        <button type="button" className={TAB_CLASS(tab === 'upcoming')} onClick={() => setTab('upcoming')}>
          Upcoming
        </button>
        <button type="button" className={TAB_CLASS(tab === 'past')} onClick={() => setTab('past')}>
          Past
        </button>
        {revalidating ? (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Updating…
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {showSkeleton ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/50" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-center dark:border-teal-900/45 dark:bg-[#0a1016]">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {tab === 'upcoming' ? 'No upcoming reminders.' : 'No past reminders yet.'}
          </p>
          {canCreate && tab === 'upcoming' ? (
            <button
              type="button"
              className={`${PRIMARY_BUTTON} mt-4`}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              Create your first reminder
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const assigneeName = profilesById[r.assigned_to]?.full_name;
            const creatorName = profilesById[r.created_by]?.full_name;
            const forSomeoneElse = r.assigned_to !== userId;
            const createdByMe = r.created_by === userId;
            const isOverdue = tab === 'upcoming' && new Date(r.remind_at).getTime() < Date.now();

            return (
              <li
                key={r.id}
                className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-teal-900/45 dark:bg-[#0a1016] dark:shadow-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</p>
                    {r.body ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{r.body}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                      <time dateTime={r.remind_at}>{formatWhen(r.remind_at)}</time>
                      {tab === 'upcoming' ? (
                        <span
                          className={`ml-2 font-semibold ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-teal-700 dark:text-teal-300'}`}
                        >
                          {relativeWhen(r.remind_at)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {forSomeoneElse && createdByMe ? (
                        <>
                          For{' '}
                          <strong className="text-slate-600 dark:text-slate-300">
                            {assigneeName || 'team member'}
                          </strong>
                        </>
                      ) : forSomeoneElse ? (
                        <>
                          From{' '}
                          <strong className="text-slate-600 dark:text-slate-300">{creatorName || 'someone'}</strong>
                        </>
                      ) : (
                        <>Personal reminder</>
                      )}
                      {r.reminder_sent_at ? ' · Notified' : null}
                      {r.completed_at ? ' · Done' : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!r.completed_at ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void markDone(r.id)}
                        className="rounded-lg border border-emerald-200/80 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                      >
                        Done
                      </button>
                    ) : null}
                    {canEdit && (createdByMe || isAdmin) ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => {
                          setEditing(r);
                          setModalOpen(true);
                        }}
                        className="rounded-lg border border-slate-200/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-teal-800/50 dark:text-slate-200 dark:hover:bg-[#162029]"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-xs text-slate-500 dark:text-slate-500">
        Notifications appear in{' '}
        <Link href="/erp/inbox" className="font-semibold text-teal-700 underline dark:text-teal-300">
          Recent Activity
        </Link>
        .
      </p>

      {modalOpen ? (
        <ErpReminderModal
          open={modalOpen}
          reminder={editing}
          currentUserId={userId}
          profileRole={profile?.role}
          assignablePeople={assignablePeople}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </div>
  );
}
