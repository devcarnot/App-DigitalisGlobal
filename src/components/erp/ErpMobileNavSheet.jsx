'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';

const FAN_PALETTE = [
  'bg-gradient-to-br from-[#103D4D] to-teal-600',
  'bg-gradient-to-br from-teal-600 to-cyan-500',
  'bg-gradient-to-br from-cyan-500 to-sky-500',
  'bg-gradient-to-br from-violet-500 to-indigo-500',
  'bg-gradient-to-br from-emerald-500 to-teal-600',
  'bg-gradient-to-br from-[#0e7490] to-[#0891b2]',
  'bg-gradient-to-br from-indigo-500 to-violet-600',
  'bg-gradient-to-br from-teal-700 to-emerald-500',
];

function itemBadge(href, { inboxUnread, projectsUnread, messagesUnread }) {
  if (href === '/erp/inbox') return inboxUnread;
  if (href === '/erp/projects') return projectsUnread;
  if (href === '/erp/messages') return messagesUnread;
  return 0;
}

/** Outer arc items sit lower — give their labels breathing room above the bottom bar. */
function extraBottomMargin(href) {
  if (href === '/erp/projects' || href === '/erp/announcements') return 28;
  return 0;
}

/** Split items into rows that fit the viewport without horizontal scroll. */
function splitIntoRows(items, viewportWidth) {
  const n = items.length;
  if (n === 0) return [];
  const pad = 12;
  const available = Math.max(280, viewportWidth - pad * 2);
  const minSlot = 52;
  const maxPerRow = Math.max(4, Math.floor(available / minSlot));

  if (n <= maxPerRow) return [items];

  const rowCount = Math.ceil(n / maxPerRow);
  const perRow = Math.ceil(n / rowCount);
  const rows = [];
  for (let i = 0; i < n; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

function rowArcPeak(rowIndex, rowCount) {
  if (rowCount <= 1) return 108;
  const t = (rowCount - 1 - rowIndex) / (rowCount - 1);
  return 12 + t * 96;
}

function itemArcLift(index, rowLen, rowPeak) {
  const t = rowLen <= 1 ? 0.5 : index / (rowLen - 1);
  return Math.sin(t * Math.PI) * rowPeak;
}

function sizingForRow(rowLen) {
  if (rowLen <= 4) {
    return { circle: 'h-14 w-14', icon: 'h-6 w-6', label: 'text-[11px]' };
  }
  if (rowLen <= 5) {
    return { circle: 'h-12 w-12', icon: 'h-5 w-5', label: 'text-[10px]' };
  }
  if (rowLen <= 7) {
    return { circle: 'h-11 w-11', icon: 'h-[1.125rem] w-[1.125rem]', label: 'text-[10px]' };
  }
  return { circle: 'h-10 w-10', icon: 'h-4 w-4', label: 'text-[9px]' };
}

function FanRow({
  row,
  rowIndex,
  rowCount,
  globalOffset,
  activeNavHref,
  iconMap,
  badges,
  onNavigate,
}) {
  const rowPeak = rowArcPeak(rowIndex, rowCount);
  const size = sizingForRow(row.length);

  return (
    <div
      className="flex w-full flex-row-reverse items-end justify-between gap-1 px-1.5"
      style={{ minHeight: `${rowPeak + 72}px` }}
    >
      {row.map((item, index) => {
        const Icon = iconMap[item.iconId];
        const active = item.href === activeNavHref;
        const badge = itemBadge(item.href, badges);
        const color = FAN_PALETTE[(globalOffset + index) % FAN_PALETTE.length];
        const lift = itemArcLift(index, row.length, rowPeak);
        const bottomGap = lift + extraBottomMargin(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            style={{
              marginBottom: `${bottomGap}px`,
              animationDelay: `${(globalOffset + index) * 28}ms`,
            }}
            className="erp-mobile-fan-item flex min-w-0 flex-1 flex-col items-center gap-1.5 px-0.5"
          >
            <span className="relative shrink-0">
              <span
                className={`flex items-center justify-center rounded-full text-white shadow-[0_10px_24px_-8px_rgba(16,61,77,0.8)] ring-[2.5px] ring-white ${size.circle} ${color} ${
                  active ? 'ring-cyan-200 dark:ring-cyan-300/80' : ''
                }`}
              >
                {Icon ? <Icon className={`shrink-0 text-white ${size.icon}`} /> : null}
              </span>
              {badge > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#06090d]">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </span>
            <span
              className={`line-clamp-2 w-full max-w-[5.75rem] text-center font-bold leading-tight ${size.label} rounded-lg bg-white px-1.5 py-1 text-[#103D4D] shadow-[0_2px_10px_rgba(16,61,77,0.16)] ring-1 ring-slate-200/90 dark:bg-[#0f1a24] dark:text-cyan-50 dark:ring-teal-800/50 ${
                active ? 'ring-violet-300 dark:ring-cyan-400/60' : ''
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Mobile workspace fan menu — all items visible on screen, multi-row arc, no scroll.
 */
export default function ErpMobileNavSheet({
  open,
  onClose,
  items,
  activeNavHref,
  iconMap,
  inboxUnread = 0,
  projectsUnread = 0,
  messagesUnread = 0,
  dialogId = 'erp-mobile-nav-fan',
  ariaLabel = 'Workspace menu',
  onEditQuickActions,
}) {
  const [viewportWidth, setViewportWidth] = useState(390);

  useEffect(() => {
    const sync = () => setViewportWidth(window.innerWidth);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const rows = useMemo(() => splitIntoRows(items || [], viewportWidth), [items, viewportWidth]);
  const badges = { inboxUnread, projectsUnread, messagesUnread };

  if (!open || !items?.length) return null;

  let globalOffset = 0;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[50] lg:hidden" role="presentation">
        <button
          type="button"
          className="absolute inset-x-0 top-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] bg-[#103D4D]/55 motion-safe:animate-[erpFadeIn_180ms_ease-out]"
          onClick={onClose}
          aria-label="Close menu"
        />

        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className="pointer-events-none absolute inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex max-h-[min(62vh,28rem)] flex-col justify-end overflow-visible"
        >
          <div className="pointer-events-auto w-full overflow-visible px-1 pb-3">
            <div className="flex flex-col justify-end gap-0.5">
              {rows.map((row, rowIndex) => {
                const offset = globalOffset;
                globalOffset += row.length;
                return (
                  <FanRow
                    key={`fan-row-${rowIndex}`}
                    row={row}
                    rowIndex={rowIndex}
                    rowCount={rows.length}
                    globalOffset={offset}
                    activeNavHref={activeNavHref}
                    iconMap={iconMap}
                    badges={badges}
                    onNavigate={onClose}
                  />
                );
              })}
            </div>
            {onEditQuickActions ? (
              <div className="mt-2 flex justify-center px-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditQuickActions();
                  }}
                  className="rounded-full border border-white/80 bg-white/95 px-4 py-2 text-[11px] font-bold text-[#103D4D] shadow-[0_4px_16px_rgba(16,61,77,0.2)] ring-1 ring-slate-200/90 dark:border-teal-700/55 dark:bg-[#0f1a24] dark:text-cyan-100 dark:ring-teal-800/50"
                >
                  Edit shortcuts
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
