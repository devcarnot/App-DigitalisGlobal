'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ErpBodyPortal from './ErpBodyPortal';
import { ERP_MOBILE_SHEET_BACKDROP_CLASS } from './useErpMobileSnapSheet';

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

const ITEM_WIDTH_PX = 72;
const LABEL_HEIGHT_PX = 30;
const FAN_BOTTOM_MARGIN_PX = 20;

/** ring 0 = inner (top), 1 = middle, 2 = outer (lower sides): angles°: 90° = top center */
const FAN_SLOTS_BY_COUNT = {
  1: [{ ring: 0, angle: 90 }],
  2: [
    { ring: 1, angle: 122 },
    { ring: 1, angle: 58 },
  ],
  3: [
    { ring: 1, angle: 128 },
    { ring: 0, angle: 90 },
    { ring: 1, angle: 52 },
  ],
  4: [
    { ring: 2, angle: 168 },
    { ring: 1, angle: 128 },
    { ring: 1, angle: 52 },
    { ring: 2, angle: 12 },
  ],
  5: [
    { ring: 2, angle: 170 },
    { ring: 1, angle: 132 },
    { ring: 0, angle: 90 },
    { ring: 1, angle: 48 },
    { ring: 2, angle: 10 },
  ],
  6: [
    { ring: 2, angle: 172 },
    { ring: 1, angle: 140 },
    { ring: 1, angle: 108 },
    { ring: 1, angle: 72 },
    { ring: 1, angle: 40 },
    { ring: 2, angle: 8 },
  ],
  7: [
    { ring: 2, angle: 171 },
    { ring: 1, angle: 142 },
    { ring: 1, angle: 114 },
    { ring: 0, angle: 90 },
    { ring: 1, angle: 66 },
    { ring: 1, angle: 38 },
    { ring: 2, angle: 9 },
  ],
  8: [
    { ring: 2, angle: 172 },
    { ring: 1, angle: 146 },
    { ring: 1, angle: 118 },
    { ring: 0, angle: 98 },
    { ring: 0, angle: 82 },
    { ring: 1, angle: 62 },
    { ring: 1, angle: 34 },
    { ring: 2, angle: 8 },
  ],
};

function itemBadge(href, { inboxUnread, projectsUnread, messagesUnread }) {
  if (href === '/erp/inbox') return inboxUnread;
  if (href === '/erp/projects') return projectsUnread;
  if (href === '/erp/messages') return messagesUnread;
  return 0;
}

function ringRadii(viewportWidth) {
  const scale = Math.min(1.1, Math.max(0.9, viewportWidth / 390));
  return [Math.round(76 * scale), Math.round(114 * scale), Math.round(152 * scale)];
}

/**
 * Concentric radial arc (inner / middle / outer rings) centered on the Quick (+) FAB.
 */
function computeRadialArc(count, viewportWidth) {
  if (count <= 0) return { positions: [], height: 0, centerX: 0, rings: [] };

  const slots = FAN_SLOTS_BY_COUNT[Math.min(count, 8)] || FAN_SLOTS_BY_COUNT[8].slice(0, count);
  const rings = ringRadii(viewportWidth);
  const centerX = viewportWidth / 2;

  const positions = slots.slice(0, count).map((slot) => {
    const radius = rings[slot.ring] ?? rings[1];
    const rad = (slot.angle * Math.PI) / 180;
    const x = Math.round(centerX + Math.cos(rad) * radius);
    const lift = Math.round(Math.sin(rad) * radius);
    return { x, lift, ring: slot.ring, angle: slot.angle, radius };
  });

  const maxLift = Math.max(...positions.map((p) => p.lift), 0);

  return {
    positions,
    height: ITEM_WIDTH_PX + LABEL_HEIGHT_PX + maxLift + 8,
    centerX,
    rings,
    maxRadius: rings[2],
  };
}

function FanGuideArcs({ centerX, rings, height }) {
  const baseY = height;
  return (
    <svg
      className="pointer-events-none absolute bottom-0 left-0 w-full overflow-visible"
      height={height}
      aria-hidden
    >
      {rings.map((r, i) => (
        <path
          key={`fan-guide-${i}`}
          d={`M ${centerX - r} ${baseY} A ${r} ${r} 0 0 0 ${centerX + r} ${baseY}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          className="text-white/[0.14] dark:text-white/[0.1]"
        />
      ))}
    </svg>
  );
}

/**
 * Mobile Quick (+) fan: concentric semicircle arcs like radial FAB menus.
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
  ariaLabel = 'Quick actions',
}) {
  const [viewportWidth, setViewportWidth] = useState(390);

  useEffect(() => {
    const sync = () => setViewportWidth(window.innerWidth);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const badges = { inboxUnread, projectsUnread, messagesUnread };
  const arc = useMemo(
    () => computeRadialArc(items?.length || 0, viewportWidth),
    [items?.length, viewportWidth],
  );

  if (!open || !items?.length) return null;

  const bottomOffset = `calc(3.25rem + ${FAN_BOTTOM_MARGIN_PX}px + env(safe-area-inset-bottom))`;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[62] lg:hidden" role="presentation">
        <button
          type="button"
          className={ERP_MOBILE_SHEET_BACKDROP_CLASS}
          onClick={onClose}
          aria-label="Close quick actions"
        />

        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className="pointer-events-none absolute inset-x-0 overflow-visible"
          style={{ bottom: bottomOffset }}
        >
          <div
            className="pointer-events-auto relative w-full"
            style={{ height: `${arc.height}px` }}
          >
            <FanGuideArcs centerX={arc.centerX} rings={arc.rings} height={arc.height} />

            {items.map((item, index) => {
              const pos = arc.positions[index];
              if (!pos) return null;
              const Icon = iconMap[item.iconId];
              const active = item.href === activeNavHref;
              const badge = itemBadge(item.href, badges);
              const color = FAN_PALETTE[index % FAN_PALETTE.length];
              const enterX = Math.round((pos.x - arc.centerX) * 0.35);

              return (
                <div
                  key={item.href}
                  className="erp-mobile-fan-sweep absolute bottom-0 z-[1] w-[4.5rem] -translate-x-1/2 will-change-[transform,margin]"
                  style={{
                    left: `${pos.x}px`,
                    marginBottom: `${pos.lift}px`,
                    '--fan-lift': `${pos.lift}px`,
                    '--fan-enter-x': `${enterX}px`,
                    animationDelay: `${index * 68}ms`,
                  }}
                >
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className="flex flex-col items-center motion-safe:transition-transform motion-safe:active:scale-95"
                  >
                    <span className="relative shrink-0">
                      <span
                        className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_28px_-8px_rgba(16,61,77,0.8)] ring-[2.5px] ring-white ${color} ${
                          active ? 'ring-cyan-200 dark:ring-cyan-300/80' : ''
                        }`}
                      >
                        {Icon ? <Icon className="h-6 w-6 shrink-0 text-white" /> : null}
                      </span>
                      {badge > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#06090d]">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-2.5 line-clamp-2 w-full max-w-[5rem] px-1 text-center text-[10px] font-bold leading-tight text-white drop-shadow-[0_2px_6px_rgba(16,61,77,0.9)] ${
                        active ? 'text-cyan-100' : ''
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
