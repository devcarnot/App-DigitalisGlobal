'use client';

import React, { forwardRef, memo, useEffect, useState } from 'react';
import {
  getErpFileSignedUrl,
  readCachedSignedUrl,
} from '../../lib/erp-signed-url-cache';
import { useLazyVisible } from '../../lib/use-lazy-visible';
import { canEditChatMessageByAge } from '../../lib/erp-message-edit-window';
import { ERP_CHAT_DELETED_PLACEHOLDER, ERP_CHAT_DELETED_REPLY_SNIPPET } from '../../lib/erp-chat-deleted-copy';
import { allowNativeLinkContextMenu } from '../../lib/erp-chat-link-context';
import { chatMessageBodyToCopyPlain, chatMessageCopyLinkLabel, chatMessageLinksToCopyText } from '../../lib/erp-chat-copy-plain';
import { copyRichTextBody } from '../../lib/erp-chat-copy-rich';
import {
  ERP_WA_LAUNCHER_COL_PROJECT,
  ERP_WA_MSG_MAX,
  ERP_WA_THREAD_CLASS,
  erpWaBubbleBodyClass,
  erpWaBubbleClass,
  erpWaBubbleRowClass,
  erpWaMessageRowClass,
  erpWaMetaClass,
  erpWaReadMoreClass,
  erpWaReplyQuoteClass,
} from '../../lib/erp-whatsapp-chat-styles';
import ChatMessageHtml from './ChatMessageHtml';
import ErpUserAvatar from './ErpUserAvatar';
import {
  ErpMessageActionsMenu,
  ErpMessageReactionLauncher,
  ErpMessageReactionsBar,
} from './ErpMessageReactions';
import ErpChatMessageEditBox from './ErpChatMessageEditBox';
import { GroupReceiptTicks } from './ErpChatReceiptTicks';
import { computeMessageSeenBy } from '../../lib/erp-chat-read-receipts';

const CLUSTER_MS = 5 * 60 * 1000;

