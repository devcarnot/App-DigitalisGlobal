'use client';

/**
 * Emoji reactions for chat messages (DM + Group).
 *
 * The bar of existing reactions shows compact "[emoji] [count]" chips below
 * the bubble; tapping a chip toggles the current user's reaction.
 *
 * The launcher is a small smiley icon button anchored alongside the bubble
 * (left for "mine", right for others). Clicking it opens a quick reaction
 * picker — WhatsApp-style — with one click adding/removing a reaction.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ERP_DARK_MENU_PORTAL } from '../../lib/erp-dark-surfaces';

/** Quick reactions row, in display order. Keep short for one-tap reach. */
export const ERP_QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀'];

/**
 * Wider palette shown when the user expands the picker. Grouped roughly by
 * theme; the exact ordering is just what feels good in a 7-wide grid.
 */
export const ERP_REACTION_PALETTE = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '🎉',
  '👏',
  '🙏',
  '😂',
  '😍',
  '😮',
  '😢',
  '😡',
  '🤔',
  '💯',
  '🚀',
  '✅',
  '❌',
  '⭐',
  '👀',
  '👋',
  '💪',
  '🤝',
  '🤩',
  '🤯',
  '😴',
  '🥳',
  '😅',
  '☕',
];

/**
 * Group rows by emoji. Returns ordered entries: stable by created_at of the
 * earliest reaction so the chip layout doesn't jump around as people add new
 * reactions of the same kind.
 */
export function summarizeReactionsForMessage(rows, viewerId) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const map = new Map();
  for (const r of rows) {
    if (!r || !r.emoji) continue;
    const key = String(r.emoji);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        emoji: key,
        userIds: [],
        firstAt: r.created_at || null,
        mine: false,
      };
      map.set(key, entry);
    }
    entry.userIds.push(r.user_id);
    if (viewerId && r.user_id === viewerId) entry.mine = true;
    if (r.created_at && (!entry.firstAt || r.created_at < entry.firstAt)) {
      entry.firstAt = r.created_at;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.firstAt ? Date.parse(a.firstAt) : 0;
    const tb = b.firstAt ? Date.parse(b.firstAt) : 0;
    if (ta === tb) return a.emoji.localeCompare(b.emoji);
    return ta - tb;
  });
}

/**
 * Renders the row of "[emoji] [count]" chips. Tapping a chip toggles the
 * viewer's reaction with that emoji; mine/not-mine controls the chip color.
 */
