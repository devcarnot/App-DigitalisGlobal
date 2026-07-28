'use client';

import ErpIconPin from './ErpIconPin';
import { pinRowMessageId } from '../../lib/erp-message-pins';

export default function ErpPinnedMessagesBar({
  pins = [],
  activeIndex = 0,
  onActiveIndexChange,
  getMessage,
  getSenderLabel,
  getSnippet,
  onJump,
  onUnpin,
}) {
  if (!pins.length) return null;

  const safeIndex = Math.min(Math.max(0, activeIndex), pins.length - 1);
  const pin = pins[safeIndex];
  const messageId = pinRowMessageId(pin);
  const message = messageId ? getMessage?.(messageId) : null;
  const sender = message ? getSenderLabel?.(message) || 'Member' : 'Message';
  const snippet = message ? getSnippet?.(message) || 'Pinned message' : 'Message unavailable';

  return (
    <div className="shrink-0 border-b border-teal-900/10 bg-gradient-to-r from-teal-50/95 via-white to-cyan-50/80 px-3 py-2 dark:border-teal-900/35 dark:from-[#0d1824] dark:via-[#0a1218] dark:to-[#0d1824]">
      <div className="flex items-center gap-2">
        {pins.length > 1 ? (
          <button
            type="button"
            aria-label="Previous pinned message"
            disabled={safeIndex <= 0}
            onClick={() => onActiveIndexChange?.(Math.max(0, safeIndex - 1))}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#103D4D] transition hover:bg-teal-100/80 disabled:opacity-30 dark:text-teal-200 dark:hover:bg-white/10"
          >
            ‹
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => messageId && onJump?.(messageId)}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-teal-100/50 dark:hover:bg-white/[0.04]"
          title="Jump to pinned message"
        >
          <span className="mt-0.5 shrink-0 text-amber-500">
            <ErpIconPin filled className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 border-l-2 border-[#103D4D]/25 pl-2.5 dark:border-teal-500/35">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-[#103D4D] dark:text-teal-300">
              Pinned message{pins.length > 1 ? ` · ${safeIndex + 1} of ${pins.length}` : ''}
            </span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">
              {sender}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-slate-600 dark:text-slate-400">{snippet}</span>
          </span>
        </button>
        {pins.length > 1 ? (
          <button
            type="button"
            aria-label="Next pinned message"
            disabled={safeIndex >= pins.length - 1}
            onClick={() => onActiveIndexChange?.(Math.min(pins.length - 1, safeIndex + 1))}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#103D4D] transition hover:bg-teal-100/80 disabled:opacity-30 dark:text-teal-200 dark:hover:bg-white/10"
          >
            ›
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Unpin message"
          title="Unpin"
          onClick={() => pin?.id && onUnpin?.(pin.id)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ×
        </button>
      </div>
    </div>
  );
}
