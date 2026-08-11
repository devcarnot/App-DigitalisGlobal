'use client';

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import ErpPendingAttachmentChips from './ErpPendingAttachmentChips';
import { ERP_CHAT_EMOJI_CATEGORIES } from '../../lib/erp-chat-emojis';
import { ERP_CHAT_ATTACHMENT_ACCEPT } from '../../lib/erp-upload-limits';
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

function IconFormatT({ className = 'h-5 w-5' }) {
  return (
    <span className={`${className} text-[15px] font-bold leading-none`} aria-hidden>
      T
    </span>
  );
}

function IconAt({ className = 'h-5 w-5' }) {
  return (
    <span className={`${className} text-[15px] font-bold leading-none`} aria-hidden>
      @
    </span>
  );
}

function IconLists({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconFile({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
    </svg>
  );
}

function IconCamera({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h4l2-2h4l2 2h4v11H4V8Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconClose({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
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
  'relative w-full rounded-none border-0 border-t border-slate-200/90 bg-white ' +
  'dark:border-teal-900/40 dark:bg-[#0b141a]';

const SHELL_DRAG =
  'ring-2 ring-inset ring-[#103D4D]/20 dark:ring-teal-500/25 bg-cyan-50/40 dark:bg-teal-950/25';

const COMPOSER_CARD =
  'rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03] ' +
  'dark:border-teal-900/50 dark:bg-[#1a2630] dark:shadow-none dark:ring-teal-900/30';

const COMPOSER_WYS_CLASS =
  '[&_.erp-md-wys]:text-slate-900 [&_.erp-md-wys:empty]:before:!text-slate-400 ' +
  'dark:[&_.erp-md-wys]:text-[#e9edef] dark:[&_.erp-md-wys:empty]:before:!text-teal-200/55';

const SEND_BTN_ACTIVE = 'erp-brand-fill text-white shadow-[0_4px_14px_-4px_rgba(82,196,201,0.55)] hover:brightness-105';

const SEND_BTN_DISABLED =
  'bg-slate-200 text-slate-400 dark:bg-[#243038] dark:text-slate-500 dark:ring-1 dark:ring-teal-900/45';

const PANEL_SECTION_BORDER = 'border-slate-200/80 dark:border-teal-900/45';

const PANEL_TILE_SURFACE =
  'bg-slate-50 text-slate-700 ring-1 ring-slate-200/80 dark:bg-[#0f1820] dark:text-teal-100 dark:ring-teal-900/45';

function ErpChatEmojiSheet({ onPickEmoji, inline = true }) {
  const [categoryId, setCategoryId] = useState('smileys');
  const activeCategory =
    ERP_CHAT_EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? ERP_CHAT_EMOJI_CATEGORIES[1];

  return (
    <>
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
                  ? 'bg-cyan-50 ring-2 ring-cyan-300/45 dark:bg-teal-950/55 dark:ring-teal-500/35'
                  : 'bg-slate-100/90 hover:bg-slate-200/90 dark:bg-[#0f1820] dark:hover:bg-teal-950/40'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
      <div
        className={`min-h-0 overscroll-contain [scrollbar-width:thin] ${inline ? 'max-h-44 overflow-y-auto sm:max-h-48 lg:max-h-52' : 'flex-1 overflow-y-auto'}`}
      >
        <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-10 lg:grid-cols-12">
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
    </>
  );
}

function getToolbarHandlers(toolbar) {
  if (!isValidElement(toolbar)) return {};
  return toolbar.props || {};
}

function ClickUpSectionLabel({ children }) {
  return (
    <p className="mb-2 mt-3 first:mt-0 text-[11px] font-medium text-slate-500 dark:text-teal-200/55">{children}</p>
  );
}

function ClickUpGridTile({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1 transition active:scale-[0.98]"
    >
      <span
        className={`flex h-[4.25rem] w-full items-center justify-center rounded-xl ${PANEL_TILE_SURFACE}`}
      >
        {children}
      </span>
      <span className="max-w-full truncate text-[11px] font-medium text-slate-600 dark:text-teal-200/75">
        {label}
      </span>
    </button>
  );
}

function ToolbarIconBtn({ active, onClick, title, disabled, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition active:scale-95 disabled:opacity-35 ${
        active
          ? 'bg-cyan-50 text-[#103D4D] ring-1 ring-cyan-200/80 shadow-sm dark:bg-teal-950/55 dark:text-teal-100 dark:ring-teal-700/45'
          : 'text-slate-500 hover:bg-slate-50 dark:text-teal-200/70 dark:hover:bg-white/10 dark:hover:text-teal-100'
      }`}
    >
      {children}
    </button>
  );
}

/** ClickUp-style inline expand panel below the composer toolbar. */
function ErpChatClickUpInlinePanel({
  panel,
  toolbar,
  formatState,
  onAttach,
  onCamera,
  onPickEmoji,
}) {
  const h = getToolbarHandlers(toolbar);
  const run = (fn, ...args) => fn?.(...args);

  if (panel === 'emoji') {
    return (
      <div className="border-t border-slate-200/80 px-2 pb-2 pt-2 dark:border-teal-900/45">
        <ClickUpSectionLabel>Emoji</ClickUpSectionLabel>
        <ErpChatEmojiSheet onPickEmoji={onPickEmoji} />
      </div>
    );
  }

  if (panel === 'text') {
    return (
      <div className={`border-t ${PANEL_SECTION_BORDER} px-3 pb-3 pt-1`}>
        <ClickUpSectionLabel>Text</ClickUpSectionLabel>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {[1, 2, 3, 4].map((lvl) => (
            <ClickUpGridTile
              key={`h${lvl}`}
              label={`H${lvl}`}
              onClick={() => run(h.onHeading, lvl)}
            >
              <span className="text-xl font-bold">H{lvl}</span>
            </ClickUpGridTile>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[
            ['Bold', h.onBold, 'B', formatState.bold],
            ['Italic', h.onItalic, 'I', formatState.italic],
            ['Underline', h.onUnderline, 'U', formatState.underline],
            ['Strike', h.onStrikethrough, 'S', formatState.strike],
          ].map(([title, action, label, active]) => (
            <button
              key={title}
              type="button"
              title={title}
              onClick={() => run(action)}
              className={`${chatFmtBtnClass(active)} min-w-[2.25rem]`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'lists') {
    return (
      <div className={`border-t ${PANEL_SECTION_BORDER} px-3 pb-3 pt-1`}>
        <ClickUpSectionLabel>Lists</ClickUpSectionLabel>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          <ClickUpGridTile label="Bullet list" onClick={() => run(h.onBulletList)}>
            <IconLists className="h-6 w-6" />
          </ClickUpGridTile>
          <ClickUpGridTile label="Number list" onClick={() => run(h.onOrderedList)}>
            <span className="text-sm font-bold">1.</span>
          </ClickUpGridTile>
          <ClickUpGridTile label="Quote" onClick={() => run(h.onBlockquote)}>
            <span className="text-2xl leading-none text-pink-400">&ldquo;</span>
          </ClickUpGridTile>
          <ClickUpGridTile label="Check list" onClick={() => run(h.onBulletList)}>
            <span className="text-lg">☑</span>
          </ClickUpGridTile>
        </div>
        <ClickUpSectionLabel>Rich blocks</ClickUpSectionLabel>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          <ClickUpGridTile label="Code block" onClick={() => run(h.onCodeBlock)}>
            <span className="font-mono text-xs">{'{ }'}</span>
          </ClickUpGridTile>
          <ClickUpGridTile label="Quote" onClick={() => run(h.onBlockquote)}>
            <span className="text-2xl leading-none text-pink-400">&ldquo;</span>
          </ClickUpGridTile>
          <ClickUpGridTile label="Divider" onClick={() => run(h.onHorizontalRule)}>
            <span className="text-lg">-</span>
          </ClickUpGridTile>
          <ClickUpGridTile label="Link" onClick={() => run(h.onLink)}>
            <span className="text-lg">🔗</span>
          </ClickUpGridTile>
        </div>
      </div>
    );
  }

  if (panel === 'tools') {
    return (
      <div className={`border-t ${PANEL_SECTION_BORDER} px-3 pb-3 pt-1`}>
        <ClickUpSectionLabel>Attachments</ClickUpSectionLabel>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          <ClickUpGridTile label="File" onClick={onAttach}>
            <IconFile className="h-7 w-7 text-[#589cd5] dark:text-cyan-300" />
          </ClickUpGridTile>
          <ClickUpGridTile label="Camera" onClick={onCamera}>
            <IconCamera className="h-7 w-7" />
          </ClickUpGridTile>
          <ClickUpGridTile label="Gallery" onClick={onAttach}>
            <span className="text-2xl">🖼</span>
          </ClickUpGridTile>
          <ClickUpGridTile label="Attach" onClick={onAttach}>
            <IconPaperclip className="h-6 w-6" />
          </ClickUpGridTile>
        </div>
        <ClickUpSectionLabel>Text</ClickUpSectionLabel>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {[1, 2, 3, 4].map((lvl) => (
            <ClickUpGridTile key={`tools-h${lvl}`} label={`H${lvl}`} onClick={() => run(h.onHeading, lvl)}>
              <span className="text-xl font-bold">H{lvl}</span>
            </ClickUpGridTile>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Unified chat composer. ClickUp-style card with inline toolbar on all screen sizes.
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
  onFilesPicked,
  canSend = false,
  onSend,
  sending = false,
  inflightSends = 0,
  composer,
  toolbar,
  toolbarRef,
  getFormatState,
  onQuickEmoji,
  onMentionClick,
  mentionDisabled = false,
  footerHint = 'Enter to send · Shift+Enter for new line',
  className = '',
  mobileBottomNavOffset = false,
  dockFlush = false,
  viewportDock = false,
}) {
  const [mobileViewport, setMobileViewport] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const keyboardInset = useMobileKeyboardInset(mobileViewport);
  const keyboardLift = keyboardInset > 50 ? keyboardInset : 0;
  const [composerPanel, setComposerPanel] = useState(null);
  const [formatState, setFormatState] = useState({});
  const getFormatStateRef = useRef(getFormatState);
  getFormatStateRef.current = getFormatState;

  const closeComposerPanel = useCallback(() => setComposerPanel(null), []);
  const toggleComposerPanel = useCallback((panel) => {
    setComposerPanel((current) => (current === panel ? null : panel));
  }, []);

  const formatActive =
    composerPanel === 'text' || composerPanel === 'lists' || composerPanel === 'tools';

  useEffect(() => {
    if (!formatActive) {
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
  }, [formatActive, composerPanel]);

  const pickFiles = useCallback(
    (fileList) => {
      const list = fileList ? Array.from(fileList) : [];
      if (!list.length) return;
      if (onFilesPicked) {
        onFilesPicked(list);
        return;
      }
      onAttachClick?.();
    },
    [onAttachClick, onFilesPicked],
  );

  const handleAttach = useCallback(() => {
    // Prefer the parent's dedicated input (often accept="*/*") so uncommon types like .html work.
    if (onAttachClick) {
      onAttachClick();
    } else if (onFilesPicked && galleryInputRef.current) {
      galleryInputRef.current.click();
    }
    closeComposerPanel();
  }, [onAttachClick, onFilesPicked, closeComposerPanel]);

  const handleCamera = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const onCameraChosen = useCallback(
    (e) => {
      pickFiles(e.target.files);
      e.target.value = '';
      closeComposerPanel();
    },
    [pickFiles, closeComposerPanel],
  );

  const sendTitle = sending ? `Sending… ${inflightSends} in background` : 'Send';
  const navBottomPad = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const safeAreaPad = 'env(safe-area-inset-bottom, 0px)';

  const dockPadStyle = (() => {
    if (keyboardLift > 0) {
      const base = mobileBottomNavOffset ? navBottomPad : safeAreaPad;
      return { paddingBottom: `max(${keyboardLift}px, ${base})` };
    }
    if (mobileBottomNavOffset) return { paddingBottom: navBottomPad };
    return undefined;
  })();

  const dockPadClass =
    dockFlush && !mobileBottomNavOffset
      ? viewportDock && mobileViewport
        ? 'pb-[env(safe-area-inset-bottom,0px)]'
        : ''
      : !dockPadStyle && !mobileBottomNavOffset
        ? 'pb-[env(safe-area-inset-bottom,0px)]'
        : '';

  const composerPanelOpen = Boolean(composerPanel);

  const renderComposer = () => (
    <div className="relative z-[1] px-2 py-2 sm:px-3 sm:py-2.5 lg:px-4 lg:py-3">
      <div className={COMPOSER_CARD}>
        <div
          className={`px-3 pt-2.5 sm:px-3.5 sm:pt-3 ${COMPOSER_WYS_CLASS} [&_.erp-md-wys]:text-[15px] sm:[&_.erp-md-wys]:text-sm`}
        >
          {composer}
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 py-1.5 sm:gap-1 sm:px-2 sm:py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ToolbarIconBtn
            active={composerPanel === 'tools'}
            title="Add attachments and more"
            onClick={() => toggleComposerPanel('tools')}
          >
            <IconPlus className="h-[18px] w-[18px]" open={composerPanel === 'tools'} />
          </ToolbarIconBtn>
          <ToolbarIconBtn
            active={composerPanel === 'text'}
            title="Text formatting"
            onClick={() => toggleComposerPanel('text')}
          >
            <IconFormatT className="h-[18px] w-[18px]" />
          </ToolbarIconBtn>
          {onQuickEmoji ? (
            <ToolbarIconBtn
              active={composerPanel === 'emoji'}
              title="Emoji"
              onClick={() => toggleComposerPanel('emoji')}
            >
              <IconEmoji className="h-[18px] w-[18px]" />
            </ToolbarIconBtn>
          ) : null}
          {onMentionClick ? (
            <ToolbarIconBtn
              title="Mention someone"
              disabled={mentionDisabled}
              onClick={() => onMentionClick()}
            >
              <IconAt className="h-[18px] w-[18px]" />
            </ToolbarIconBtn>
          ) : null}
          <ToolbarIconBtn title={attachTitle} onClick={handleAttach}>
            <IconFile className="h-[18px] w-[18px]" />
          </ToolbarIconBtn>
          <ToolbarIconBtn
            active={composerPanel === 'lists'}
            title="Lists and rich blocks"
            onClick={() => toggleComposerPanel('lists')}
          >
            <IconLists className="h-[18px] w-[18px]" />
          </ToolbarIconBtn>
          <span className="min-w-2 flex-1" aria-hidden />
          {composerPanelOpen ? (
            <ToolbarIconBtn title="Close menu" onClick={closeComposerPanel}>
              <IconClose className="h-[16px] w-[16px]" />
            </ToolbarIconBtn>
          ) : null}
          <button
            type="button"
            disabled={!canSend}
            onClick={onSend}
            title={sendTitle}
            aria-label={canSend ? 'Send message' : 'Enter a message to send'}
            className={`sticky right-0 z-[1] ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 sm:h-10 sm:w-10 lg:h-11 lg:w-11 ${
              canSend ? SEND_BTN_ACTIVE : SEND_BTN_DISABLED
            }`}
          >
            <IconSend className="h-[16px] w-[16px] sm:h-[17px] sm:w-[17px]" />
          </button>
        </div>
        {composerPanel ? (
          <div className="max-h-[min(50vh,16rem)] overflow-y-auto overscroll-contain [scrollbar-width:thin] sm:max-h-56 lg:max-h-64">
            <ErpChatClickUpInlinePanel
              panel={composerPanel}
              toolbar={toolbar}
              formatState={formatState}
              onAttach={handleAttach}
              onCamera={handleCamera}
              onPickEmoji={(em) => {
                onQuickEmoji?.(em);
              }}
            />
          </div>
        ) : null}
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onCameraChosen}
      />
      {onFilesPicked ? (
        <input
          ref={galleryInputRef}
          type="file"
          accept={ERP_CHAT_ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={onCameraChosen}
        />
      ) : null}
    </div>
  );

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
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[#103D4D]/45 bg-cyan-50/90 text-[13px] font-bold text-[#103D4D] dark:border-teal-500/50 dark:bg-teal-950/85 dark:text-teal-100">
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

      {renderComposer()}

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

/** Compact formatting chips in the desktop format bar. */
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
          -
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