export function ErpMessageReactionsBar({
  rows,
  viewerId,
  mine: bubbleMine,
  onToggle,
  nameById,
}) {
  const summary = useMemo(() => summarizeReactionsForMessage(rows, viewerId), [rows, viewerId]);
  if (!summary.length) return null;

  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${bubbleMine ? 'justify-end' : 'justify-start'}`}>
      {summary.map((s) => {
        const isMine = s.mine;
        const titleNames = (s.userIds || [])
          .map((uid) => (uid === viewerId ? 'You' : nameById?.[uid] || 'Member'))
          .slice(0, 12)
          .join(', ');
        const remaining = (s.userIds?.length || 0) - 12;
        const title = remaining > 0 ? `${titleNames} +${remaining}` : titleNames;
        return (
          <button
            key={s.emoji}
            type="button"
            onClick={() => onToggle?.(s.emoji)}
            title={title}
            aria-label={`${s.emoji} ${s.userIds.length} ${
              s.userIds.length === 1 ? 'reaction' : 'reactions'
            }${isMine ? ' (you reacted)' : ''}`}
            aria-pressed={isMine}
            className={[
              'inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-semibold leading-none transition active:scale-[0.96]',
              isMine
                ? 'border border-cyan-400/70 bg-cyan-50 text-[#0d3442] shadow-sm hover:bg-cyan-100 dark:border-teal-400/70 dark:bg-teal-900/55 dark:text-teal-50 dark:hover:bg-teal-900/75'
                : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-200 dark:hover:bg-[#162430]',
            ].join(' ')}
          >
            <span className="text-[14px] leading-none">{s.emoji}</span>
            <span className="tabular-nums">{s.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tiny "forward" icon — same visual weight as the smiley reaction icon so
 * the two launchers sit comfortably next to each other.
 */
function ForwardLauncherIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M4 18v-4a4 4 0 014-4h12" />
    </svg>
  );
}

/**
 * Small icon button that opens the Forward-message modal for `m`. Uses the
 * same circular-button styling as `ErpMessageReactionLauncher` so the two
 * sit side-by-side without any visual mismatch.
 */
export function ErpMessageForwardLauncher({ disabled, onClick, size = 'sm' }) {
  const buttonSize = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Forward message"
      onClick={onClick}
      className={[
        'flex items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40',
        'border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
        'dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100',
        buttonSize,
      ].join(' ')}
    >
      <ForwardLauncherIcon className={iconSize} />
    </button>
  );
}

/**
 * Tiny smiley-face icon used on the launcher button.
 */
function ReactionLauncherIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.2 1.5 4 1.5 4-1.5 4-1.5" strokeLinecap="round" />
      <circle cx="9" cy="9.7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.7" r="0.9" fill="currentColor" stroke="none" />
      <path
        d="M18 4.5v3M16.5 6h3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Click-to-open reaction picker anchored to a small icon button.
 * Tapping a quick reaction (or any palette emoji) calls `onPick(emoji)`.
 *
 * `mine` controls horizontal alignment so the popover doesn't overflow the
 * thread on either side: for the viewer's own messages the popover anchors
 * to the right edge (icon sits to the left of the bubble), and vice versa.
 */
export function ErpMessageReactionLauncher({
  mine,
  disabled,
  onPick,
  reactedEmojis,
  size = 'sm',
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setExpanded(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setExpanded(false);
      }
    }
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('touchstart', onDocClick, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('touchstart', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isReacted = useMemo(() => {
    if (!reactedEmojis || !reactedEmojis.size) return () => false;
    return (e) => reactedEmojis.has(e);
  }, [reactedEmojis]);

  const buttonSize = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const popoverAlignClass = mine ? 'right-0' : 'left-0';

  function handlePick(emoji) {
    setOpen(false);
    setExpanded(false);
    onPick?.(emoji);
  }

  return (
    <div ref={wrapRef} className="relative shrink-0 self-end">
      <button
        type="button"
        disabled={disabled}
        aria-label="Add reaction"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40',
          'border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
          'dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100',
          buttonSize,
        ].join(' ')}
      >
        <ReactionLauncherIcon className={iconSize} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick a reaction"
          className={[
            'absolute z-30 bottom-[calc(100%+6px)]',
            popoverAlignClass,
            'w-max max-w-[min(86vw,22rem)]',
            'rounded-full border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-black/5',
            ERP_DARK_MENU_PORTAL,
            expanded ? 'rounded-2xl' : '',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          {!expanded ? (
            <div className="flex items-center gap-0.5">
              {ERP_QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => handlePick(e)}
                  aria-label={`React with ${e}`}
                  aria-pressed={isReacted(e)}
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-full text-[20px] leading-none transition hover:bg-slate-100 hover:scale-110 active:scale-95 dark:hover:bg-white/10',
                    isReacted(e) ? 'bg-cyan-100 ring-1 ring-cyan-300 dark:bg-teal-900/55 dark:ring-teal-500/55' : '',
                  ].join(' ')}
                >
                  <span aria-hidden>{e}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label="More reactions"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-teal-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="p-1.5">
              <div className="grid max-h-56 grid-cols-7 gap-0.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {ERP_REACTION_PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handlePick(e)}
                    aria-label={`React with ${e}`}
                    aria-pressed={isReacted(e)}
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-full text-[20px] leading-none transition hover:bg-slate-100 hover:scale-110 active:scale-95 dark:hover:bg-white/10',
                      isReacted(e) ? 'bg-cyan-100 ring-1 ring-cyan-300 dark:bg-teal-900/55 dark:ring-teal-500/55' : '',
                    ].join(' ')}
                  >
                    <span aria-hidden>{e}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-end px-1">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-teal-100"
                >
                  Less
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
