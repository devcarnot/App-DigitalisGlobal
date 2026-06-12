'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { erpGreetingForDate } from '../../lib/erp-greeting';
import { isErpClientSideRole, isErpWorkspaceRosterEditor } from '../../lib/erp-roles';
import { taskDueStatus, formatTaskDueDate, taskDueColorClasses } from '../../lib/task-dates';
import { useErpSession } from './useErpSession';
import ErpUserAvatar from './ErpUserAvatar';
import ErpColorSchemeToggle from './ErpColorSchemeToggle';
import ErpGlobalSearch from './ErpGlobalSearch';
import ErpNotificationsPopover from './ErpNotificationsPopover';
import { useErpShellNotifications } from './ErpShellNotificationsContext';
import ErpDashboardMobileCheckIn from './ErpDashboardMobileCheckIn';
import ErpUserMenuPopover from './ErpUserMenuPopover';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STAT_TONES = {
  violet: {
    glow: 'bg-violet-400',
    card: 'border-violet-100/80 from-violet-50/80 via-white to-white dark:border-violet-900/35 dark:from-violet-950/30 dark:via-[#0c121a] dark:to-[#0c121a]',
    icon: 'bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-500/30',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-500/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-500/25',
  },
  emerald: {
    glow: 'bg-emerald-400',
    card: 'border-emerald-100/80 from-emerald-50/70 via-white to-white dark:border-emerald-900/35 dark:from-emerald-950/25 dark:via-[#0c121a] dark:to-[#0c121a]',
    icon: 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-500/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-500/25',
  },
  amber: {
    glow: 'bg-amber-400',
    card: 'border-amber-100/80 from-amber-50/70 via-white to-white dark:border-amber-900/35 dark:from-amber-950/25 dark:via-[#0c121a] dark:to-[#0c121a]',
    icon: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25',
    badge: 'bg-rose-50 text-rose-700 ring-rose-500/15 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-500/25',
  },
  gold: {
    glow: 'bg-amber-300',
    card: 'border-amber-100/80 from-yellow-50/60 via-white to-white dark:border-amber-900/30 dark:from-amber-950/20 dark:via-[#0c121a] dark:to-[#0c121a]',
    icon: 'bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-400/25',
    badge: 'bg-slate-100 text-slate-600 ring-slate-300/30 dark:bg-slate-800 dark:text-slate-300',
  },
};

