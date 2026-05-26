'use client';

/**
 * Emoji reactions for chat messages (DM + Group + Project).
 *
 * The bar of existing reactions shows compact "[emoji] [count]" chips below
 * the bubble; tapping a chip toggles the current user's reaction.
 *
 * The launcher opens a WhatsApp-style picker: a quick row plus the full
 * reaction palette in one panel (no expand/collapse step).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ERP_DARK_MENU_PORTAL } from '../../lib/erp-dark-surfaces';

/** WhatsApp's default quick-reaction row. */
export const ERP_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** Full reaction palette shown below the quick row (deduped at render time). */
export const ERP_REACTION_PALETTE = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '🎉',
  '👏',
  '🙏',
  '😂',
  '🤣',
  '😀',
  '😁',
  '😊',
  '😍',
  '🥰',
  '😘',
  '😎',
  '🤩',
  '🙂',
  '😉',
  '😮',
  '😲',
  '😳',
  '🥺',
  '😢',
  '😭',
  '😡',
  '🤬',
  '🤔',
  '😐',
  '😴',
  '🤯',
  '🥳',
  '😅',
  '🤗',
  '🤝',
  '👋',
  '💪',
  '✌️',
  '🤞',
  '🙌',
  '👀',
  '💯',
  '✅',
  '❌',
  '⭐',
  '🚀',
  '☕',
  '🍕',
  '🎂',
  '💡',
  '📌',
  '📎',
  '⚡',
  '✨',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '💔',
  '🫶',
  '🙈',
  '🙉',
  '🙊',
];

function reactionButtonClass(active) {
  return [
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[26px] leading-none transition select-none',
    'hover:bg-slate-100/90 hover:scale-110 active:scale-95',
    'dark:hover:bg-white/10',
    active
      ? 'bg-cyan-50 ring-2 ring-cyan-300/80 dark:bg-teal-900/45 dark:ring-teal-500/55'
      : '',
  ].join(' ');
}

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
 * WhatsApp-style reaction picker: quick row + scrollable full palette in one view.
 */
export function ErpMessageReactionPickerPanel({ onPick, reactedEmojis, className = '' }) {
  const isReacted = useMemo(() => {
    if (!reactedEmojis || !reactedEmojis.size) return () => false;
    return (emoji) => reactedEmojis.has(emoji);
  }, [reactedEmojis]);

  const quickSet = useMemo(() => new Set(ERP_QUICK_REACTIONS), []);
  const moreEmojis = useMemo(
    () => ERP_REACTION_PALETTE.filter((emoji) => !quickSet.has(emoji)),
    [quickSet],
  );

  return (
    <div className={`flex flex-col gap-1.5 p-1.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-0.5 px-0.5">
        {ERP_QUICK_REACTIONS.map((emoji) => (
          <button
            key={`quick-${emoji}`}
            type="button"
            onClick={() => onPick?.(emoji)}
            aria-label={`React with ${emoji}`}
            aria-pressed={isReacted(emoji)}
            className={reactionButtonClass(isReacted(emoji))}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </div>
      {moreEmojis.length > 0 ? (
        <>
          <div className="mx-1 border-t border-slate-200/80 dark:border-teal-800/45" />
          <div className="grid max-h-52 grid-cols-6 gap-0.5 overflow-y-auto overscroll-contain px-0.5 sm:grid-cols-7 [scrollbar-width:thin]">
            {moreEmojis.map((emoji) => (
              <button
                key={`more-${emoji}`}
                type="button"
                onClick={() => onPick?.(emoji)}
                aria-label={`React with ${emoji}`}
                aria-pressed={isReacted(emoji)}
                className={reactionButtonClass(isReacted(emoji))}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
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

function ReplyLauncherIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17l-5-5 5-5M4 12h11a4 4 0 014 4v1" />
    </svg>
  );
}

/** Reply-to-message launcher — matches forward/reaction button styling. */
export function ErpMessageReplyLauncher({ disabled, onClick, size = 'sm' }) {
  const buttonSize = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Reply"
      onClick={onClick}
      className={[
        'flex items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40',
        'border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
        'dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100',
        buttonSize,
      ].join(' ')}
    >
      <ReplyLauncherIcon className={iconSize} />
    </button>
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

/** Simple outline smiley — matches WhatsApp's reaction launcher icon. */
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
    </svg>
  );
}

/**
 * Click-to-open reaction picker anchored to a small icon button.
 * Tapping any emoji calls `onPick(emoji)`.
 */
export function ErpMessageReactionLauncher({
  mine,
  disabled,
  onPick,
  reactedEmojis,
  size = 'sm',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
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

  const buttonSize = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const popoverAlignClass = mine ? 'right-0' : 'left-0';

  function handlePick(emoji) {
    setOpen(false);
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
        onClick={() => setOpen((value) => !value)}
        className={[
          'flex items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40',
          'border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
          'dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100',
          open ? 'border-[#103D4D]/45 text-[#103D4D] dark:border-teal-500/50 dark:text-teal-100' : '',
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
            'absolute z-30 bottom-[calc(100%+8px)]',
            popoverAlignClass,
            'w-[min(92vw,19.5rem)]',
            'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_38px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
            ERP_DARK_MENU_PORTAL,
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <ErpMessageReactionPickerPanel onPick={handlePick} reactedEmojis={reactedEmojis} />
        </div>
      ) : null}
    </div>
  );
}
