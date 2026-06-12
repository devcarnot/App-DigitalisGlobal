'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';

/** Matches ErpShell mobile bottom nav (3.25rem grid + safe area). */
const BOTTOM_NAV_PX = 52;
/** Center FAB sits half above the nav bar — keep sheet content clear of it. */
const FAB_CLEARANCE_PX = 24;
const DEFAULT_PEEK_ROWS = 3;
const TOP_MARGIN_PX = 12;
const PEEK_BUFFER_PX = 20;

function readSafeAreaBottomPx() {
  if (typeof window === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.bottom = '0';
  probe.style.height = 'env(safe-area-inset-bottom)';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const px = probe.offsetHeight || 0;
  probe.remove();
  return px;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function measurePeekContentHeight(scroll, rowCount = DEFAULT_PEEK_ROWS) {
  const grid = scroll.querySelector('ul');
  if (!grid) return 260;

  const items = grid.querySelectorAll('li');
  let contentBottom = 0;

  if (items.length) {
    const rowsNeeded = Math.min(rowCount, Math.ceil(items.length / 3));
    const lastIdx = Math.min(items.length - 1, rowsNeeded * 3 - 1);
    const lastItem = items[lastIdx];
    contentBottom = lastItem.offsetTop + lastItem.offsetHeight;
  }

  const footer = scroll.querySelector('[data-erp-menu-footer]');
  if (footer) {
    contentBottom = Math.max(contentBottom, footer.offsetTop + footer.offsetHeight);
  }

  const style = getComputedStyle(scroll);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);

  return contentBottom + padY + PEEK_BUFFER_PX + FAB_CLEARANCE_PX;
}

function itemBadge(href, { inboxUnread, projectsUnread, messagesUnread }) {
  if (href === '/erp/inbox') return inboxUnread;
  if (href === '/erp/projects') return projectsUnread;
  if (href === '/erp/messages') return messagesUnread;
  return 0;
}

/**
 * Height-based snap sheet — scroll area matches visible height; drag handle uses pointer capture.
 */
function useSnapBottomSheet(open, onClose, panelRef, handleRef, scrollRef) {
  const metricsRef = useRef({ maxH: 420, peekH: 280, handleH: 36 });
  const dragRef = useRef({ active: false, pointerId: null, startY: 0, startH: 0 });
  const snapRef = useRef('peek');
  const heightRef = useRef(420);
  const [ready, setReady] = useState(false);

  const applyHeight = useCallback(
    (heightPx, { animate = true } = {}) => {
      const panel = panelRef.current;
      if (!panel) return;
      const h = Math.max(0, Math.round(heightPx));
      heightRef.current = h;
      panel.style.transition = animate ? 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
      panel.style.height = `${h}px`;
    },
    [panelRef],
  );

  const measure = useCallback(() => {
    const panel = panelRef.current;
    const scroll = scrollRef.current;
    const handle = handleRef.current;
    if (!panel || !scroll || typeof window === 'undefined') return;

    const safeBottom = readSafeAreaBottomPx();
    const navTotal = BOTTOM_NAV_PX + safeBottom;
    const maxAvailable = Math.max(280, window.innerHeight - navTotal - TOP_MARGIN_PX);
    const handleH = handle?.offsetHeight || 36;

    // Measure full content while panel is temporarily expanded (height was 0 before open).
    panel.style.transition = 'none';
    panel.style.height = `${maxAvailable}px`;
    const contentH = scroll.scrollHeight;
    const expandedH = Math.min(maxAvailable, handleH + contentH + 8);
    const peekContentH = measurePeekContentHeight(scroll, DEFAULT_PEEK_ROWS);
    const peekH = Math.min(expandedH, handleH + peekContentH);

    metricsRef.current = { maxH: expandedH, peekH, handleH };
    panel.style.maxHeight = `${maxAvailable}px`;
  }, [panelRef, scrollRef, handleRef]);

  const snapTo = useCallback(
    (target, { animate = true } = {}) => {
      const { maxH, peekH } = metricsRef.current;
      snapRef.current = target;

      if (target === 'closed') {
        applyHeight(0, { animate });
        window.setTimeout(() => onClose(), animate ? 260 : 0);
        return;
      }

      applyHeight(target === 'expanded' ? maxH : peekH, { animate });
    },
    [applyHeight, onClose],
  );

  const resolveSnapAfterDrag = useCallback(() => {
    const { maxH, peekH } = metricsRef.current;
    const h = heightRef.current;

    if (h <= peekH * 0.42) {
      snapTo('closed');
      return;
    }
    if (h >= (peekH + maxH) / 2) {
      snapTo('expanded');
      return;
    }
    snapTo('peek');
  }, [snapTo]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    snapRef.current = 'peek';
    applyHeight(0, { animate: false });

    const raf = requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(() => {
        measure();
        snapTo('peek', { animate: true });
        setReady(true);
      });
    });

    const onResize = () => {
      measure();
      applyHeight(snapRef.current === 'peek' ? metricsRef.current.peekH : metricsRef.current.maxH, {
        animate: false,
      });
    };

    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure, applyHeight, snapTo]);

  const onHandlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startY: e.clientY,
        startH: heightRef.current,
      };
    },
    [],
  );

  const onHandlePointerMove = useCallback(
    (e) => {
      if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
      const dy = e.clientY - dragRef.current.startY;
      const { maxH } = metricsRef.current;
      const next = clamp(dragRef.current.startH - dy, 0, maxH);
      applyHeight(next, { animate: false });
      e.preventDefault();
    },
    [applyHeight],
  );

  const onHandlePointerUp = useCallback(
    (e) => {
      if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
      dragRef.current.active = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      resolveSnapAfterDrag();
    },
    [resolveSnapAfterDrag],
  );

  const onHandlePointerCancel = useCallback(
    (e) => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      resolveSnapAfterDrag();
    },
    [resolveSnapAfterDrag],
  );

  return {
    ready,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onHandlePointerCancel,
  };
}