function StatCard({ icon, tone = 'violet', value, label, badge, href, onClick }) {
  const t = STAT_TONES[tone] || STAT_TONES.violet;
  const inner = (
    <>
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${t.glow} opacity-[0.18] blur-2xl dark:opacity-[0.12]`}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-[0.85rem] text-[1.05rem] text-white ${t.icon}`}
        >
          {icon}
        </span>
        {badge ? (
          <span className={`max-w-[5.5rem] truncate rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${t.badge}`}>
            {badge}
          </span>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden />
        )}
      </div>
      <p className="relative mt-4 truncate text-[1.75rem] font-bold leading-none tabular-nums tracking-tight text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="relative mt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
    </>
  );
  const cls = `relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] border bg-gradient-to-br p-4 shadow-[0_10px_32px_-14px_rgba(16,61,77,0.14)] ring-1 ring-slate-900/[0.04] transition dark:shadow-black/30 dark:ring-white/[0.06] ${t.card}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} text-left active:scale-[0.98]`}>
        {inner}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={`${cls} active:scale-[0.98]`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function QuickActionTile({ href, onClick, icon, iconBg, label }) {
  const cls =
    'flex flex-col items-center justify-center gap-2.5 rounded-[1.15rem] border border-slate-200/70 bg-white px-2 py-4 shadow-[0_6px_20px_-10px_rgba(16,61,77,0.12)] ring-1 ring-slate-900/[0.03] transition active:scale-[0.97] dark:border-teal-900/40 dark:bg-[#0c121a] dark:ring-white/[0.05]';
  const body = (
    <>
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-[0.95rem] text-lg shadow-sm ${iconBg}`}
      >
        {icon}
      </span>
      <span className="text-center text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

function focusBadge(task) {
  const due = task.due_date;
  if (!due) return { text: 'No due date', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  const st = taskDueStatus(due);
  if (st === 'past') return { text: 'Overdue', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' };
  if (st === 'today') {
    const t = new Date();
    return {
      text: t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    };
  }
  const c = taskDueColorClasses(st);
  return { text: formatTaskDueDate(due), className: `bg-slate-100 ${c.value} dark:bg-slate-800` };
}

function focusDot(task) {
  const p = String(task.priority || '').toLowerCase();
  if (p === 'urgent' || p === 'high') return 'bg-rose-500';
  if (p === 'medium') return 'bg-amber-400';
  return 'bg-slate-300 dark:bg-slate-600';
}

function MobileDirectorySection({ title, subtitle, viewHref, viewLabel = 'See all', loading, emptyLabel, emptyHref, emptyCta, children }) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-sm dark:border-teal-900/45 dark:bg-[#0c121a]">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-teal-900/40">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        <Link href={viewHref} className="shrink-0 text-[12px] font-bold text-violet-600 dark:text-violet-300">
          {viewLabel}
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : children ? (
        children
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{emptyLabel}</p>
          {emptyHref && emptyCta ? (
            <Link
              href={emptyHref}
              className="mt-2 inline-flex text-[12px] font-bold text-violet-600 dark:text-violet-300"
            >
              {emptyCta} →
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function MobilePeopleRow({ people, messageHrefFor }) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {people.map((p) => {
        const href = messageHrefFor(p.id);
        return (
          <Link
            key={p.id}
            href={href}
            className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 active:opacity-80"
          >
            <ErpUserAvatar profile={p} email={p.email} size="lg" alt="" />
            <span className="w-full truncate text-center text-[10px] font-semibold text-slate-700 dark:text-slate-200">
              {(p.full_name || p.name || 'Member').split(/\s+/)[0]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default function ErpDashboardMobile({
  firstName,
  profile,
  email,
  dashLoading,
  dash,
  dashVis,
  showManagerDashboard,
  showRevenue,
  revenueLabel,
  hoursWeekBadge,
  remoteYtd,
  canRemote,
  canAttendance,
  onInvite,
  onOverdueClick,
  onAttendanceUpdated,
  assigneeProfiles = {},
  utilizationActiveMembers = null,
  utilizationAssignedMembers = null,
}) {
  const { erpCan, session } = useErpSession();
  const router = useRouter();
  const pathname = usePathname();
  const viewerId = session?.user?.id;
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    try {
      await erpAuthorizedFetch('/api/erp/session-end', { method: 'POST', body: '{}' });
    } catch {
      /* still sign out locally */
    }
    await supabase.auth.signOut();
    router.replace('/erp/login');
  }, [router]);
  const todayStr = localYmd();
  const [greeting, setGreeting] = useState(() => erpGreetingForDate());

  useEffect(() => {
    const refresh = () => setGreeting(erpGreetingForDate());
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const metaLine = useMemo(() => {
    const d = new Date();
    const datePart = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const parts = [datePart];
    if (canRemote) parts.push('Remote');
    if (dashVis.kpiActiveProjects) parts.push(`${dash.activeProjects} active projects`);
    return parts.join(' · ');
  }, [canRemote, remoteYtd, dash.activeProjects, dashVis.kpiActiveProjects]);

  const tasksDueToday = useMemo(() => {
    const countDeadlines = (dash.deadlines || []).filter((t) => t.due_date === todayStr).length;
    const countMine = (dash.myTasks || []).filter((t) => t.due_date === todayStr).length;
    return Math.max(countDeadlines, countMine);
  }, [dash.deadlines, dash.myTasks, todayStr]);

  const focusItems = useMemo(() => {
    const today = todayStr;
    const overdue = (dash.myTasks || []).filter((t) => t.due_date && taskDueStatus(t.due_date) === 'past');
    const dueToday = (dash.myTasks || []).filter((t) => t.due_date === today);
    const upcoming = (dash.deadlines || []).slice(0, 4);
    const merged = [...overdue, ...dueToday, ...upcoming];
    const seen = new Set();
    return merged.filter((t) => {
      if (!t?.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    }).slice(0, 5);
  }, [dash.myTasks, dash.deadlines, todayStr]);

  const hoursWeekDisplay = useMemo(() => {
    const sec = dash.hoursThisWeekSeconds || 0;
    const h = sec / 3600;
    return h >= 10 ? h.toFixed(1) : h > 0 ? h.toFixed(1) : '0';
  }, [dash.hoursThisWeekSeconds]);

  const showCheckIn = canAttendance && !isErpClientSideRole(profile?.role);
  const shellNotifs = useErpShellNotifications();
  const showFinance = showRevenue && erpCan('finance', 'view');
  const canViewClients = erpCan('clients', 'view');
  const canViewMembers = isErpWorkspaceRosterEditor(profile?.role);
  const membersCacheKey = viewerId ? 'dash:member-preview' : null;
  const clientsCacheKey = 'dash:client-preview';
  const [membersLoading, setMembersLoading] = useState(() => erpCacheInitialLoading(membersCacheKey));
  const [memberPreview, setMemberPreview] = useState(() =>
    pickErpCache(membersCacheKey, (c) => c.rows ?? [], []),
  );
  const [clientsLoading, setClientsLoading] = useState(() => erpCacheInitialLoading(clientsCacheKey));
  const [clientPreview, setClientPreview] = useState(() =>
    pickErpCache(clientsCacheKey, (c) => c.rows ?? [], []),
  );

  useEffect(() => {
    if (!canViewMembers || !viewerId) {
      setMemberPreview([]);
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    beginErpCachedLoad(membersCacheKey, (cached) => {
      setMemberPreview(Array.isArray(cached?.rows) ? cached.rows : []);
    }, setMembersLoading);
    (async () => {
      try {
        const { data } = await supabase
          .from('erp_profiles')
          .select('id, full_name, avatar_path, role')
          .order('full_name', { ascending: true })
          .limit(24);
        if (cancelled) return;
        const rows = (data || [])
          .filter((p) => p.id && p.id !== viewerId && !isErpClientSideRole(p.role))
          .slice(0, 12);
        writeErpDataCache(membersCacheKey, { rows });
        setMemberPreview(rows);
      } catch {
        if (!cancelled && !hasErpDataCache(membersCacheKey)) setMemberPreview([]);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewMembers, viewerId, membersCacheKey]);

  useEffect(() => {
    if (!canViewClients) {
      setClientPreview([]);
      setClientsLoading(false);
      return;
    }
    let cancelled = false;
    beginErpCachedLoad(clientsCacheKey, (cached) => {
      setClientPreview(Array.isArray(cached?.rows) ? cached.rows : []);
    }, setClientsLoading);
    (async () => {
      try {
        const res = await erpAuthorizedFetch('/api/erp/me/clients-directory?audience=client');
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          if (!hasErpDataCache(clientsCacheKey)) setClientPreview([]);
          return;
        }
        const rows = (json.rows || json.clients || []).slice(0, 6).map((r) => ({
          id: r.userId || r.id,
          name: r.name || r.full_name || 'Client',
          email: r.email || null,
          projects: r.projects || [],
        }));
        writeErpDataCache(clientsCacheKey, { rows });
        setClientPreview(rows);
      } catch {
        if (!cancelled && !hasErpDataCache(clientsCacheKey)) setClientPreview([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewClients, clientsCacheKey]);

  const collaboratorPreview = useMemo(() => {
    if (canViewMembers) return [];
    const rows = Object.values(assigneeProfiles || {}).filter((p) => p?.id && p.id !== viewerId);
    return rows.slice(0, 8);
  }, [assigneeProfiles, canViewMembers, viewerId]);

  const membersSubtitle = useMemo(() => {
    if (utilizationActiveMembers != null && utilizationActiveMembers > 0) {
      return `${utilizationAssignedMembers ?? 0} / ${utilizationActiveMembers} with active tasks`;
    }
    if (canViewMembers && memberPreview.length > 0) {
      return 'Tap someone to message';
    }
    if (collaboratorPreview.length > 0) {
      return 'People on your projects';
    }
    return 'Your workspace team';
  }, [
    utilizationActiveMembers,
    utilizationAssignedMembers,
    canViewMembers,
    memberPreview.length,
    collaboratorPreview.length,
  ]);

  const peopleToShow = canViewMembers ? memberPreview : collaboratorPreview;
  const showMembersSection = canViewMembers || collaboratorPreview.length > 0 || !isErpClientSideRole(profile?.role);
  const showClientsSection = canViewClients;

  const statCards = useMemo(() => {
    const cards = [];
    if (dashVis.kpiActiveProjects) {
      cards.push({
        key: 'projects',
        icon: '📁',
        tone: 'violet',
        value: String(dash.activeProjects),
        label: 'Active projects',
        href: '/erp/projects',
      });
    }
    if (dashVis.kpiHours) {
      cards.push({
        key: 'hours',
        icon: '⏱️',
        tone: 'emerald',
        value: hoursWeekDisplay,
        label: 'Hours this week',
        badge: hoursWeekBadge,
      });
    }
    if (dashVis.kpiOverdue) {
      const dueToday = tasksDueToday > 0;
      cards.push({
        key: 'tasks',
        icon: '☑️',
        tone: 'amber',
        value: String(dueToday ? tasksDueToday : dash.overdueTasks),
        label: dueToday ? 'Tasks due today' : 'Overdue tasks',
        onClick: onOverdueClick,
      });
    }
    if (showFinance) {
      cards.push({
        key: 'revenue',
        icon: '💰',
        tone: 'gold',
        value: revenueLabel || '—',
        label: 'Total revenue (AUD)',
        href: '/erp/admin/finance',
      });
    }
    return cards;
  }, [
    dashVis,
    dash.activeProjects,
    dash.overdueTasks,
    hoursWeekDisplay,
    hoursWeekBadge,
    tasksDueToday,
    showFinance,
    revenueLabel,
    onOverdueClick,
  ]);

  return (
    <div className="erp-dashboard-mobile -mx-3 min-h-full bg-slate-100/95 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:bg-[#06090d] sm:-mx-4 lg:hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-[#090e14]">
        <ErpUserMenuPopover
          profile={profile}
          email={email}
          open={userMenuOpen}
          onOpenChange={(v) => {
            setUserMenuOpen(v);
            if (v) shellNotifs?.setNotifOpen(false);
          }}
          onSignOut={handleSignOut}
          layout="mobileHeader"
          accountActive={pathname === '/erp/account' || pathname?.startsWith('/erp/account/')}
        />
        <div className="flex shrink-0 items-center gap-1">
          <div className="[&_button]:h-9 [&_button]:w-9 [&_button]:rounded-full [&_button]:border [&_button]:border-slate-200/90">
            <ErpGlobalSearch />
          </div>
          <ErpColorSchemeToggle className="!h-9 !w-9 !rounded-full !border !border-slate-200/90 !bg-white dark:!border-teal-800/50 dark:!bg-[#0f1a24]" />
          {shellNotifs ? (
            <ErpNotificationsPopover
              variant="compact"
              mobileSheetHost="shell"
              notifications={shellNotifs.notifications}
              unreadCount={shellNotifs.unreadCount}
              open={shellNotifs.notifOpen}
              onOpenChange={(v) => {
                shellNotifs.setNotifOpen(v);
                if (v) setUserMenuOpen(false);
              }}
              onLeaveNotificationClick={shellNotifs.onLeaveNotificationClick}
              onNavigate={shellNotifs.onNavigate}
            />
          ) : null}
        </div>
      </header>

      <div className="space-y-4 px-4 pt-4">
        {/* Greeting card */}
        <section className="overflow-hidden rounded-[1.35rem] border border-violet-200/50 bg-gradient-to-br from-violet-50/90 via-white to-cyan-50/80 p-4 shadow-sm dark:border-teal-900/40 dark:from-[#12182a] dark:via-[#0c121a] dark:to-[#0a1418]">
          <h1 className="text-xl font-bold tracking-tight text-[#103D4D] dark:text-white">
            {greeting}, {firstName}{' '}
            <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-[12px] font-medium text-slate-600 dark:text-slate-400">{metaLine}</p>
          {showCheckIn ? <ErpDashboardMobileCheckIn onTimesUpdated={onAttendanceUpdated} /> : null}
        </section>

        {/* Stats — 2 columns, no horizontal scroll */}
        {dashLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
          </div>
        ) : statCards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {statCards.map((card) => (
              <StatCard
                key={card.key}
                icon={card.icon}
                tone={card.tone}
                value={card.value}
                label={card.label}
                badge={card.badge}
                href={card.href}
                onClick={card.onClick}
              />
            ))}
          </div>
        ) : null}

        {/* Quick actions */}
        {showManagerDashboard ? (
          <div className="grid grid-cols-4 gap-2">
            <QuickActionTile href="/erp/projects" icon="⏱️" iconBg="bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200" label="Start timer" />
            <QuickActionTile href="/erp/admin/clients" icon="👤" iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200" label="New client" />
            <QuickActionTile onClick={onInvite} icon="👥" iconBg="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200" label="Invite" />
            {showFinance ? (
              <QuickActionTile href="/erp/admin/invoices/new" icon="💵" iconBg="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200" label="New invoice" />
            ) : (
              <QuickActionTile href="/erp/my-tasks" icon="📋" iconBg="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200" label="My tasks" />
            )}
          </div>
        ) : null}

        {/* Today's focus */}
        {dashVis.myTasks || dashVis.deadlines ? (
          <section className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-sm dark:border-teal-900/45 dark:bg-[#0c121a]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-teal-900/40">
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Today&apos;s focus</h2>
              <Link href="/erp/my-tasks" className="text-[12px] font-bold text-violet-600 dark:text-violet-300">
                See all
              </Link>
            </div>
            {focusItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] font-medium text-slate-500 dark:text-slate-400">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-teal-900/35">
                {focusItems.map((t) => {
                  const badge = focusBadge(t);
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/erp/projects/${t.project_id}`}
                        className="flex items-start gap-3 px-4 py-3.5 active:bg-slate-50 dark:active:bg-white/5"
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${focusDot(t)}`} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-slate-900 dark:text-white">{t.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {t.projectName || 'Project'}
                            {t.due_date && taskDueStatus(t.due_date) === 'past' ? ' · Needs attention' : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${badge.className}`}>
                          {badge.text}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {/* Team + clients — fills lower dashboard on mobile */}
        {!showManagerDashboard && (showMembersSection || showClientsSection) ? (
          <div className="grid grid-cols-2 gap-2">
            {showMembersSection ? (
              <Link
                href="/erp/admin/members"
                className="flex flex-col rounded-[1.15rem] border border-slate-200/80 bg-white px-3 py-3.5 shadow-sm active:scale-[0.98] dark:border-teal-900/45 dark:bg-[#0c121a]"
              >
                <span className="text-lg" aria-hidden>
                  👥
                </span>
                <span className="mt-2 text-[13px] font-bold text-slate-900 dark:text-white">Team</span>
                <span className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Members</span>
              </Link>
            ) : null}
            {showClientsSection ? (
              <Link
                href="/erp/admin/clients"
                className="flex flex-col rounded-[1.15rem] border border-slate-200/80 bg-white px-3 py-3.5 shadow-sm active:scale-[0.98] dark:border-teal-900/45 dark:bg-[#0c121a]"
              >
                <span className="text-lg" aria-hidden>
                  👤
                </span>
                <span className="mt-2 text-[13px] font-bold text-slate-900 dark:text-white">Clients</span>
                <span className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Directory</span>
              </Link>
            ) : showMembersSection ? (
              <Link
                href="/erp/messages"
                className="flex flex-col rounded-[1.15rem] border border-slate-200/80 bg-white px-3 py-3.5 shadow-sm active:scale-[0.98] dark:border-teal-900/45 dark:bg-[#0c121a]"
              >
                <span className="text-lg" aria-hidden>
                  💬
                </span>
                <span className="mt-2 text-[13px] font-bold text-slate-900 dark:text-white">Messages</span>
                <span className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Chat</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        {showMembersSection ? (
          <MobileDirectorySection
            title="Team members"
            subtitle={membersSubtitle}
            viewHref="/erp/admin/members"
            loading={canViewMembers && membersLoading}
            emptyLabel="No team members yet."
            emptyHref="/erp/admin/invites"
            emptyCta="Invite someone"
          >
            {peopleToShow.length > 0 ? (
              <MobilePeopleRow
                people={peopleToShow}
                messageHrefFor={(id) => `/erp/messages?with=${encodeURIComponent(id)}`}
              />
            ) : null}
          </MobileDirectorySection>
        ) : null}

        {showClientsSection ? (
          <MobileDirectorySection
            title="Clients"
            subtitle={clientPreview.length > 0 ? 'Recent workspace clients' : 'Client accounts in your workspace'}
            viewHref="/erp/admin/clients"
            loading={clientsLoading}
            emptyLabel="No clients yet."
            emptyHref="/erp/admin/clients"
            emptyCta="Add a client"
          >
            {clientPreview.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-teal-900/35">
                {clientPreview.map((c) => (
                  <li key={c.id}>
                    <Link
                      href="/erp/admin/clients"
                      className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-white/5"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                        {(c.name || 'C').slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white">{c.name}</p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {c.projects?.length
                            ? `${c.projects.length} project${c.projects.length === 1 ? '' : 's'}`
                            : c.email || 'Client account'}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </MobileDirectorySection>
        ) : null}

        {canAttendance ? (
          <p className="pb-2 text-center">
            <Link
              href="/erp/attendance"
              className="text-[11px] font-bold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 dark:text-teal-300"
            >
              Full attendance & history →
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
