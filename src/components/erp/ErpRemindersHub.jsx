'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  listErpReminders,
  listErpReminderAssignablePeople,
  updateErpReminder,
} from '../../lib/erp-reminders-client';
import { formatErpFetchError } from '../../lib/supabase-errors';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import ErpAccessDeniedCard from './ErpAccessDeniedCard';
import ErpReminderModal from './ErpReminderModal';
import { ERP_DARK_PRIMARY_BUTTON } from '../../lib/erp-dark-surfaces';

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

export default function ErpRemindersHub() {
  const { erpCan, profile, session } = useErpSession();
  const userId = session?.user?.id || null;
  const canView = erpCan('reminders', 'view');
  const canCreate = erpCan('reminders', 'create');
  const canEdit = erpCan('reminders', 'edit');
  const isAdmin = isErpGlobalAdmin(profile?.role);

  const [tab, setTab] = useState('upcoming');
  const [reminders, setReminders] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [assignablePeople, setAssignablePeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notProvisioned, setNotProvisioned] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const data = await listErpReminders({ range: tab });
      setReminders(Array.isArray(data.reminders) ? data.reminders : []);
      setProfilesById(data.profilesById && typeof data.profilesById === 'object' ? data.profilesById : {});
      setNotProvisioned(Boolean(data.notProvisioned));
    } catch (e) {
      setError(formatErpFetchError(e?.message || 'Could not load reminders'));
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [canView, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin || !canCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listErpReminderAssignablePeople();
        if (!cancelled) setAssignablePeople(Array.isArray(data.people) ? data.people : []);
      } catch {
        if (!cancelled) setAssignablePeople([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, canCreate]);

  const sorted = useMemo(() => {
    const rows = [...reminders];
    if (tab === 'upcoming') {
      rows.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
    } else {
      rows.sort((a, b) => new Date(b.remind_at).getTime() - new Date(a.remind_at).getTime());
    }
    return rows;
  }, [reminders, tab]);

  const handleSaved = useCallback(
    (saved) => {
      if (!saved?.id) {
        void load();
        return;
      }
      setReminders((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        if (tab === 'upcoming') return [...prev, saved].sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));
        return prev;
      });
      void load();
    },
    [load, tab],
  );

  const handleDeleted = useCallback((id) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const markDone = useCallback(
    async (id) => {
      setBusyId(id);
      try {
        const data = await updateErpReminder(id, { completed: true });
        setReminders((prev) => prev.filter((r) => r.id !== id));
        if (tab === 'past' && data?.reminder) {
          setReminders((prev) => [data.reminder, ...prev]);
        }
      } catch (e) {
        setError(formatErpFetchError(e?.message || 'Could not update reminder'));
      } finally {
        setBusyId(null);
      }
    },
    [tab],
  );

  if (!canView) {
    return (
      <ErpAccessDeniedCard
        title="Reminders"
        message="Reminders access has been disabled for your role. Ask your workspace admin to enable it from Users & Roles."
      />
    );
  }

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
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
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
                        <span className={`ml-2 font-semibold ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-teal-700 dark:text-teal-300'}`}>
                          {relativeWhen(r.remind_at)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {forSomeoneElse && createdByMe ? (
                        <>For <strong className="text-slate-600 dark:text-slate-300">{assigneeName || 'team member'}</strong></>
                      ) : forSomeoneElse ? (
                        <>From <strong className="text-slate-600 dark:text-slate-300">{creatorName || 'someone'}</strong></>
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
    </div>
  );
}
