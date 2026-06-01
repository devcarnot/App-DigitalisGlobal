'use client';

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import ErpPendingAttachmentChips from './ErpPendingAttachmentChips';
import { ERP_CHAT_EMOJI_CATEGORIES } from '../../lib/erp-chat-emojis';
import { useMobileKeyboardInset } from '../../lib/use-mobile-keyboard-inset';

export function chatFmtBtnClass(active = false) {
  return `flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-semibold transition-all active:scale-95 ${
    active
      ? 'bg-gradient-to-br from-[#589cd5] to-[#52c4c9] text-white shadow-sm ring-1 ring-[#103D4D]/20 dark:from-teal-600 dark:to-cyan-600'
      : 'bg-white text-slate-600 ring-1 ring-slate-200/90 hover:bg-cyan-50/90 hover:text-[#103D4D] dark:bg-[#1e2a33] dark:text-teal-100 dark:ring-teal-900/55 dark:hover:bg-teal-950/70'
  }`;
}

function IconPlus({ className = 'h-5 w-5', open = false }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconPaperclip({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m18.375 12.739-8.284 8.284a4.5 4.5 0 1 1-6.364-6.364l8.284-8.284m0 0 3.932 3.932M18.375 12.739 14.307 11.17m0 0 3.328-3.328a4.5 4.5 0 0 0-6.364-6.364l-5.656 5.656a4.5 4.5 0 0 0 6.364 6.364l1.89-1.89"
      />
    </svg>
  );
}

function IconEmoji({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
      <circle cx="9" cy="10" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSend({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2 11 13" />
    </svg>
  );
}

const SHELL_DOCK =
  'relative w-full overflow-hidden rounded-none border-0 bg-gradient-to-r from-[#e6f7fa] via-white to-[#dff5f0] shadow-[0_-12px_40px_-20px_rgba(16,61,77,0.22)] ring-0 ' +
  'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-[#589cd5] before:via-cyan-400 before:to-[#52c4c9] before:content-[""] ' +
  'after:pointer-events-none after:absolute after:inset-x-8 after:top-3 after:h-16 after:rounded-full after:bg-gradient-to-r after:from-cyan-300/15 after:via-teal-200/10 after:to-cyan-400/15 after:blur-2xl after:content-[""] ' +
  'dark:from-[#0c151c] dark:via-[#101820] dark:to-[#0a1418] dark:shadow-[0_-14px_44px_-18px_rgba(0,0,0,0.55)] ' +
  'dark:before:from-teal-500 dark:before:via-cyan-400 dark:before:to-teal-300 dark:after:from-teal-500/10 dark:after:via-cyan-400/5 dark:after:to-teal-400/10';

const SHELL_DRAG =
  'ring-2 ring-inset ring-[#103D4D]/15 dark:ring-teal-500/20 border-t-[#103D4D]/35 dark:border-t-teal-500/40';

function useSheetEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

function ErpChatSheetShell({ open, onClose, sheetBottomPad, ariaLabel, maxHeightClass, children }) {
  useSheetEscape(open, onClose);
  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[480]" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] motion-safe:animate-[erpFadeIn_180ms_ease-out] dark:bg-black/55"
          onClick={onClose}
          aria-label="Close"
        />
        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col justify-end ${maxHeightClass}`}
          style={{ paddingBottom: sheetBottomPad }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <div className="mx-2 flex max-h-full flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-slate-200/90 bg-white/98 shadow-[0_-20px_60px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl motion-safe:animate-[erpSlideUp_260ms_cubic-bezier(0.22,1,0.36,1)] dark:border-teal-800/55 dark:bg-[#0d151c]/98 dark:shadow-[0_-24px_64px_-12px_rgba(0,0,0,0.65)] sm:mx-auto sm:max-w-xl sm:w-full">
            <div className="flex shrink-0 justify-center py-2.5" aria-hidden>
              <span className="h-1 w-11 rounded-full bg-slate-300/90 dark:bg-white/20" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

function ErpChatEmojiSheet({ open, onClose, onPickEmoji, sheetBottomPad }) {
  const [categoryId, setCategoryId] = useState('smileys');
  const activeCategory =
    ERP_CHAT_EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? ERP_CHAT_EMOJI_CATEGORIES[1];

  return (
    <ErpChatSheetShell
      open={open}
      onClose={onClose}
      sheetBottomPad={sheetBottomPad}
      ariaLabel="Emoji picker"
      maxHeightClass="max-h-[min(72vh,28rem)]"
    >
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0.5 sm:px-4">
        <div className="mb-2 flex shrink-0 gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          {ERP_CHAT_EMOJI_CATEGORIES.map((cat) => {
            const active = cat.id === categoryId;
            return (
              <button
                key={cat.id}
                type="button"
                title={cat.title}
                aria-label={cat.title}
                aria-pressed={active}
                onClick={() => setCategoryId(cat.id)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition active:scale-95 ${
                  active
                    ? 'bg-[#103D4D]/10 ring-2 ring-cyan-400/35 dark:bg-teal-950/70 dark:ring-teal-500/30'
                    : 'bg-slate-100/90 hover:bg-slate-200/90 dark:bg-[#151f28]/90 dark:hover:bg-[#1a2835]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-9">
            {activeCategory.emojis.map((em) => (
              <button
                key={`${activeCategory.id}-${em}`}
                type="button"
                className="flex aspect-square items-center justify-center rounded-xl text-[1.35rem] transition active:scale-95 hover:bg-slate-100/95 dark:hover:bg-white/[0.07]"
                onClick={() => onPickEmoji?.(em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ErpChatSheetShell>
  );
}

function ErpChatFormatSheet({ open, onClose, toolbar, formatState }) {
  if (!open) return null;

  const toolbarNode = isValidElement(toolbar) ? cloneElement(toolbar, { formatState }) : toolbar;

  return (
    <div
      className="relative z-[1] border-b border-cyan-200/70 bg-gradient-to-r from-[#589cd5]/10 via-white to-[#52c4c9]/10 px-3 py-2.5 motion-safe:animate-[erpFadeIn_160ms_ease-out] dark:border-teal-800/50 dark:from-teal-950/40 dark:via-[#101820] dark:to-cyan-950/30"
      role="toolbar"
      aria-label="Text formatting"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#589cd5] to-[#52c4c9] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm">
          Format
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70 transition hover:bg-cyan-50 dark:bg-[#1a2834] dark:text-teal-100 dark:ring-teal-700/50 dark:hover:bg-teal-950/60"
        >
          Done
        </button>
      </div>
      {toolbarNode}
    </div>
  );
}

/**
 * Unified chat composer dock: + opens bottom tools sheet, paperclip attaches, pill input, send.
 */
export default function ErpChatComposer({
  isDragging = false,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  replyBanner = null,
  pendingFiles = [],
  onRemovePendingAt,
  pendingFilesHint = null,
  onAttachClick,
  attachTitle = 'Attach file or image',
  canSend = false,
  onSend,
  sending = false,
  inflightSends = 0,
  composer,
  toolbar,
  toolbarRef,
  getFormatState,
  onQuickEmoji,
  footerHint = 'Enter to send · Shift+Enter for new line',
  className = '',
  mobileBottomNavOffset = false,
  /** Full-screen chat (DM thread): no dock padding unless the keyboard is open. */
  dockFlush = false,
  /** Pin composer to the viewport bottom on mobile (adds home-indicator safe area). */
  viewportDock = false,
}) {
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const keyboardInset = useMobileKeyboardInset(mobileViewport);
  /** Ignore small visualViewport deltas from browser chrome — only real keyboards. */
  const keyboardLift = keyboardInset > 50 ? keyboardInset : 0;
  const [sheetMode, setSheetMode] = useState(null);
  const [formatState, setFormatState] = useState({});
  const getFormatStateRef = useRef(getFormatState);
  getFormatStateRef.current = getFormatState;

  const closeSheet = useCallback(() => setSheetMode(null), []);
  const toggleFormatSheet = useCallback(
    () => setSheetMode((mode) => (mode === 'format' ? null : 'format')),
    []
  );
  const toggleEmojiSheet = useCallback(
    () => setSheetMode((mode) => (mode === 'emoji' ? null : 'emoji')),
    []
  );

  useEffect(() => {
    if (mobileViewport && sheetMode === 'format') setSheetMode(null);
  }, [mobileViewport, sheetMode]);

  useEffect(() => {
    if (sheetMode !== 'format') {
      setFormatState({});
      return undefined;
    }
    let raf = 0;
    const refresh = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setFormatState(getFormatStateRef.current?.() || {});
      });
    };
    refresh();
    document.addEventListener('selectionchange', refresh);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', refresh);
    };
  }, [sheetMode]);

  const sendTitle = sending ? `Sending… ${inflightSends} in background` : 'Send';
  const navBottomPad = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const safeAreaPad = 'env(safe-area-inset-bottom, 0px)';

  const dockPadStyle = (() => {
    if (keyboardLift > 0) {
      const base = mobileBottomNavOffset ? navBottomPad : safeAreaPad;
      return { paddingBottom: `max(${keyboardLift}px, ${base})` };
    }
    if (mobileBottomNavOffset) {
      return { paddingBottom: navBottomPad };
    }
    return undefined;
  })();

  const sheetBottomPad = (() => {
    if (keyboardLift > 0) {
      const base = mobileBottomNavOffset ? navBottomPad : safeAreaPad;
      return `max(${keyboardLift}px, ${base})`;
    }
    if (mobileBottomNavOffset) return navBottomPad;
    return safeAreaPad;
  })();

  const dockPadClass =
    dockFlush && !mobileBottomNavOffset
      ? viewportDock && mobileViewport
        ? 'pb-[env(safe-area-inset-bottom,0px)] lg:pb-0'
        : 'lg:pb-0'
      : !dockPadStyle && !mobileBottomNavOffset
        ? 'pb-[env(safe-area-inset-bottom,0px)] lg:pb-0'
        : '';

  return (
    <div
      ref={toolbarRef}
      className={`${SHELL_DOCK} ${isDragging ? SHELL_DRAG : ''} ${dockPadClass} ${className}`.trim()}
      style={dockPadStyle}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[#103D4D]/50 bg-cyan-50/90 text-[13px] font-bold text-[#103D4D] dark:border-teal-500/50 dark:bg-teal-950/85 dark:text-teal-100">
          Drop to attach (multiple files)
        </div>
      ) : null}

      {replyBanner}

      {pendingFiles.length ? (
        <div className="border-b border-slate-100/90 px-3 pb-2 pt-2 dark:border-teal-900/35">
          <ErpPendingAttachmentChips
            files={pendingFiles}
            onRemoveAt={onRemovePendingAt}
            listClassName="flex max-h-28 flex-wrap gap-2 overflow-y-auto overscroll-contain [scrollbar-width:thin] sm:max-h-32"
          />
          {pendingFilesHint ? (
            <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">{pendingFilesHint}</p>
          ) : null}
        </div>
      ) : null}

      <ErpChatFormatSheet
        open={sheetMode === 'format' && !mobileViewport}
        onClose={closeSheet}
        toolbar={toolbar}
        formatState={formatState}
      />

      <div className="relative z-[1] flex w-full items-end gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <button
          type="button"
          title={sheetMode === 'format' ? 'Close formatting' : 'Formatting'}
          aria-expanded={sheetMode === 'format'}
          onClick={toggleFormatSheet}
          className={`mb-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 lg:flex ${
            sheetMode === 'format'
              ? 'bg-gradient-to-br from-[#589cd5] to-[#52c4c9] text-white shadow-[0_4px_16px_-4px_rgba(82,196,201,0.7)] ring-2 ring-white/90'
              : 'bg-white/95 text-[#103D4D] shadow-md ring-1 ring-cyan-200/70 hover:bg-gradient-to-br hover:from-cyan-50 hover:to-teal-50 dark:bg-[#1a2834] dark:text-teal-100 dark:ring-teal-700/50 dark:hover:from-teal-950/80 dark:hover:to-cyan-950/60'
          }`}
        >
          <IconPlus className="h-[18px] w-[18px]" open={sheetMode === 'format'} />
        </button>

        <div className="flex min-h-[46px] min-w-0 flex-1 items-end rounded-[1.5rem] bg-gradient-to-r from-[#589cd5] via-cyan-400 to-[#52c4c9] p-[2px] shadow-[0_6px_22px_-10px_rgba(16,61,77,0.45)] dark:from-teal-600 dark:via-cyan-500 dark:to-teal-400 dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.55)]">
          <div className="flex min-h-[42px] w-full items-end overflow-hidden rounded-[1.35rem] bg-white dark:bg-[#1a2630] [&_.erp-md-wys]:text-[#111b21] dark:[&_.erp-md-wys]:text-[#e9edef] [&_.erp-md-wys:empty]:before:!text-slate-500 dark:[&_.erp-md-wys:empty]:before:!text-slate-400">
            <button
              type="button"
              title={attachTitle}
              onClick={onAttachClick}
              className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-50 to-teal-100 text-[#103D4D] ring-1 ring-cyan-200/80 transition hover:from-cyan-100 hover:to-teal-200 active:scale-95 dark:from-teal-950/70 dark:to-cyan-950/50 dark:text-teal-100 dark:ring-teal-700/45"
            >
              <IconPaperclip className="h-[18px] w-[18px]" />
            </button>

            <div className="flex min-w-0 flex-1 items-center self-center">{composer}</div>

            {onQuickEmoji ? (
              <button
                type="button"
                title={sheetMode === 'emoji' ? 'Close emoji picker' : 'Emoji'}
                aria-expanded={sheetMode === 'emoji'}
                onClick={toggleEmojiSheet}
                className={`mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
                  sheetMode === 'emoji'
                    ? 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700 ring-1 ring-amber-200/80 dark:from-amber-950/50 dark:to-orange-950/40 dark:text-amber-200 dark:ring-amber-800/50'
                    : 'bg-gradient-to-br from-violet-50 to-cyan-50 text-violet-600 ring-1 ring-violet-200/70 hover:from-violet-100 hover:to-cyan-100 dark:from-violet-950/40 dark:to-cyan-950/40 dark:text-violet-200 dark:ring-violet-800/40'
                }`}
              >
                <IconEmoji className="h-[17px] w-[17px]" />
              </button>
            ) : (
              <span className="mr-1.5 w-0.5 shrink-0" aria-hidden />
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          title={sendTitle}
          className={`mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 ${
            canSend
              ? 'bg-gradient-to-br from-[#589cd5] via-[#4eb8c8] to-[#52c4c9] shadow-[0_8px_22px_-6px_rgba(82,196,201,0.75)] ring-2 ring-white/85 hover:brightness-105'
              : 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500 shadow-none ring-1 ring-slate-200/80 dark:from-slate-700 dark:to-slate-800 dark:text-slate-400 dark:ring-slate-600/50'
          }`}
        >
          <IconSend className="h-[17px] w-[17px]" />
        </button>
      </div>

      {onQuickEmoji ? (
        <ErpChatEmojiSheet
          open={sheetMode === 'emoji'}
          onClose={closeSheet}
          onPickEmoji={onQuickEmoji}
          sheetBottomPad={sheetBottomPad}
        />
      ) : null}

      {footerHint ? <p className="sr-only">{footerHint}</p> : null}
    </div>
  );
}

export { IconEmoji, IconPaperclip };

function enhanceExtraActions(node, onActionComplete) {
  if (!node) return null;
  if (Array.isArray(node)) {
    return node.map((child, idx) => enhanceExtraActions(child, onActionComplete)?.[0] ?? child);
  }
  if (!isValidElement(node)) return node;
  const prevClick = node.props.onClick;
  return cloneElement(node, {
    onMouseDown: (e) => {
      e.preventDefault();
      node.props.onMouseDown?.(e);
    },
    onClick: (e) => {
      prevClick?.(e);
      onActionComplete?.();
    },
  });
}

function FmtDivider() {
  return <span className="mx-0.5 h-7 w-px shrink-0 bg-cyan-200/80 dark:bg-teal-900/60" aria-hidden />;
}

function FormatBtn({ title, onClick, children, className = '', active = false }) {
  return (
    <button
      type="button"
      className={`${chatFmtBtnClass(active)} ${className}`.trim()}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Compact formatting chips in the bottom tools sheet. */
export function ErpChatFormatToolbar({
  onBold,
  onItalic,
  onUnderline,
  onStrikethrough,
  onInlineCode,
  onLink,
  onBlockquote,
  onBulletList,
  onOrderedList,
  onHeading,
  onParagraph,
  onCodeBlock,
  onHorizontalRule,
  onUndo,
  onRedo,
  onRemoveFormat,
  extraActions = null,
  onActionComplete,
  formatState = {},
}) {
  const run =
    (action) =>
    (...args) => {
      action?.(...args);
      onActionComplete?.();
    };

  const paragraphActive =
    formatState.heading == null && !formatState.blockquote && !formatState.bulletList && !formatState.orderedList;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <FormatBtn title="Bold" active={formatState.bold} onClick={run(onBold)}>
          B
        </FormatBtn>
        <FormatBtn title="Italic" active={formatState.italic} onClick={run(onItalic)}>
          I
        </FormatBtn>
        <FormatBtn title="Underline" active={formatState.underline} onClick={run(onUnderline)}>
          U
        </FormatBtn>
        <FormatBtn title="Strikethrough" active={formatState.strike} onClick={run(onStrikethrough)}>
          S
        </FormatBtn>
        <FormatBtn title="Inline code" active={formatState.inlineCode} onClick={run(onInlineCode)}>
          <span className="font-mono text-[10px] leading-none">{'</>'}</span>
        </FormatBtn>
        <FormatBtn title="Link" onClick={run(onLink)}>
          <span className="text-[13px] leading-none">🔗</span>
        </FormatBtn>
        <FormatBtn title="Clear formatting" onClick={run(onRemoveFormat)}>
          <span className="text-[10px] leading-none">Tx</span>
        </FormatBtn>

        <FmtDivider />

        <FormatBtn title="Blockquote" active={formatState.blockquote} onClick={run(onBlockquote)}>
          &gt;
        </FormatBtn>
        <FormatBtn title="Bullet list" active={formatState.bulletList} onClick={run(onBulletList)}>
          •
        </FormatBtn>
        <FormatBtn
          title="Numbered list"
          active={formatState.orderedList}
          className="min-w-[2rem] px-1 text-[10px] font-bold"
          onClick={run(onOrderedList)}
        >
          1.
        </FormatBtn>
        <FormatBtn title="Code block" onClick={run(onCodeBlock)}>
          <span className="font-mono text-[10px] leading-none">{'{ }'}</span>
        </FormatBtn>
        <FormatBtn title="Horizontal line" onClick={run(onHorizontalRule)}>
          ―
        </FormatBtn>
        <FormatBtn title="Normal paragraph" active={paragraphActive} onClick={run(onParagraph)}>
          ¶
        </FormatBtn>

        <FmtDivider />

        <FormatBtn title="Undo" onClick={run(onUndo)}>
          ↩
        </FormatBtn>
        <FormatBtn title="Redo" onClick={run(onRedo)}>
          ↪
        </FormatBtn>

        {extraActions ? (
          <>
            <FmtDivider />
            {enhanceExtraActions(extraActions, onActionComplete)}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {[1, 2, 3, 4, 5, 6].map((lvl) => (
          <FormatBtn
            key={`fmt-h${lvl}`}
            title={formatState.heading === lvl ? `Remove heading ${lvl}` : `Heading ${lvl}`}
            active={formatState.heading === lvl}
            className="min-w-[2.15rem] px-1 text-[10px] font-bold"
            onClick={run(() => onHeading?.(lvl))}
          >
            H{lvl}
          </FormatBtn>
        ))}
      </div>
    </div>
  );
}
