'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ErpBodyPortal from './ErpBodyPortal';
import {
  ERP_MOBILE_SHEET_FAB_CLEARANCE_PX,
  ERP_MOBILE_SHEET_PEEK_BUFFER_PX,
  useErpMobileSnapSheet,
} from './useErpMobileSnapSheet';

import { NotificationList } from './ErpNotificationsPopover';

const RECENT_ACTIVITY_HREF = '/erp/inbox';
const DEFAULT_PEEK_NOTIFICATIONS = 2;

function ViewAllRecentActivityButton({ className, onGoToHref, children = 'View all' }) {
  return (
    <button type="button" onClick={() => onGoToHref(RECENT_ACTIVITY_HREF)} className={className}>
      {children}
    </button>
  );
}

function measureNotificationPeekHeight(scroll, peekCount = DEFAULT_PEEK_NOTIFICATIONS) {
  const items = scroll.querySelectorAll('li');
  let contentBottom = items.length ? 96 : 120;

  if (items.length) {
    const lastIdx = Math.min(items.length - 1, peekCount - 1);
    const lastItem = items[lastIdx];
    contentBottom = lastItem.offsetTop + lastItem.offsetHeight;
  }

  const style = getComputedStyle(scroll);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);

  return contentBottom + padY + ERP_MOBILE_SHEET_PEEK_BUFFER_PX;
}

/** @typedef {import('./ErpNotificationsPopover').NotificationList} NotificationList */

/**
 * Single mobile bottom-sheet host (render once from ErpShell).
 */
export default function ErpNotificationsMobileSheet({
  open,
  onOpenChange,
  onNavigate,
  onLeaveNotificationClick,
  notifications = [],
  unreadCount = 0,
}) {
  const panelId = useId();
  const router = useRouter();
  const panelRef = useRef(null);
  const handleRef = useRef(null);
  const chromeRef = useRef(null);
  const scrollRef = useRef(null);

  const closePanel = useCallback(() => {
    onOpenChange(false);
    onNavigate?.();
  }, [onOpenChange, onNavigate]);

  const goToHref = useCallback(
    (href) => {
      const target = href || '/erp/dashboard';
      onOpenChange(false);
      onNavigate?.();
      if (typeof window === 'undefined') return;
      window.setTimeout(() => {
        try {
          router.push(target);
        } catch {
          window.location.assign(target);
        }
      }, 0);
    },
    [router, onOpenChange, onNavigate],
  );

  const measurePeekContent = useCallback(
    (scroll) => measureNotificationPeekHeight(scroll, DEFAULT_PEEK_NOTIFICATIONS),
    [],
  );

  const { ready, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp, onHandlePointerCancel } =
    useErpMobileSnapSheet(open, closePanel, { panelRef, handleRef, scrollRef, chromeRef }, {
      measurePeekContent,
      contentKey: notifications.length,
    });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[330] lg:hidden" role="presentation">
        <button
          type="button"
          className="absolute inset-0 z-0 bg-[#103D4D]/55 motion-safe:animate-[erpFadeIn_180ms_ease-out]"
          onClick={() => onOpenChange(false)}
          aria-label="Close notifications"
        />
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="fixed inset-x-0 z-10 flex touch-manipulation flex-col overflow-hidden"
          style={{
            bottom: 'calc(3.25rem + env(safe-area-inset-bottom))',
            height: 0,
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.22)] dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50">
            <div
              ref={handleRef}
              role="presentation"
              className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center py-3 active:cursor-grabbing"
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerCancel}
            >
              <span className="h-1.5 w-12 rounded-full bg-slate-300/90 dark:bg-white/25" aria-hidden />
            </div>

            <div
              ref={chromeRef}
              className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 dark:border-white/10"
            >
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Notifications</h2>
                {unreadCount > 0 ? (
                  <p className="text-[12px] font-medium text-violet-600 dark:text-violet-300">{unreadCount} unread</p>
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

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-7 pt-2 [scrollbar-width:thin]"
              style={{ paddingBottom: `calc(0.75rem + ${ERP_MOBILE_SHEET_FAB_CLEARANCE_PX}px)` }}
            >
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
    </ErpBodyPortal>
  );
}
