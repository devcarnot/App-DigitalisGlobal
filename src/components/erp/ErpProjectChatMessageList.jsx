'use client';

import React, { forwardRef, memo, useEffect, useState } from 'react';
import { getCachedSignedUrl, readCachedSignedUrl } from '../../lib/erp-signed-url-cache';
import { chatPaletteForUser } from '../../lib/erp-chat-colors';
import { canEditChatMessageByAge } from '../../lib/erp-message-edit-window';
import { ERP_CHAT_DELETED_PLACEHOLDER, ERP_CHAT_DELETED_REPLY_SNIPPET } from '../../lib/erp-chat-deleted-copy';
import ChatMessageHtml from './ChatMessageHtml';
import ErpUserAvatar from './ErpUserAvatar';
import { ErpMessageReactionPickerPanel } from './ErpMessageReactions';
import { GroupReceiptTicks } from './ErpChatReceiptTicks';
import { computeMessageSeenBy } from '../../lib/erp-chat-read-receipts';

/** Tiny smiley icon used for the always-visible reaction-launcher button. */
function IconReactionLauncher({ className = 'h-3.5 w-3.5' }) {
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

function normalizeAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((a) => a && typeof a.path === 'string');
  return [];
}

function messageSnippet(m) {
  if (m?.deleted_at) return ERP_CHAT_DELETED_REPLY_SNIPPET;
  const raw = (m?.body || '').trim();
  const atts = normalizeAttachments(m?.attachments);
  if (!raw && atts.length) return atts.length === 1 ? `📎 ${atts[0].name}` : `📎 ${atts.length} files`;
  if (!raw) return 'Message';
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function groupReactionsByEmoji(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!m.has(r.emoji)) m.set(r.emoji, []);
    m.get(r.emoji).push(r);
  }
  return m;
}

/** Signed URL + lazy image for chat (project workspace + gallery).
 *  When `onClick` is supplied, the image acts as a button that triggers the preview flow
 *  instead of opening the raw storage URL in a new tab. */
export function MessageImage({ path, name, onClick }) {
  const [url, setUrl] = useState(() => (path ? readCachedSignedUrl(path) ?? null : null));
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return undefined;
    }
    let alive = true;
    const cached = readCachedSignedUrl(path);
    if (cached !== undefined) {
      setUrl(cached);
      return undefined;
    }
    getCachedSignedUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!url) {
    return <span className="text-[11px] text-slate-500">Loading…</span>;
  }
  const img = (
    <img
      src={url}
      alt={name || ''}
      loading="lazy"
      decoding="async"
      className="max-h-56 max-lg:max-h-44 max-w-full rounded-xl border border-slate-200/80 object-contain shadow-sm"
    />
  );
  if (typeof onClick === 'function') {
    return (
      <button type="button" onClick={onClick} className="block" title={name || ''}>
        {img}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {img}
    </a>
  );
}

