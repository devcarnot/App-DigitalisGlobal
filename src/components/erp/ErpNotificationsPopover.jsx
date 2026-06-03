'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ErpBodyPortal from './ErpBodyPortal';
import { isLeaveWorkspaceNotification } from '../../lib/erp-notification-leave';
import { resolveErpNotificationNavigationHref } from '../../lib/erp-notification-link';

const RECENT_ACTIVITY_HREF = '/erp/inbox';

function ViewAllRecentActivityButton({ className, onGoToHref, children = 'View all' }) {
  return (
    <button type="button" onClick={() => onGoToHref(RECENT_ACTIVITY_HREF)} className={className}>
      {children}
    </button>
  );
}

/** Shorten raw URLs in notification body so long links don’t blow up mobile layout. */
function formatNotificationBody(body) {
  if (!body || typeof body !== 'string') return '';
  return body.replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname === '/' ? '' : u.pathname;
      if (path.length > 18) return `${host}${path.slice(0, 16)}…`;
      return host + path;
    } catch {
      return 'Link';
    }
  });
}

function notificationTimeLabel(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function notificationKind(n) {
  const t = `${n?.title || ''} ${n?.body || ''} ${n?.link || ''}`.toLowerCase();
  if (t.includes('message') || (n?.link || '').includes('/messages')) return 'message';
  if (t.includes('meeting') || t.includes('calendar')) return 'meeting';
  if (t.includes('leave') || t.includes('time off')) return 'leave';
  if (t.includes('project') || t.includes('task')) return 'task';
  return 'default';
}

function NotificationIcon({ kind, className = 'h-4 w-4' }) {
  const cls = className;
  if (kind === 'message') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    );
  }
  if (kind === 'meeting') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (kind === 'task') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V4a2 2 0 10-4 0v1.3A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0h6z" />
    </svg>
  );
}