/**
 * Mobile “Menu” sheet — grid above bottom nav with drag-to-expand / drag-to-close.
 */
export default function ErpMobileMenuDrawer({
  open,
  onClose,
  sections = [],
  activeNavHref,
  iconMap,
  inboxUnread = 0,
  projectsUnread = 0,
  messagesUnread = 0,
  onEditQuickActions,
}) {
  const panelRef = useRef(null);
  const handleRef = useRef(null);
  const scrollRef = useRef(null);
  const badges = { inboxUnread, projectsUnread, messagesUnread };

  const { ready, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp, onHandlePointerCancel } =
    useSnapBottomSheet(open, onClose, panelRef, handleRef, scrollRef);

  const menuItems = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const sec of sections) {
      for (const item of sec.items || []) {
        if (!item?.href || seen.has(item.href)) continue;
        seen.add(item.href);
        out.push(item);
      }
    }
    return out;
  }, [sections]);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[65] lg:hidden" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-[#103D4D]/55 motion-safe:animate-[erpFadeIn_180ms_ease-out]"
          onClick={onClose}
          aria-label="Close menu"
        />

        <div
          ref={panelRef}
          id="erp-mobile-menu-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace menu"
          className="fixed inset-x-0 z-10 flex touch-manipulation flex-col overflow-hidden"
          style={{
            bottom: 'calc(3.25rem + env(safe-area-inset-bottom))',
            height: 0,
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.22)] dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50">
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
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-7 pt-1 [scrollbar-width:thin]"
            >
              <ul className="grid grid-cols-3 gap-x-1 gap-y-3">
                {menuItems.map((item) => {
                  const Icon = iconMap[item.iconId];
                  const active = item.href === activeNavHref;
                  const badge = itemBadge(item.href, badges);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={false}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={`group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors active:scale-[0.97] ${
                          active ? 'bg-cyan-50/90 dark:bg-teal-950/50' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="relative">
                          <span
                            className={`flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-[1.1rem] shadow-sm transition-transform group-active:scale-95 ${
                              active
                                ? 'erp-brand-fill text-white shadow-md shadow-teal-900/25'
                                : 'bg-slate-100 text-[#103D4D] ring-1 ring-slate-200/80 dark:bg-white/10 dark:text-cyan-100 dark:ring-white/10'
                            }`}
                          >
                            {Icon ? <Icon className="h-[1.35rem] w-[1.35rem]" /> : null}
                          </span>
                          {badge > 0 ? (
                            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#0a121a]">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`line-clamp-2 w-full px-0.5 text-center text-[10px] font-semibold leading-tight ${
                            active ? 'text-[#103D4D] dark:text-cyan-50' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {onEditQuickActions ? (
                <button
                  type="button"
                  data-erp-menu-footer
                  onClick={() => {
                    onClose();
                    onEditQuickActions();
                  }}
                  className="mt-4 mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/70 bg-cyan-50/50 px-4 py-2.5 text-[13px] font-semibold text-[#103D4D] transition hover:bg-cyan-50 active:scale-[0.98] dark:border-teal-800/50 dark:bg-teal-950/40 dark:text-cyan-100 dark:hover:bg-teal-950/60"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit shortcuts
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