const ErpProjectChatMessageList = memo(
  forwardRef(function ErpProjectChatMessageList(
    {
      messages,
      /** True while the active channel is mid-switch — the previous
       *  channel's messages have already been cleared and the new
       *  channel's are still in flight. We render skeleton bubbles in
       *  that window so the chat area doesn't briefly read "No messages
       *  yet." before flipping to real content. */
      loading = false,
      messageById,
      nameMap,
      reactionsByMessageId,
      userId,
      avatarProfileFor,
      chatGlobalModerator,
      reactionPickerFor,
      setReactionPickerFor,
      scrollToMessage,
      toggleReaction,
      startReplyToMessage,
      setChatCtxMenu,
      downloadFile,
      openFilePreview,
      editingMessageId,
      editingDraft,
      onEditingDraftChange,
      onStartEditMessage,
      onCancelEditMessage,
      onSaveEditMessage,
      editMessageBusy,
      onForwardMessage,
      channelReadByUserId = {},
      channelAudienceIds = [],
      onOpenMessageInfo,
    },
    ref,
  ) {
    /** Delayed spinner: we only render the loading affordance after the
     *  fetch has actually been pending for a noticeable amount of time, so
     *  the typical sub-200ms channel switch never paints any placeholder.
     *  Fast loads transition straight from the previous channel to the new
     *  messages with nothing in between. */
    const [showSlowLoadIndicator, setShowSlowLoadIndicator] = useState(false);
    useEffect(() => {
      if (!loading) {
        setShowSlowLoadIndicator(false);
        return undefined;
      }
      const t = setTimeout(() => setShowSlowLoadIndicator(true), 350);
      return () => clearTimeout(t);
    }, [loading]);

    return (
      <div
        ref={ref}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto px-3 py-3 sm:px-4 max-lg:px-2.5 max-lg:py-2 space-y-3 max-lg:space-y-2 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
      >
        {messages.length === 0 ? (
          loading ? (
            // Fetch still in flight. We render absolutely nothing for the
            // first 350ms so a typical (sub-200ms) channel switch never
            // paints a placeholder at all — the previous channel's
            // messages simply unmount and the new ones mount cleanly with
            // no visible "wrong screen" in between. After 350ms a small
            // centred spinner appears so genuinely slow loads still have
            // a visible affordance.
            showSlowLoadIndicator ? (
              <div
                aria-hidden
                className="flex flex-1 items-center justify-center py-10 max-lg:py-6"
              >
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#103D4D] dark:border-slate-800 dark:border-t-teal-300" />
              </div>
            ) : null
          ) : (
            <p className="text-slate-500 text-xs max-lg:text-[11px] text-center py-10 max-lg:py-6">No messages yet.</p>
          )
        ) : (
          messages.map((m) => {
            const mine = m.user_id === userId;
            const label = nameMap[m.user_id] || 'Member';
            const pal = chatPaletteForUser(m.user_id, mine);
            const atts = normalizeAttachments(m.attachments);
            const deleted = Boolean(m.deleted_at);
            const hasText = !deleted && Boolean(m.body && String(m.body).trim());
            const parent = m.reply_to_id ? messageById[m.reply_to_id] : null;
            const parentLabel = parent ? nameMap[parent.user_id] || 'Member' : null;
            const reactRows = reactionsByMessageId[m.id] || [];
            const byEmoji = groupReactionsByEmoji(reactRows);
            const myReactedEmojis = new Set(
              reactRows.filter((row) => row.user_id === userId).map((row) => row.emoji),
            );
            const canEditMine = mine && !deleted && canEditChatMessageByAge(m.created_at);
            const editingThis = editingMessageId === m.id;
            const seenSummary =
              mine && !deleted
                ? computeMessageSeenBy({
                    messageCreatedAt: m.created_at,
                    readStatesByUserId: channelReadByUserId,
                    audienceUserIds: channelAudienceIds,
                    excludeUserId: userId,
                    nameById: nameMap,
                  })
                : null;
            const openMessageContextMenu = !deleted;
            return (
              <div
                key={m.id}
                id={`erp-chat-msg-${m.id}`}
                className={`flex gap-3 max-lg:gap-2 ${mine ? 'flex-row-reverse' : ''}`}
              >
                <span className="relative inline-flex shrink-0">
                  <ErpUserAvatar profile={avatarProfileFor(m.user_id)} size="sm" alt="" className="shadow-none ring-1 ring-slate-200/80" />
                </span>
                <div className={`min-w-0 max-w-[min(100%,26rem)] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className={`relative inline-block max-w-full ${mine ? 'text-right' : ''}`}>
                    <div
                      className={`inline-block rounded-xl px-3 py-2 max-lg:px-2.5 max-lg:py-1.5 text-left text-sm max-lg:text-[13px] shadow-sm ${pal.bubble}`}
                      onContextMenu={
                        openMessageContextMenu
                          ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setChatCtxMenu({ x: e.clientX, y: e.clientY, messageId: m.id });
                            }
                          : undefined
                      }
                    >
                      <p className={`text-[10px] max-lg:text-[9px] font-semibold mb-0.5 ${pal.label}`}>{label}</p>
                      {m.reply_to_id && (
                        <button
                          type="button"
                          onClick={() => scrollToMessage(m.reply_to_id)}
                          className={`mb-2 w-full rounded-xl border border-slate-200/80 bg-black/[0.03] px-3 py-2 max-lg:px-2 max-lg:py-1.5 text-left text-xs max-lg:text-[11px] transition hover:bg-black/[0.06] dark:border-teal-900/35 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] ${mine ? 'text-right' : ''}`}
                        >
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {parentLabel ? `Reply to ${parentLabel}` : 'Reply'}
                          </span>
                          <span className={`mt-0.5 line-clamp-2 text-slate-600 dark:text-slate-300 ${mine ? 'text-right' : ''}`}>
                            {parent ? messageSnippet(parent) : 'Original message unavailable'}
                          </span>
                        </button>
                      )}
                      {editingThis ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editingDraft}
                            onChange={(e) => onEditingDraftChange?.(e.target.value)}
                            rows={3}
                            className={`w-full min-h-[4.5rem] resize-y rounded-lg border px-2.5 py-2 text-xs max-lg:text-[11px] outline-none ${mine ? 'border-white/40 bg-black/25 text-white placeholder:text-white/50' : 'border-slate-300 bg-white text-slate-900'}`}
                            disabled={editMessageBusy}
                            aria-label="Edit message"
                          />
                          <div className={`flex flex-wrap gap-2 ${mine ? 'justify-end' : ''}`}>
                            <button
                              type="button"
                              disabled={editMessageBusy}
                              onClick={() => onCancelEditMessage?.()}
                              className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-white/25 hover:bg-white/20 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={editMessageBusy}
                              onClick={() => onSaveEditMessage?.()}
                              className="rounded-lg bg-[#B2EBF2] px-2.5 py-1 text-[11px] font-bold text-[#0d3442] hover:bg-cyan-200 disabled:opacity-50"
                            >
                              {editMessageBusy ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : deleted ? (
                        <p
                          className={`text-xs max-lg:text-[11px] italic ${mine ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          {ERP_CHAT_DELETED_PLACEHOLDER}
                        </p>
                      ) : hasText ? (
                        <ChatMessageHtml
                          text={m.body}
                          onMediaOpen={
                            openFilePreview
                              ? ({ url, name }) =>
                                  openFilePreview({ url, name, mime: null })
                              : undefined
                          }
                          className="!text-xs max-lg:!text-[11px] max-lg:!leading-snug"
                        />
                      ) : null}
                      {!deleted && atts.length > 0 && (
                        <div className={hasText || editingThis ? 'mt-3 space-y-2' : 'space-y-2'}>
                          {atts.map((a) => (
                            <div key={a.path} className="text-left">
                              {a.mime?.startsWith('image/') ? (
                                <MessageImage
                                  path={a.path}
                                  name={a.name}
                                  onClick={openFilePreview ? () => openFilePreview(a) : undefined}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => (openFilePreview ? openFilePreview(a) : downloadFile(a.path))}
                                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 max-lg:px-2 max-lg:py-1.5 text-sm max-lg:text-xs font-medium text-[#103D4D] hover:bg-slate-50"
                                >
                                  <span aria-hidden>📎</span>
                                  <span className="truncate max-w-[200px]">{a.name}</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!deleted && !hasText && atts.length === 0 && !editingThis && (
                        <p className="text-slate-500 text-sm max-lg:text-xs italic">Empty message</p>
                      )}
                      <p className="text-[10px] max-lg:text-[9px] text-slate-500 mt-2 tabular-nums flex flex-wrap items-center gap-1.5">
                        <span>
                          {new Date(m.created_at).toLocaleString()}
                          {m.edited_at ? ' · Edited' : ''}
                        </span>
                        {mine && !deleted ? (
                          <GroupReceiptTicks
                            seenCount={seenSummary?.seenCount || 0}
                            totalCount={seenSummary?.totalCount || 0}
                            onClick={() => onOpenMessageInfo?.(m)}
                          />
                        ) : null}
                      </p>
                    </div>

                    {!deleted ? (
                      <>
                        {/* Always-visible small launcher button. Clicking it
                            toggles the actions panel (Reply + Edit + Quick
                            reactions + More) anchored below the bubble. */}
                        <button
                          type="button"
                          aria-label="Message actions"
                          aria-haspopup="dialog"
                          aria-expanded={reactionPickerFor === m.id}
                          onClick={() =>
                            setReactionPickerFor((prev) => (prev === m.id ? null : m.id))
                          }
                          data-erp-reaction-anchor
                          className={`absolute -bottom-2.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition active:scale-[0.95] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100 ${
                            reactionPickerFor === m.id
                              ? 'border-[#103D4D]/45 text-[#103D4D] dark:border-teal-500/50 dark:text-teal-100'
                              : 'border-slate-200'
                          } ${mine ? '-left-2.5' : '-right-2.5'}`}
                        >
                          <IconReactionLauncher className="h-3.5 w-3.5" />
                        </button>
                        {typeof onForwardMessage === 'function' ? (
                          <button
                            type="button"
                            aria-label="Forward message"
                            onClick={() => onForwardMessage(m)}
                            className={`absolute -bottom-2.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition active:scale-[0.95] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430] dark:hover:text-teal-100 ${
                              mine ? '-left-10' : '-right-10'
                            }`}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M4 18v-4a4 4 0 014-4h12" />
                            </svg>
                          </button>
                        ) : null}

                        {reactionPickerFor === m.id ? (
                          <div
                            role="dialog"
                            aria-label="Message actions"
                            data-erp-reaction-anchor
                            className={`absolute top-full z-30 mt-1 flex max-w-[min(100vw-2rem,20rem)] flex-col gap-1 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_38px_rgba(15,23,42,0.16)] ring-1 ring-black/5 dark:border-teal-800/55 dark:bg-[#0f1820] dark:ring-teal-950/40 ${
                              mine ? 'right-0' : 'left-0'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200/80 px-1.5 py-1 dark:border-teal-800/45">
                              <button
                                type="button"
                                onClick={() => startReplyToMessage(m)}
                                className="shrink-0 rounded-lg border border-transparent bg-white/0 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-none hover:border-slate-200 hover:bg-white hover:text-[#103D4D] dark:text-slate-300 dark:hover:border-teal-800/60 dark:hover:bg-[#152028] dark:hover:text-teal-100"
                              >
                                Reply
                              </button>
                              {canEditMine && !editingThis ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onStartEditMessage?.(m);
                                    setReactionPickerFor(null);
                                  }}
                                  className="shrink-0 rounded-lg border border-transparent bg-white/0 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-none hover:border-slate-200 hover:bg-white hover:text-[#103D4D] dark:text-slate-300 dark:hover:border-teal-800/60 dark:hover:bg-[#152028] dark:hover:text-teal-100"
                                >
                                  Edit
                                </button>
                              ) : null}
                            </div>
                            <ErpMessageReactionPickerPanel
                              reactedEmojis={myReactedEmojis}
                              onPick={(emoji) => {
                                void toggleReaction(m.id, emoji);
                                setReactionPickerFor(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  {!deleted && byEmoji.size > 0 && (
                    <div
                      className={`relative z-30 mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      {[...byEmoji.entries()].map(([emoji, list]) => {
                        const mineReacted = list.some((r) => r.user_id === userId);
                        const names = list
                          .map((r) => nameMap[r.user_id] || 'Member')
                          .filter(Boolean)
                          .join(', ');
                        return (
                          <button
                            key={`${m.id}-r-${emoji}`}
                            type="button"
                            title={names}
                            onClick={() => void toggleReaction(m.id, emoji)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition ${
                              mineReacted
                                ? 'border-[#103D4D]/40 bg-[#B2EBF2]/40 text-[#0d3442]'
                                : 'border-slate-200/90 bg-white text-slate-700 hover:border-[#103D4D]/25'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="tabular-nums text-[10px] text-slate-500">{list.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }),
);

ErpProjectChatMessageList.displayName = 'ErpProjectChatMessageList';

export default ErpProjectChatMessageList;