const KIND_TONE = {
  message: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  meeting: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300',
  leave: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  task: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  default: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function NotificationRow({
  n,
  mobile,
  onGoToHref,
  onClose,
  onLeaveNotificationClick,
}) {
  const leave = typeof onLeaveNotificationClick === 'function' && isLeaveWorkspaceNotification(n);
  const href = resolveErpNotificationNavigationHref(n);
  const kind = notificationKind(n);
  const time = notificationTimeLabel(n.created_at);
  const body = formatNotificationBody(n.body);

  const rowInner = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${KIND_TONE[kind] || KIND_TONE.default}`}
      >
        <NotificationIcon kind={kind} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={`min-w-0 flex-1 ${mobile ? 'text-[13px]' : 'text-[11px]'} font-bold leading-snug line-clamp-2 ${
              n.read ? 'text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-white'
            }`}
          >
            {n.title}
          </span>
          {time ? (
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
              {time}
            </span>
          ) : null}
        </span>
        {body ? (
          <span
            className={`mt-0.5 block leading-snug text-slate-500 line-clamp-2 dark:text-slate-400 ${
              mobile ? 'text-[12px]' : 'text-[10px]'
            }`}
          >
            {body}
          </span>
        ) : null}
      </span>
      {!n.read ? (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500 ring-2 ring-white dark:ring-[#0a121a]" aria-hidden />
      ) : null}
    </>
  );

  const rowCls = `flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors active:scale-[0.99] ${
    n.read
      ? 'border-transparent bg-slate-50/80 hover:bg-slate-100/90 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
      : 'border-violet-100/80 bg-white shadow-sm shadow-violet-900/5 dark:border-violet-900/30 dark:bg-[#0f141c] dark:shadow-none'
  }`;

  if (leave) {
    return (
      <li className="min-w-0">
        <button
          type="button"
          onClick={() => {
            onClose();
            void onLeaveNotificationClick(n);
          }}
          className={rowCls}
          title={n.body || n.title}
        >
          {rowInner}
        </button>
      </li>
    );
  }

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onGoToHref(href)}
        className={rowCls}
        title={n.body || n.title}
      >
        {rowInner}
      </button>
    </li>
  );
}

function NotificationList({ notifications, mobile, onGoToHref, onClose, onLeaveNotificationClick }) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500">
          <NotificationIcon kind="default" className="h-7 w-7" />
        </span>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">You&apos;re all caught up</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">New updates will show up here.</p>
      </div>
    );
  }

  return (
    <ul className={mobile ? 'space-y-2 px-3' : 'space-y-2'}>
      {notifications.map((n) => (
        <NotificationRow
          key={n.id}
          n={n}
          mobile={mobile}
          onGoToHref={onGoToHref}
          onClose={onClose}
          onLeaveNotificationClick={onLeaveNotificationClick}
        />
      ))}
    </ul>
  );
}

/**
 * @param {'toolbar' | 'compact'} [variant] toolbar = shell header; compact = mobile bottom sheet
 */
export default function ErpNotificationsPopover({
  notifications = [],
  unreadCount = 0,
  open,
  onOpenChange,
  onNavigate,
  onLeaveNotificationClick,
  className = '',
  variant = 'toolbar',
}) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const isCompact = variant === 'compact';
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';
  const router = useRouter();

  const closePanel = useCallback(() => {
    onOpenChange(false);
    onNavigate?.();
  }, [onOpenChange, onNavigate]);

  /** Navigate from the popover root (stays mounted); portaled sheet children unmount on close. */
  const goToHref = useCallback(
    (href) => {
      const target = href || '/erp/dashboard';
      onOpenChange(false);
      onNavigate?.();
      if (typeof window === 'undefined') return;
      window.requestAnimationFrame(() => {
        try {
          router.push(target);
        } catch {
          window.location.assign(target);
        }
      });
    },
    [router, onOpenChange, onNavigate],
  );

  useEffect(() => {
    if (!open || !isCompact) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isCompact]);

  useEffect(() => {
    if (!open || isCompact) return;
    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, isCompact]);

  useEffect(() => {
    if (!open || !isCompact) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange, isCompact]);

  const triggerClass = isCompact
    ? 'relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 transition active:scale-95 dark:border-teal-800/50 dark:bg-[#0f1a24] dark:text-slate-300'
    : 'relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/90 text-[#103D4D] shadow-md shadow-cyan-900/10 transition-all hover:shadow-lg hover:border-cyan-300/90 hover:from-cyan-50 dark:border-slate-600 dark:from-slate-800 dark:to-slate-900/95 dark:text-cyan-100 dark:shadow-black/30 dark:hover:border-slate-500 dark:hover:from-slate-700';

  const iconClass = isCompact ? 'h-[18px] w-[18px]' : 'h-[22px] w-[22px]';

  const desktopPanel = open && !isCompact ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-[min(calc(100vw-1.5rem),22rem)] overflow-hidden rounded-2xl border border-cyan-200/60 bg-white/95 backdrop-blur-xl shadow-[0_24px_64px_-12px_rgba(16,61,77,0.22),0_0_0_1px_rgba(178,235,242,0.35)] dark:border-slate-600 dark:bg-slate-900/98 dark:shadow-black/40"
    >
      <div className="flex items-center justify-between gap-2 border-b border-cyan-100/80 bg-gradient-to-r from-[#103D4D]/[0.06] via-cyan-50/80 to-violet-50/50 px-3 py-2.5 dark:border-slate-700 dark:from-slate-800/90 dark:via-slate-900 dark:to-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#103D4D]/80 dark:text-cyan-200/90">
          Notifications
        </p>
        <ViewAllRecentActivityButton
          onGoToHref={goToHref}
          className="text-[11px] font-bold text-teal-700 hover:text-[#103D4D] hover:underline dark:text-teal-300"
        />
      </div>
      <div className="max-h-[min(360px,50vh)] overflow-y-auto p-2.5 [scrollbar-width:thin]">
        <NotificationList
          notifications={notifications}
          mobile={false}
          onGoToHref={goToHref}
          onClose={closePanel}
          onLeaveNotificationClick={onLeaveNotificationClick}
        />
      </div>
    </div>
  ) : null;

  const mobileSheet =
    isCompact && open ? (
      <div ref={panelRef} className="fixed inset-0 z-[330] lg:hidden" role="presentation">
        <button
          type="button"
          className="absolute inset-0 z-0 bg-[#103D4D]/55 motion-safe:animate-[erpFadeIn_180ms_ease-out]"
          onClick={() => onOpenChange(false)}
          aria-label="Close notifications"
        />
        <div
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="absolute inset-x-0 bottom-0 z-10 flex max-h-[min(78vh,32rem)] flex-col touch-manipulation"
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.22)] motion-safe:animate-[erpSlideUp_280ms_ease-out] dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50">
            <div className="flex shrink-0 items-center justify-center py-2" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-slate-300/90 dark:bg-white/20" />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 dark:border-white/10">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Notifications</h2>
                {unreadCount > 0 ? (
                  <p className="text-[12px] font-medium text-violet-600 dark:text-violet-300">
                    {unreadCount} unread
                  </p>
                ) : (
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">All caught up</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ViewAllRecentActivityButton
                  onGoToHref={goToHref}
                  className="rounded-full bg-violet-50 px-3 py-1.5 text-[12px] font-bold text-violet-700 active:scale-95 dark:bg-violet-950/50 dark:text-violet-300"
                />
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 [scrollbar-width:thin]">
              <NotificationList
                notifications={notifications}
                mobile
                onGoToHref={goToHref}
                onClose={closePanel}
                onLeaveNotificationClick={onLeaveNotificationClick}
              />
            </div>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className={`relative shrink-0 ${className}`} ref={triggerRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-label={label}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={iconClass} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V4a2 2 0 10-4 0v1.3A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0h6z"
          />
        </svg>
        {unreadCount > 0 ? (
          <span
            className={`absolute flex items-center justify-center rounded-full bg-red-500 font-bold leading-none text-white ${
              isCompact
                ? '-right-0.5 -top-0.5 h-4 min-w-4 px-0.5 text-[9px] ring-2 ring-white dark:ring-[#0f1a24]'
                : '-right-0.5 -top-0.5 h-[18px] min-w-[18px] px-1 text-[10px] shadow-sm ring-2 ring-white'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isCompact && open ? <ErpBodyPortal>{mobileSheet}</ErpBodyPortal> : desktopPanel}
    </div>
  );
}
