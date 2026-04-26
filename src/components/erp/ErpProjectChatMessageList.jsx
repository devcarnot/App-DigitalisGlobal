'use client';

import React, { forwardRef, memo, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { chatPaletteForUser } from '../../lib/erp-chat-colors';
import ChatMessageHtml from './ChatMessageHtml';
import ErpUserAvatar from './ErpUserAvatar';

const CHAT_QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀'];
const CHAT_EMOJI_PICKER = ['😀', '😁', '😂', '😊', '😍', '👍', '🎉', '🙏', '🔥', '✅', '📌', '📎', '⚡', '💡', '😅', '🤝'];

function normalizeAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((a) => a && typeof a.path === 'string');
  return [];
}

function messageSnippet(m) {
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
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.storage
      .from('erp-files')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (!error && data?.signedUrl) setUrl(data.signedUrl);
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
      messageById,
      nameMap,
      reactionsByMessageId,
      userId,
      avatarProfileFor,
      canRemoveProjectMembers,
      reactionPickerFor,
      setReactionPickerFor,
      scrollToMessage,
      toggleReaction,
      startReplyToMessage,
      setChatCtxMenu,
      downloadFile,
      openFilePreview,
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 max-lg:px-2.5 max-lg:py-2 space-y-3 max-lg:space-y-2 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
      >
        {messages.length === 0 ? (
          <p className="text-slate-500 text-xs max-lg:text-[11px] text-center py-10 max-lg:py-6">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === userId;
            const label = nameMap[m.user_id] || 'Member';
            const pal = chatPaletteForUser(m.user_id, mine);
            const atts = normalizeAttachments(m.attachments);
            const hasText = Boolean(m.body && String(m.body).trim());
            const parent = m.reply_to_id ? messageById[m.reply_to_id] : null;
            const parentLabel = parent ? nameMap[parent.user_id] || 'Member' : null;
            const reactRows = reactionsByMessageId[m.id] || [];
            const byEmoji = groupReactionsByEmoji(reactRows);
            return (
              <div
                key={m.id}
                id={`erp-chat-msg-${m.id}`}
                className={`group/msg flex gap-3 max-lg:gap-2 supports-[content-visibility]:[content-visibility:auto] supports-[content-visibility]:[contain-intrinsic-size:auto_120px] ${mine ? 'flex-row-reverse' : ''}`}
              >
                <span className="relative inline-flex shrink-0">
                  <ErpUserAvatar profile={avatarProfileFor(m.user_id)} size="sm" alt="" className="shadow-none ring-1 ring-slate-200/80" />
                </span>
                <div className={`min-w-0 max-w-[min(100%,26rem)] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className={`relative inline-block max-w-full ${mine ? 'text-right' : ''}`}>
                    <div
                      className={`inline-block rounded-xl px-3 py-2 max-lg:px-2.5 max-lg:py-1.5 text-left text-sm max-lg:text-[13px] shadow-sm ${pal.bubble}`}
                      onContextMenu={
                        canRemoveProjectMembers
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
                          className={`mb-2 w-full rounded-xl border border-slate-200/80 bg-black/[0.03] px-3 py-2 max-lg:px-2 max-lg:py-1.5 text-left text-xs max-lg:text-[11px] transition hover:bg-black/[0.06] ${mine ? 'text-right' : ''}`}
                        >
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {parentLabel ? `Reply to ${parentLabel}` : 'Reply'}
                          </span>
                          <span className={`mt-0.5 line-clamp-2 text-slate-600 ${mine ? 'text-right' : ''}`}>
                            {parent ? messageSnippet(parent) : 'Original message unavailable'}
                          </span>
                        </button>
                      )}
                      {hasText && (
                        <ChatMessageHtml
                          text={m.body}
                          className="!text-xs max-lg:!text-[11px] max-lg:!leading-snug"
                        />
                      )}
                      {atts.length > 0 && (
                        <div className={hasText ? 'mt-3 space-y-2' : 'space-y-2'}>
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
                      {!hasText && atts.length === 0 && (
                        <p className="text-slate-500 text-sm max-lg:text-xs italic">Empty message</p>
                      )}
                      <p className="text-[10px] max-lg:text-[9px] text-slate-500 mt-2 tabular-nums">
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div
                      className={`absolute top-full z-20 mt-0.5 flex max-w-[min(100vw-2rem,26rem)] flex-nowrap items-center gap-1 rounded-lg bg-white/95 px-0.5 py-0.5 shadow-sm ring-1 ring-slate-200/80 backdrop-blur-sm transition-opacity duration-150 motion-reduce:transition-none ${
                        mine ? 'right-0' : 'left-0'
                      } ${
                        reactionPickerFor === m.id
                          ? 'opacity-100'
                          : 'opacity-0 pointer-events-none [pointer:coarse]:pointer-events-auto [pointer:coarse]:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100'
                      }`}
                      data-erp-reaction-anchor
                    >
                      <button
                        type="button"
                        onClick={() => startReplyToMessage(m)}
                        className="shrink-0 rounded-lg border border-transparent bg-white/0 px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-none hover:border-slate-200 hover:bg-white hover:text-[#103D4D]"
                      >
                        Reply
                      </button>
                      {CHAT_QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={`${m.id}-q-${emoji}`}
                          type="button"
                          onClick={() => void toggleReaction(m.id, emoji)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-sm shadow-sm hover:border-[#103D4D]/35 hover:bg-slate-50"
                          title={`React ${emoji}`}
                          aria-label={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <div className="relative shrink-0" data-erp-reaction-anchor>
                        <button
                          type="button"
                          onClick={() => setReactionPickerFor((prev) => (prev === m.id ? null : m.id))}
                          className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-1.5 text-xs font-bold text-slate-500 hover:border-[#103D4D]/40 hover:text-[#103D4D]"
                          title="More reactions"
                          aria-label="More reactions"
                        >
                          +
                        </button>
                        {reactionPickerFor === m.id && (
                          <div className="absolute z-30 mb-1 w-[240px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl bottom-full left-0 sm:left-auto sm:right-0">
                            <p className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">React</p>
                            <div className="grid grid-cols-8 gap-1.5 px-1 pb-1">
                              {CHAT_EMOJI_PICKER.map((e) => (
                                <button
                                  key={e}
                                  type="button"
                                  className="h-8 w-8 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100"
                                  onClick={() => {
                                    void toggleReaction(m.id, e);
                                    setReactionPickerFor(null);
                                  }}
                                  aria-label={`React ${e}`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {byEmoji.size > 0 && (
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
