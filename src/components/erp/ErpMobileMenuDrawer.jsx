'use client';

import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';

function itemBadge(href, { inboxUnread, projectsUnread, messagesUnread }) {
  if (href === '/erp/inbox') return inboxUnread;
  if (href === '/erp/projects') return projectsUnread;
  if (href === '/erp/messages') return messagesUnread;
  return 0;
}

/**
 * Mobile “Menu” sheet — slides up from the bottom with remaining workspace nav.
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
}) {
  const badges = { inboxUnread, projectsUnread, messagesUnread };

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
          id="erp-mobile-menu-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace menu"
          className="absolute inset-x-0 bottom-0 flex max-h-[min(78vh,32rem)] flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]"
        >
          <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.2)] motion-safe:animate-[erpSlideUp_280ms_ease-out] dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50">
            <div className="flex shrink-0 items-center justify-center py-2.5" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-slate-300/90 dark:bg-white/20" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-3 [scrollbar-width:thin]">
              {sections.map((sec) => (
                <div key={sec.sectionId} className="mb-3 last:mb-1">
                  {sec.sectionTitle ? (
                    <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800/45 dark:text-teal-300/50">
                      {sec.sectionTitle}
                    </p>
                  ) : null}
                  <ul className="space-y-0.5">
                    {sec.items.map((item) => {
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
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                              active
                                ? 'bg-gradient-to-r from-cyan-50 to-teal-50/80 text-[#103D4D] ring-1 ring-cyan-200/70 dark:from-teal-950/80 dark:to-cyan-950/40 dark:text-cyan-50 dark:ring-teal-800/50'
                                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5'
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                active
                                  ? 'erp-brand-fill text-white shadow-sm'
                                  : 'bg-slate-100 text-[#103D4D] dark:bg-white/10 dark:text-cyan-100'
                              }`}
                            >
                              {Icon ? <Icon className="h-[1.125rem] w-[1.125rem]" /> : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {badge > 0 ? (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
