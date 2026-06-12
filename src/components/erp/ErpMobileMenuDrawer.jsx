'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';

/** Matches ErpShell mobile bottom nav height (3.25rem). */
const BOTTOM_NAV_PX = 52;
const PEEK_HEIGHT_RATIO = 0.56;
const MIN_PEEK_PX = 280;

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

function itemBadge(href, { inboxUnread, projectsUnread, messagesUnread }) {
  if (href === '/erp/inbox') return inboxUnread;
  if (href === '/erp/projects') return projectsUnread;
  if (href === '/erp/messages') return messagesUnread;
  return 0;
}

/**
 * Drag-to-snap bottom sheet: peek (default), expanded (full height above nav), or dismiss.
 */
function useSnapBottomSheet(open, onClose, panelRef, handleRef, scrollRef) {
  const metricsRef = useRef({ panelH: 420, peekTranslate: 140, maxTranslate: 420 });
  const dragRef = useRef({ active: false, startY: 0, startTranslate: 0, translate: 0, fromScroll: false });
  const snapRef = useRef('peek');
  const [snap, setSnap] = useState('peek');

  const getTranslateForSnap = useCallback((target) => {
    const { peekTranslate, maxTranslate } = metricsRef.current;
    if (target === 'expanded') return 0;
    if (target === 'peek') return peekTranslate;
    return maxTranslate;
  }, []);

  const applyTranslate = useCallback((translateY, animate) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = animate ? 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    panel.style.transform = `translateY(${translateY}px)`;
    dragRef.current.translate = translateY;
  }, [panelRef]);

  const measure = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || typeof window === 'undefined') return;
    const safeBottom = readSafeAreaBottomPx();
    const chromeTop = 8;
    const panelH = Math.max(320, window.innerHeight - BOTTOM_NAV_PX - safeBottom - chromeTop);
    const peekH = Math.min(panelH, Math.max(MIN_PEEK_PX, Math.round(panelH * PEEK_HEIGHT_RATIO)));
    const peekTranslate = panelH - peekH;
    metricsRef.current = { panelH, peekTranslate, maxTranslate: panelH };
    panel.style.height = `${panelH}px`;
  }, [panelRef]);

  const snapTo = useCallback(
    (target, { animate = true } = {}) => {
      if (target === 'closed') {
        applyTranslate(metricsRef.current.maxTranslate, animate);
        window.setTimeout(() => onClose(), animate ? 240 : 0);
        return;
      }
      snapRef.current = target;
      setSnap(target);
      applyTranslate(getTranslateForSnap(target), animate);
    },
    [applyTranslate, getTranslateForSnap, onClose],
  );

  const resolveSnapAfterDrag = useCallback(() => {
    const { peekTranslate, maxTranslate } = metricsRef.current;
    const ty = dragRef.current.translate;

    if (ty >= (peekTranslate + maxTranslate) / 2) {
      snapTo('closed');
      return;
    }
    if (ty <= peekTranslate / 2) {
      snapTo('expanded');
      return;
    }
    snapTo('peek');
  }, [snapTo]);

  useEffect(() => {
    if (!open) return;
    snapRef.current = 'peek';
    setSnap('peek');
    measure();
    applyTranslate(metricsRef.current.maxTranslate, false);
    const raf = requestAnimationFrame(() => snapTo('peek', { animate: true }));
    const onResize = () => {
      measure();
      applyTranslate(getTranslateForSnap(snapRef.current), false);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure, applyTranslate, getTranslateForSnap, snapTo]);

  useEffect(() => {
    if (!open) return;
    const handle = handleRef.current;
    const scroll = scrollRef.current;
    if (!handle || !scroll) return;

    const beginDrag = (clientY, fromScroll) => {
      dragRef.current = {
        active: true,
        startY: clientY,
        startTranslate: dragRef.current.translate,
        translate: dragRef.current.translate,
        fromScroll,
      };
    };

    const moveDrag = (clientY, e) => {
      if (!dragRef.current.active) return;
      const dy = clientY - dragRef.current.startY;
      const { maxTranslate } = metricsRef.current;
      const next = Math.min(maxTranslate, Math.max(0, dragRef.current.startTranslate + dy));
      applyTranslate(next, false);
      e?.preventDefault?.();
    };

    const endDrag = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      resolveSnapAfterDrag();
    };

    const onHandleStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      beginDrag(t.clientY, false);
    };
    const onHandleMove = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      moveDrag(t.clientY, e);
    };
    const onHandleEnd = () => endDrag();

    const onScrollStart = (e) => {
      if (scroll.scrollTop > 0) return;
      const t = e.touches?.[0];
      if (!t) return;
      beginDrag(t.clientY, true);
    };
    const onScrollMove = (e) => {
      if (!dragRef.current.active || !dragRef.current.fromScroll) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dy = t.clientY - dragRef.current.startY;
      if (dy > 0) {
        moveDrag(t.clientY, e);
      } else {
        dragRef.current.active = false;
      }
    };
    const onScrollEnd = () => {
      if (dragRef.current.fromScroll) endDrag();
    };

    handle.addEventListener('touchstart', onHandleStart, { passive: true });
    handle.addEventListener('touchmove', onHandleMove, { passive: false });
    handle.addEventListener('touchend', onHandleEnd);
    handle.addEventListener('touchcancel', onHandleEnd);

    scroll.addEventListener('touchstart', onScrollStart, { passive: true });
    scroll.addEventListener('touchmove', onScrollMove, { passive: false });
    scroll.addEventListener('touchend', onScrollEnd);
    scroll.addEventListener('touchcancel', onScrollEnd);

    return () => {
      handle.removeEventListener('touchstart', onHandleStart);
      handle.removeEventListener('touchmove', onHandleMove);
      handle.removeEventListener('touchend', onHandleEnd);
      handle.removeEventListener('touchcancel', onHandleEnd);
      scroll.removeEventListener('touchstart', onScrollStart);
      scroll.removeEventListener('touchmove', onScrollMove);
      scroll.removeEventListener('touchend', onScrollEnd);
      scroll.removeEventListener('touchcancel', onScrollEnd);
    };
  }, [open, applyTranslate, handleRef, scrollRef, resolveSnapAfterDrag]);

  return { snap, snapTo };
}

/**
 * Mobile “Menu” sheet — full-width panel anchored above the bottom nav with drag snap.
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
          className="fixed inset-x-0 z-10 flex touch-manipulation flex-col will-change-transform"
          style={{ bottom: 'calc(3.25rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.22)] dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50">
            <div
              ref={handleRef}
              className="flex shrink-0 touch-none cursor-grab items-center justify-center py-2.5 active:cursor-grabbing"
              aria-hidden
            >
              <span className="h-1 w-10 rounded-full bg-slate-300/90 dark:bg-white/20" />
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-0.5 [scrollbar-width:thin]"
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
                  onClick={() => {
                    onClose();
                    onEditQuickActions();
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/70 bg-cyan-50/50 px-4 py-2.5 text-[13px] font-semibold text-[#103D4D] transition hover:bg-cyan-50 active:scale-[0.98] dark:border-teal-800/50 dark:bg-teal-950/40 dark:text-cyan-100 dark:hover:bg-teal-950/60"
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