function projectMessageCopyPlain(m) {
  if (!m || m.deleted_at) return '';
  const t = chatMessageBodyToCopyPlain(m.body);
  if (t) return t;
  const atts = normalizeAttachments(m.attachments);
  if (!atts.length) return '';
  return atts
    .map((a) => String(a.name || '').trim())
    .filter(Boolean)
    .join('\n');
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

/** Signed URL + lazy image for chat (project workspace + gallery). */
export function MessageImage({ path, name, onClick, imageClassName }) {
  const { ref, visible } = useLazyVisible();
  const [url, setUrl] = useState(() => (path ? readCachedSignedUrl(path) ?? null : null));
  useEffect(() => {
    if (!path || !visible) {
      return undefined;
    }
    let alive = true;
    const cached = readCachedSignedUrl(path);
    if (cached !== undefined) {
      setUrl(cached);
      if (cached) return undefined;
    }
    (async () => {
      const signed = await getErpFileSignedUrl(path, { preferApi: true });
      if (alive) setUrl(signed);
    })();
    return () => {
      alive = false;
    };
  }, [path, visible]);

  if (!url) {
    return (
      <span ref={ref} className="inline-block h-24 min-w-[8rem] animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-700/50" />
    );
  }
  const img = (
    <img
      src={url}
      alt={name || ''}
      loading="lazy"
      decoding="async"
      className={
        imageClassName ||
        'max-h-56 max-lg:max-h-44 max-w-full rounded-xl border border-slate-200/80 object-contain shadow-sm dark:border-teal-900/45'
      }
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
      loading = false,
      messageById,
      nameMap,
      reactionsByMessageId,
      userId,
      avatarProfileFor,
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
      onDeleteMessage,
      chatGlobalModerator = false,
      channelReadByUserId = {},
      channelAudienceIds = [],
      onOpenMessageInfo,
      pinnedMessageIds = null,
      pinsEnabled = true,
      onPinMessage,
      onUnpinMessage,
    },
    ref,
  ) {
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
      <div ref={ref} className={ERP_WA_THREAD_CLASS}>
        {messages.length === 0 ? (
          loading ? (
            showSlowLoadIndicator ? (
              <div aria-hidden className="flex flex-1 items-center justify-center py-10 max-lg:py-6">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#103D4D] dark:border-slate-800 dark:border-t-teal-300" />
              </div>
            ) : null
          ) : (
            <p className="py-10 text-center text-xs text-slate-500 max-lg:py-6 max-lg:text-[11px] dark:text-slate-400">
              No messages yet.
            </p>
          )
        ) : (
          messages.map((m, idx) => {
            const mine = m.user_id === userId;
            const label = nameMap[m.user_id] || 'Member';
            const atts = normalizeAttachments(m.attachments);
            const deleted = Boolean(m.deleted_at);
            const hasText = !deleted && Boolean(m.body && String(m.body).trim());
            const parent = m.reply_to_id ? messageById[m.reply_to_id] : null;
            const parentLabel = parent ? nameMap[parent.user_id] || 'Member' : null;
            const msgReactions = reactionsByMessageId[m.id] || [];
            const myReactedEmojis = new Set(
              msgReactions.filter((row) => row.user_id === userId).map((row) => row.emoji),
            );
            const canEditMine = mine && !deleted && canEditChatMessageByAge(m.created_at);
            const editingThis = editingMessageId === m.id;
            const canReactToMsg = Boolean(userId) && !deleted && !editingThis;
            const canDeleteMsg = !deleted && (mine || chatGlobalModerator);
            const brandSent = mine;
            const copyText = projectMessageCopyPlain(m);
            const copyLinksText = m.body ? chatMessageLinksToCopyText(m.body) : '';
            const isPinnedMsg = pinnedMessageIds?.has?.(m.id);
            const canPinMsg = pinsEnabled && !deleted;
            const prev = idx > 0 ? messages[idx - 1] : null;
            const clusterStart =
              !prev ||
              prev.user_id !== m.user_id ||
              Date.parse(m.created_at) - Date.parse(prev.created_at) > CLUSTER_MS;
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

            const reactionsBar =
              msgReactions.length > 0 ? (
                <ErpMessageReactionsBar
                  rows={msgReactions}
                  viewerId={userId}
                  mine={mine}
                  onToggle={canReactToMsg ? (emoji) => void toggleReaction(m.id, emoji) : undefined}
                  nameById={nameMap}
                />
              ) : null;

            const reactionLauncherEl = canReactToMsg ? (
              <ErpMessageReactionLauncher
                mine={mine}
                reactedEmojis={myReactedEmojis}
                onPick={(emoji) => void toggleReaction(m.id, emoji)}
              />
            ) : null;

            const actionsMenuEl = !deleted ? (
              <ErpMessageActionsMenu
                mine={mine}
                showCopy={Boolean(copyText)}
                showCopyLink={Boolean(copyLinksText)}
                copyLinkLabel={m.body ? chatMessageCopyLinkLabel(m.body) : 'Copy link'}
                showPin={canPinMsg && !isPinnedMsg}
                showUnpin={canPinMsg && isPinnedMsg}
                showReply
                showForward={typeof onForwardMessage === 'function'}
                showInfo={mine}
                showEdit={canEditMine && !editingThis}
                showDelete={canDeleteMsg}
                onCopy={() => void copyRichTextBody(m.body).catch(() => {})}
                onCopyLink={() => void navigator.clipboard?.writeText(copyLinksText).catch(() => {})}
                onPin={() => onPinMessage?.(m)}
                onUnpin={() => onUnpinMessage?.(m)}
                onReply={() => startReplyToMessage(m)}
                onForward={typeof onForwardMessage === 'function' ? () => onForwardMessage(m) : undefined}
                onInfo={mine ? () => onOpenMessageInfo?.(m) : undefined}
                onEdit={canEditMine ? () => onStartEditMessage?.(m) : undefined}
                onDelete={canDeleteMsg ? () => onDeleteMessage?.(m) : undefined}
              />
            ) : null;

            const launcherStack =
              reactionLauncherEl || actionsMenuEl ? (
                <div className={ERP_WA_LAUNCHER_COL_PROJECT}>
                  {actionsMenuEl}
                  {reactionLauncherEl}
                </div>
              ) : null;

            const bubble = (
              <div
                className={erpWaBubbleClass(mine, brandSent)}
                onContextMenu={
                  openMessageContextMenu
                    ? (e) => {
                        if (allowNativeLinkContextMenu(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setChatCtxMenu({ x: e.clientX, y: e.clientY, messageId: m.id });
                      }
                    : undefined
                }
              >
                {!editingThis && !deleted && m.reply_to_id ? (
                  <button
                    type="button"
                    onClick={() => scrollToMessage(m.reply_to_id)}
                    className={erpWaReplyQuoteClass(mine, brandSent)}
                  >
                    <span className={`block text-[11px] font-semibold ${brandSent ? 'text-white/90' : 'text-[#027eb5] dark:text-[#53bdeb]'}`}>
                      {parentLabel ? `Reply to ${parentLabel}` : 'Reply'}
                    </span>
                    <span className="mt-0.5 line-clamp-2 opacity-90">
                      {parent ? messageSnippet(parent) : 'Original message unavailable'}
                    </span>
                  </button>
                ) : null}
                {editingThis ? (
                  <ErpChatMessageEditBox
                    value={editingDraft}
                    format={m.body_format || 'markdown'}
                    onChange={onEditingDraftChange}
                    onCancel={onCancelEditMessage}
                    onSave={onSaveEditMessage}
                    busy={editMessageBusy}
                    mine={mine}
                  />
                ) : deleted ? (
                  <p className={`text-sm italic opacity-70 ${mine ? '' : 'text-slate-500 dark:text-slate-400'}`}>
                    {ERP_CHAT_DELETED_PLACEHOLDER}
                  </p>
                ) : hasText ? (
                  <ChatMessageHtml
                    text={m.body}
                    format={m.body_format || 'markdown'}
                    onMediaOpen={
                      openFilePreview
                        ? ({ url, name }) => openFilePreview({ url, name, mime: null })
                        : undefined
                    }
                    readMore
                    readMoreClassName={erpWaReadMoreClass(mine, brandSent)}
                    className={`chat-md ${erpWaBubbleBodyClass(mine, brandSent)}`}
                  />
                ) : null}
                {!deleted && atts.length > 0 && (
                  <div className={hasText || editingThis ? 'mt-1.5 space-y-1.5' : 'space-y-1.5'}>
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
                            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-medium text-[#103D4D] hover:bg-slate-50 dark:border-teal-900/45 dark:bg-[#0f1820] dark:text-teal-100 dark:hover:bg-[#162430]"
                          >
                            <span aria-hidden>📎</span>
                            <span className="truncate">{a.name}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!deleted && !hasText && atts.length === 0 && !editingThis && (
                  <p className="text-sm italic text-slate-500 dark:text-slate-400">Empty message</p>
                )}
                {!editingThis ? (
                  <div className={`mt-0.5 flex flex-wrap items-end gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                    <p className={erpWaMetaClass(mine, brandSent)}>
                      {new Date(m.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {m.edited_at ? ' · Edited' : ''}
                    </p>
                    {mine && !deleted ? (
                      <GroupReceiptTicks
                        seenCount={seenSummary?.seenCount || 0}
                        totalCount={seenSummary?.totalCount || 0}
                        mineTone
                        onClick={() => onOpenMessageInfo?.(m)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );

            if (mine) {
              return (
                <div key={m.id} id={`erp-chat-msg-${m.id}`} className={erpWaMessageRowClass(true)}>
                  <div className={`flex min-w-0 ${ERP_WA_MSG_MAX} flex-col items-end`}>
                    <div className={erpWaBubbleRowClass(true)}>
                      {launcherStack}
                      <div className="min-w-0 max-w-full">{bubble}</div>
                    </div>
                    {reactionsBar}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} id={`erp-chat-msg-${m.id}`} className={`${erpWaMessageRowClass(false)} gap-2`}>
                <div className="flex w-9 shrink-0 flex-col justify-end pb-0.5">
                  {clusterStart ? (
                    <ErpUserAvatar
                      profile={avatarProfileFor(m.user_id)}
                      size="sm"
                      alt=""
                      className="!h-9 !w-9 shadow-none ring-1 ring-slate-200/80 dark:ring-teal-900/45"
                    />
                  ) : (
                    <span className="block h-1 w-9 shrink-0" aria-hidden />
                  )}
                </div>
                <div className={`min-w-0 ${ERP_WA_MSG_MAX} flex flex-col items-start`}>
                  {clusterStart ? (
                    <p className="mb-0.5 pl-0.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">{label}</p>
                  ) : null}
                  <div className={erpWaBubbleRowClass(false)}>
                    <div className="min-w-0 max-w-full">{bubble}</div>
                    {launcherStack}
                  </div>
                  {reactionsBar}
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
