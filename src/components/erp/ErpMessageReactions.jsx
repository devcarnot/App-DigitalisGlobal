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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
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

function MoreActionsIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function InfoMenuIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 10v6M12 7h.01" />
    </svg>
  );
}

function EditMenuIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CopyMenuIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

/** Fixed position for action menu — escapes overflow scroll in project chat panel. */
function useActionsMenuFixedStyle(anchorRef, open, mine) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(null);
      return undefined;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openDown = spaceBelow >= 140 || spaceBelow >= spaceAbove;

      const next = {
        position: 'fixed',
        zIndex: 480,
        minWidth: '9.5rem',
        maxHeight: 'min(70vh, 20rem)',
        overflowY: 'auto',
      };
      if (mine) next.right = Math.max(8, vw - rect.right);
      else next.left = Math.max(8, rect.left);
      if (openDown) next.top = rect.bottom + gap;
      else next.bottom = vh - rect.top + gap;
      setStyle(next);
    }

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, mine]);

  return style;
}

const menuItemClass =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10';

const menuItemDangerClass =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/45';

function popoverEdgeClass(mine) {
  return mine ? 'right-0' : 'left-0';
}

function popoverPlacementClass(placement) {
  return placement === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]';
}

/** Fixed position for large reaction picker — escapes overflow scroll + flips when needed. */
function useReactionPickerFixedStyle(anchorRef, open, mine, preferBottom = true) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(null);
      return undefined;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openDown = preferBottom ? spaceBelow >= 180 || spaceBelow >= spaceAbove : spaceBelow >= spaceAbove;

      const next = {
        position: 'fixed',
        zIndex: 480,
        width: 'min(92vw, 19.5rem)',
      };
      if (mine) next.right = Math.max(8, vw - rect.right);
      else next.left = Math.max(8, rect.left);
      if (openDown) next.top = rect.bottom + gap;
      else next.bottom = vh - rect.top + gap;
      setStyle(next);
    }

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, mine, preferBottom]);

  return style;
}

function launcherButtonClass(open = false, size = 'sm') {
  const buttonSize = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  return [
    'flex items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40',
    'border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700',
    'dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100',
    open ? 'border-[#103D4D]/45 text-[#103D4D] dark:border-teal-500/50 dark:text-teal-100' : '',
    buttonSize,
  ].join(' ');
}

/** Three-dot menu — Copy, Reply, Forward, info, edit, delete. Portals to body to avoid clip. */
export function ErpMessageActionsMenu({
  mine,
  disabled,
  showCopy = false,
  showReply = true,
  showForward = true,
  showInfo = false,
  showEdit = false,
  showDelete = false,
  onCopy,
  onReply,
  onForward,
  onInfo,
  onEdit,
  onDelete,
  size = 'sm',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useActionsMenuFixedStyle(buttonRef, open, mine);
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      const inAnchor = wrapRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inAnchor && !inMenu) setOpen(false);
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

  if (!showCopy && !showReply && !showForward && !showInfo && !showEdit && !showDelete) return null;

  const menuPanel = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      style={menuStyle || undefined}
      className={[
        'overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-[0_10px_38px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
        ERP_DARK_MENU_PORTAL,
      ].join(' ')}
      onClick={(e) => e.stopPropagation()}
    >
      {showCopy ? (
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false);
            onCopy?.();
          }}
        >
          <CopyMenuIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          Copy
        </button>
      ) : null}
      {showReply ? (
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false);
            onReply?.();
          }}
        >
          <ReplyLauncherIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          Reply
        </button>
      ) : null}
      {showForward ? (
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false);
            onForward?.();
          }}
        >
          <ForwardLauncherIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          Forward
        </button>
      ) : null}
      {showInfo ? (
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false);
            onInfo?.();
          }}
        >
          <InfoMenuIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          Message info
        </button>
      ) : null}
      {showEdit ? (
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false);
            onEdit?.();
          }}
        >
          <EditMenuIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          Edit
        </button>
      ) : null}
      {showDelete ? (
        <button
          type="button"
          role="menuitem"
          className={menuItemDangerClass}
          onClick={() => {
            setOpen(false);
            onDelete?.();
          }}
        >
          Delete
        </button>
      ) : null}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center self-center">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={launcherButtonClass(open, size)}
      >
        <MoreActionsIcon className={iconSize} />
      </button>

      {open && menuStyle ? <ErpBodyPortal>{menuPanel}</ErpBodyPortal> : null}
    </div>
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
      className={launcherButtonClass(false, size)}
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
      className={launcherButtonClass(false, size)}
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
  popoverPlacement = 'bottom',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const pickerRef = useRef(null);
  const pickerStyle = useReactionPickerFixedStyle(buttonRef, open, mine, popoverPlacement !== 'top');

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      const inAnchor = wrapRef.current?.contains(e.target);
      const inPicker = pickerRef.current?.contains(e.target);
      if (!inAnchor && !inPicker) setOpen(false);
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

  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  function handlePick(emoji) {
    setOpen(false);
    onPick?.(emoji);
  }

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center self-center">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label="Add reaction"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={launcherButtonClass(open, size)}
      >
        <ReactionLauncherIcon className={iconSize} />
      </button>

      {open && pickerStyle ? (
        <ErpBodyPortal>
          <div
            ref={pickerRef}
            role="dialog"
            aria-label="Pick a reaction"
            style={pickerStyle}
            className={[
              'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_38px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
              ERP_DARK_MENU_PORTAL,
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            <ErpMessageReactionPickerPanel onPick={handlePick} reactedEmojis={reactedEmojis} />
          </div>
        </ErpBodyPortal>
      ) : null}
    </div>
  );
}
