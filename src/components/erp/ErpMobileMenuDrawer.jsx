'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';

/** Stop iOS rubber-band on sheet chrome and at scroll edges so the panel stays put. */
function useLockMobileSheetDrag(open, panelRef, scrollRef) {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const scroll = scrollRef.current;
    if (!panel) return;

    let touchStartY = 0;

    const onScrollTouchStart = (e) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) {
        e.preventDefault();
        return;
      }

      if (!scroll?.contains(target)) {
        e.preventDefault();
        return;
      }

      if (!scroll || scroll.scrollHeight <= scroll.clientHeight + 1) {
        e.preventDefault();
        return;
      }

      const y = e.touches[0]?.clientY ?? touchStartY;
      const dy = y - touchStartY;
      const atTop = scroll.scrollTop <= 0;
      const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        e.preventDefault();
      }
    };

    scroll?.addEventListener('touchstart', onScrollTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      scroll?.removeEventListener('touchstart', onScrollTouchStart);
      panel.removeEventListener('touchmove', onTouchMove);
    };
  }, [open, panelRef, scrollRef]);
}

function itemBadge(href, { inboxUnread, projectsUnread, messagesUnread }) {
  if (href === '/erp/inbox') return inboxUnread;
  if (href === '/erp/projects') return projectsUnread;
  if (href === '/erp/messages') return messagesUnread;
  return 0;
}

/**
 * Mobile “Menu” sheet — full-width panel anchored to the bottom with a 3-column app-icon grid.
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
  const scrollRef = useRef(null);
  const badges = { inboxUnread, projectsUnread, messagesUnread };

  useLockMobileSheetDrag(open, panelRef, scrollRef);

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
      <div className="fixed inset-0 z-[58] lg:hidden" role="presentation">
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
          className="fixed inset-x-0 bottom-0 z-10 flex max-h-[min(82vh,34rem)] touch-manipulation flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.22)] motion-safe:animate-[erpSlideUp_280ms_ease-out] dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50">
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-none px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 [scrollbar-width:thin]"
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
