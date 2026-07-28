'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { isSupabaseSchemaMissingError } from '../../lib/supabase-errors';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { getCachedSignedUrl, primeCachedSignedUrl } from '../../lib/erp-signed-url-cache';
import { readErpDataCache, writeErpDataCache, hasErpDataCache } from '../../lib/erp-data-cache';
import { erpWorkspaceSubtitle } from '../../lib/erp-roles';
import ErpUserAvatar from './ErpUserAvatar';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';
import ChatMessageHtml from './ChatMessageHtml';
import ErpChatMessageEditBox from './ErpChatMessageEditBox';
import ErpMarkdownWysComposer from './ErpMarkdownWysComposer';
import ErpChatComposer, { ErpChatFormatToolbar, chatFmtBtnClass } from './ErpChatComposer';
import ErpChatMentionPicker from './ErpChatMentionPicker';
import ErpBodyPortal from './ErpBodyPortal';
import { erpCaretOffsetInInnerText, erpReplaceInnerTextSlice } from '../../lib/erp-contenteditable-selection';
import ErpTeamDirectoryGrid from './ErpTeamDirectoryGrid';
import { useErpSession } from './useErpSession';
const ErpConfirmDialog = dynamic(() => import('./ErpConfirmDialog'), { ssr: false, loading: () => null });
const ErpFilePreviewModal = dynamic(() => import('./ErpFilePreviewModal'), { ssr: false, loading: () => null });
const ErpChatImageAlbum = dynamic(() => import('./ErpChatImageAlbum'), { ssr: false, loading: () => null });
const ErpForwardMessageModal = dynamic(() => import('./ErpForwardMessageModal'), {
  ssr: false,
  loading: () => null,
});
const ErpChatMessageInfoModal = dynamic(() => import('./ErpChatMessageInfoModal'), {
  ssr: false,
  loading: () => null,
});
import { erpModalPanelMaxWidthClass, ErpInlineErrorAlert } from './ErpModalFormPrimitives';
import { useErpErrorToast } from '../../lib/use-erp-error-toast';
import { downloadFromSignedUrlWithFallback } from '../../lib/browser-download';
import { buildChatImageGallery, isChatImagePreviewItem, mergePreviewWithGallery } from '../../lib/erp-chat-image-gallery';
import { canEditChatMessageByAge } from '../../lib/erp-message-edit-window';
import { ERP_CHAT_DELETED_PLACEHOLDER, ERP_CHAT_DELETED_REPLY_SNIPPET } from '../../lib/erp-chat-deleted-copy';
import { allowNativeLinkContextMenu, isNativeLinkContextTarget } from '../../lib/erp-chat-link-context';
import {
  isDmConversationPinned,
  readPinnedDmConversations,
  sortDmConversations,
  subscribePinnedDmConversations,
  togglePinDmConversation,
} from '../../lib/erp-pinned-chats';
import ErpIconPin from './ErpIconPin';
import ErpPinnedMessagesBar from './ErpPinnedMessagesBar';
import {
  dmThreadKey,
  loadDmMessagePins,
  loadGroupMessagePins,
  pinDmMessage,
  pinGroupMessage,
  pinRowMessageId,
  unpinChatMessage,
} from '../../lib/erp-message-pins';
import { computeMessageSeenBy, messageReadByCursor } from '../../lib/erp-chat-read-receipts';
import { ERP_DARK_MENU_PORTAL } from '../../lib/erp-dark-surfaces';
import {
  loadDmReactionsForMessages,
  loadGroupReactionsForMessages,
  toggleMessageReaction,
} from '../../lib/erp-message-reactions';
import {
  ErpMessageActionsMenu,
  ErpMessageReactionLauncher,
  ErpMessageReactionsBar,
} from './ErpMessageReactions';
import { DmReceiptTicks, GroupReceiptTicks } from './ErpChatReceiptTicks';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB, withGuessedErpFileMime } from '../../lib/erp-upload-limits';
import { messageToForwardSource } from '../../lib/erp-forward-message';
import { collectFilesFromDataTransfer, mergeUniqueFiles } from '../../lib/erp-clipboard-images';
import {
  ERP_WA_LAUNCHER_COL,
  ERP_WA_MSG_MAX,
  ERP_WA_THREAD_CLASS,
  erpWaBubbleBodyClass,
  erpWaBubbleClass,
  erpWaBubbleRowClass,
  erpWaMessageRowClass,
  erpWaMetaClass,
  erpWaReadMoreClass,
  erpWaReplyQuoteClass,
  ERP_WA_COMPOSER_SHELL,
} from '../../lib/erp-whatsapp-chat-styles';

const ErpJitsiCallModal = dynamic(() => import('./ErpJitsiCallModal'), { ssr: false });

function displayName(u) {
  return (u?.full_name && String(u.full_name).trim()) || 'User';
}

const DM_MAX_FILE_BYTES = ERP_MAX_UPLOAD_BYTES;
/** Max files attached to one DM or group message. */
const DM_MAX_FILES = 10;
/** Mobile: hold to open message actions; swipe right to reply (WhatsApp-style). */
const MSG_LONG_PRESS_MS = 500;
const MSG_SWIPE_REPLY_TRIGGER_PX = 48;
const MSG_SWIPE_REPLY_MAX_PX = 72;
const FILE_INPUT_ACCEPT = '*/*';

function dmPairFolder(a, b) {
  return a < b ? `dm/${a}/${b}` : `dm/${b}/${a}`;
}

function groupFolder(groupId) {
  return `groups/${groupId}`;
}

function safeFileBase(name) {
  const s = String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 100);
  return s || 'file';
}

function normalizeMessageAttachments(m) {
  if (!m) return [];
  if (Array.isArray(m.attachments) && m.attachments.length) {
    return m.attachments
      .map((a) => ({
        path: String(a?.path || '').trim(),
        name: String(a?.name || 'file'),
        mime: String(a?.mime || 'application/octet-stream'),
      }))
      .filter((a) => a.path);
  }
  if (m.attachment_path) {
    return [
      {
        path: String(m.attachment_path),
        name: String(m.attachment_name || 'file'),
        mime: String(m.attachment_mime || 'application/octet-stream'),
      },
    ];
  }
  return [];
}

/** One-line preview for inbox rows (strip markdown-ish noise). */
function previewSnippet(body) {
  const t = String(body || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return 'Attachment';
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

/** Plain text for clipboard copy (full body, not inbox preview). */
function dmMessageCopyPlain(m, viewerId) {
  if (!m || m.deleted_at) return '';
  if (m.kind === 'call') return messageRowPreview(m, viewerId);
  const t = chatMessageBodyToCopyPlain(m.body);
  if (t) return t;
  const atts = normalizeMessageAttachments(m);
  if (!atts.length) return '';
  return atts
    .map((a) => String(a.name || '').trim())
    .filter(Boolean)
    .join('\n');
}

function dmMessageSnippet(m, viewerId) {
  if (m?.deleted_at) return ERP_CHAT_DELETED_REPLY_SNIPPET;
  if (m?.kind === 'call') return messageRowPreview(m, viewerId);
  const fromBody = previewSnippet(m?.body);
  if (fromBody !== 'Attachment') return fromBody;
  const atts = normalizeMessageAttachments(m);
  if (atts.length > 1) return `📎 ${atts.length} files`;
  if (atts.length === 1) return `📎 ${atts[0].name}`;
  return 'Message';
}

/** One-line preview for a call-kind message row; falls back to previewSnippet otherwise. */
function messageRowPreview(m, viewerId) {
  if (m?.deleted_at) return 'Message deleted';
  if (m?.kind === 'call') {
    const meta = m?.meta || {};
    const audio = Boolean(meta.audio_only);
    const status = String(meta.status || '').toLowerCase();
    const mine = m.sender_id === viewerId;
    if (status === 'missed') return mine ? (audio ? 'Voice call · no answer' : 'Video call · no answer') : (audio ? 'Missed voice call' : 'Missed video call');
    if (status === 'declined') return mine ? (audio ? 'Voice call declined' : 'Video call declined') : (audio ? 'Declined voice call' : 'Declined video call');
    if (status === 'busy') return 'Call · busy';
    return audio ? 'Voice call' : 'Video call';
  }
  const fromBody = previewSnippet(m?.body);
  if (fromBody !== 'Attachment') return fromBody;
  const atts = normalizeMessageAttachments(m);
  if (atts.length > 1) return `📎 ${atts.length} files`;
  if (atts.length === 1) {
    const raw = String(atts[0].name || 'file')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return '📎 file';
    return raw.length > 64 ? `📎 ${raw.slice(0, 61)}…` : `📎 ${raw}`;
  }
  return 'Attachment';
}

/** Short relative time for inbox rows. */
function formatInboxTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function IconAt({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 9.5a3.5 3.5 0 10-3.5 6h.5a2 2 0 002-2v-1" strokeLinecap="round" />
    </svg>
  );
}

function IconUserPlus({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 7a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronLeft({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconSearch({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3-3" />
    </svg>
  );
}

function IconCompose({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconVideoCall({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPhoneCall({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLinkSimple({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDotsVertical({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/**
 * Formats a raw call duration as H:MM:SS or M:SS, like WhatsApp.
 */
function formatCallDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * System-message style call log card rendered inline in the chat thread.
 * Expected fields on the message:
 *   { id, sender_id, created_at, meta: { audio_only, status, duration_sec?, caller_id } }
 * `mine` means the caller was the current user.
 */
function CallLogBubble({ msg, mine }) {
  const meta = (msg && msg.meta) || {};
  const audioOnly = Boolean(meta.audio_only);
  const rawStatus = String(meta.status || '').toLowerCase();
  const status = ['answered', 'missed', 'declined', 'busy'].includes(rawStatus) ? rawStatus : 'answered';
  const duration = Number(meta.duration_sec || 0);

  // Color + label by (status, mine)
  let label;
  let tone;
  if (status === 'answered') {
    label = mine
      ? audioOnly
        ? 'Outgoing voice call'
        : 'Outgoing video call'
      : audioOnly
        ? 'Incoming voice call'
        : 'Incoming video call';
    tone =
      'bg-teal-50/80 text-teal-900 ring-teal-200/80 dark:bg-teal-950/60 dark:text-teal-100 dark:ring-teal-800/45';
  } else if (status === 'missed') {
    label = mine
      ? audioOnly
        ? 'Unanswered voice call'
        : 'Unanswered video call'
      : audioOnly
        ? 'Missed voice call'
        : 'Missed video call';
    tone =
      'bg-rose-50/80 text-rose-900 ring-rose-200/80 dark:bg-rose-950/45 dark:text-rose-100 dark:ring-rose-900/45';
  } else if (status === 'declined') {
    label = mine
      ? audioOnly
        ? 'Voice call declined'
        : 'Video call declined'
      : audioOnly
        ? 'Declined voice call'
        : 'Declined video call';
    tone =
      'bg-rose-50/80 text-rose-900 ring-rose-200/80 dark:bg-rose-950/45 dark:text-rose-100 dark:ring-rose-900/45';
  } else {
    label = 'Call · busy';
    tone =
      'bg-amber-50/80 text-amber-900 ring-amber-200/80 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-900/45';
  }

  const iconClass =
    status === 'answered'
      ? 'text-teal-700 dark:text-teal-200'
      : 'text-rose-700 dark:text-rose-200';

  return (
    <div className="my-1 flex justify-center">
      <div className={`inline-flex max-w-[min(100%,28rem)] items-center gap-2.5 rounded-2xl px-3.5 py-2 text-xs font-semibold shadow-sm ring-1 ${tone}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 ring-1 ring-black/5 dark:bg-slate-900/85 dark:ring-slate-600/55">
          {audioOnly ? (
            <svg className={`h-3.5 w-3.5 ${iconClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg className={`h-3.5 w-3.5 ${iconClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="min-w-0 truncate">{label}</span>
        {status === 'answered' && duration > 0 ? (
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold tabular-nums tracking-tight text-slate-700 ring-1 ring-black/5 dark:bg-white/10 dark:text-slate-100 dark:ring-white/15">
            {formatCallDuration(duration)}
          </span>
        ) : null}
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
          {new Date(msg.created_at).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}

function DmAttachmentView({ path, name, mime, mine, onPreview }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    (async () => {
      let signed = null;
      try {
        const res = await erpAuthorizedFetch('/api/erp/files/signed-url', {
          method: 'POST',
          body: JSON.stringify({ path }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.signedUrl) {
          signed = data.signedUrl;
          primeCachedSignedUrl(path, signed);
        }
      } catch {
        // fall through to client sign
      }
      if (!signed) {
        signed = await getCachedSignedUrl(path);
      }
      if (cancelled) return;
      if (!signed) {
        setErr(true);
        return;
      }
      setUrl(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const isImg = isChatImagePreviewItem({ path, name, mime });

  if (err) {
    return (
      <p className={`text-xs ${mine ? 'text-teal-100/90' : 'text-slate-500 dark:text-slate-400'}`}>Could not load attachment.</p>
    );
  }
  if (!url) {
    return (
      <div className={`h-24 animate-pulse rounded-lg ${mine ? 'bg-white/10' : 'bg-slate-200/80 dark:bg-slate-700/50'}`} />
    );
  }

  // Image: clicking should open the in-app preview (lightbox-style modal),
  // never the system browser. The desktop shell would otherwise externalise
  // any `target="_blank"` link, so we keep navigation inside the workspace.
  if (isImg) {
    if (onPreview) {
      return (
        <button
          type="button"
          onClick={() => onPreview({ path, name, mime })}
          title={name || 'Open image'}
          className="block mt-1 max-w-full cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            className="max-h-56 max-w-full rounded-lg object-contain"
          />
        </button>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="block mt-1 max-h-56 max-w-full rounded-lg object-contain"
      />
    );
  }

  // Non-image: prefer the in-app preview (handles PDF, video, audio, office,
  // text, with a graceful download fallback). When no preview handler is
  // provided we fall back to the original direct-download behaviour.
  if (onPreview) {
    return (
      <button
        type="button"
        onClick={() => onPreview({ path, name, mime })}
        className={`mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-xs font-medium underline ${
          mine
            ? 'border-white/25 bg-white/10 text-white'
            : 'border-slate-200 bg-white text-[#103D4D] dark:border-teal-800/55 dark:bg-[#0f1824] dark:text-teal-200'
        }`}
        title={name || 'Open file'}
      >
        <span aria-hidden>📎</span>
        <span className="truncate">{name || 'Open file'}</span>
      </button>
    );
  }

  return (
    <a
      href={url}
      onClick={async (e) => {
        e.preventDefault();
        if (!url || downloading) return;
        setDownloading(true);
        try {
          await downloadFromSignedUrlWithFallback(url, name || 'file');
        } finally {
          setDownloading(false);
        }
      }}
      className={`mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-xs font-medium underline ${
        mine
          ? 'border-white/25 bg-white/10 text-white'
          : 'border-slate-200 bg-white text-[#103D4D] dark:border-teal-800/55 dark:bg-[#0f1824] dark:text-teal-200'
      }`}
    >
      {downloading ? 'Downloading…' : (name || 'Download file')}
    </a>
  );
}


export default function ErpDirectMessages() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const withId = searchParams.get('with');
  const groupId = searchParams.get('group');
  const { profile } = useErpSession();

  const [myId, setMyId] = useState(null);
  const [directory, setDirectory] = useState(() => readErpDataCache('dm:directory')?.users ?? []);
  const [dirLoading, setDirLoading] = useState(() => !hasErpDataCache('dm:directory'));
  const [dirErr, setDirErr] = useState('');

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  const [groupMembers, setGroupMembers] = useState([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  /** Per-message emoji reactions, keyed by message id. */
  const [reactions, setReactions] = useState(/** @type {Record<string, Array<{id:string,user_id:string,emoji:string,created_at?:string}>>} */ ({}));
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgErr, setMsgErr] = useState('');
  useErpErrorToast(msgErr, { title: 'Message error' });
  const [draft, setDraft] = useState('');
  /** Counter of background sends/uploads currently in flight. Used purely for the "Sending…"
   *  indicator — the composer remains usable so the user can queue another message immediately
   *  (WhatsApp-style: attachments upload in the background while you keep chatting). */
  const [inflightSends, setInflightSends] = useState(0);
  const sending = inflightSends > 0;
  const [pendingFiles, setPendingFiles] = useState([]);
  /** Serializes background sends so messages land in the order the user pressed Send,
   *  even when an earlier message has slow attachments. */
  const sendChainRef = useRef(Promise.resolve());
  /** Mirror of the active conversation id so background sends know whether the user is
   *  still on the same convo before refreshing the thread. */
  const groupIdRef = useRef(null);
  const withIdRef = useRef(null);
  groupIdRef.current = groupId || null;
  withIdRef.current = withId || null;
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const [query, setQuery] = useState('');
  /** Mobile inbox search + filter pills (All / Unread / Mentions / Groups). */
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxFilter, setInboxFilter] = useState('all');
  /** Mobile (max-lg): show chat composer first; use People tab to pick DM/group. */
  const [mobileDmTab, setMobileDmTab] = useState('chat');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState([]);
  const [createGroupBusy, setCreateGroupBusy] = useState(false);
  const [createGroupErr, setCreateGroupErr] = useState('');

  const [groupInviteModalOpen, setGroupInviteModalOpen] = useState(false);
  const [invitePickIds, setInvitePickIds] = useState([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState('');

  /** WhatsApp-style inbox: DM + group rows with preview + unread. */
  const [conversationSummaries, setConversationSummaries] = useState([]);
  const [convListLoading, setConvListLoading] = useState(false);
  const [msgCtxMenu, setMsgCtxMenu] = useState(null);
  const [msgSwipeDx, setMsgSwipeDx] = useState(null);
  const msgTouchRef = useRef(null);
  /** When set, opens the Forward modal pre-loaded with this message's body + attachments. */
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [dmEditingMsgId, setDmEditingMsgId] = useState(null);
  const [dmEditingDraft, setDmEditingDraft] = useState('');
  const [dmEditBusy, setDmEditBusy] = useState(false);
  const [confirmDeleteDmMsgId, setConfirmDeleteDmMsgId] = useState(null);
  const [confirmLeaveGroupOpen, setConfirmLeaveGroupOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [pinnedDmKeys, setPinnedDmKeys] = useState([]);
  const [convCtxMenu, setConvCtxMenu] = useState(null);
  const [messagePins, setMessagePins] = useState([]);
  const [pinnedMsgIndex, setPinnedMsgIndex] = useState(0);
  const [messagePinsEnabled, setMessagePinsEnabled] = useState(true);
  const messagePinsApiAvailableRef = useRef(true);
  // Inline file preview modal — used for chat image / file attachments so a
  // click stays inside the workspace (the desktop shell would otherwise
  // externalise any `target="_blank"` link to the system browser).
  const [dmFilePreview, setDmFilePreview] = useState(null);
  const headerMenuRef = useRef(null);

  const threadScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const composerRef = useRef(null);
  const mentionComboRef = useRef(null);
  const mentionPickerRef = useRef(null);
  const mentionAnchorRef = useRef(-1);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionEnd, setMentionEnd] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const fileInputRef = useRef(null);
  /** Bump when conversation restores draft so the WYSIWYG composer remounts after localStorage hydrate. */
  const [composerBump, bumpComposerHydration] = useReducer((x) => x + 1, 0);
  /** Migration 044 (RPCs + read_state tables). Set false after first schema-missing error to avoid repeated 404s until deploy. */
  const readStateApisAvailableRef = useRef(true);
  const dmThreadLoadGenRef = useRef(0);
  const groupThreadLoadGenRef = useRef(0);
  /** Other user’s last_read_at for this 1:1 thread (their erp_dm_read_state row targeting us). */
  const [peerDmReadAt, setPeerDmReadAt] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [dmMessageInfo, setDmMessageInfo] = useState(null);
  const [groupReadByUserId, setGroupReadByUserId] = useState({});
  const draftSaveTimerRef = useRef(null);

  const draftStorageKey = useMemo(() => {
    if (groupId) return `erp:draft:group:${groupId}`;
    if (withId) return `erp:draft:dm:${withId}`;
    return null;
  }, [groupId, withId]);

  // Restore unsent draft when switching conversations.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const swallow = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draftStorageKey) {
      setDraft('');
      return;
    }
    try {
      const saved = window.localStorage.getItem(draftStorageKey);
      setDraft(saved != null && String(saved).length > 0 ? String(saved) : '');
    } catch {
      setDraft('');
    }
    bumpComposerHydration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  // Persist unsent draft as user types (debounced).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draftStorageKey) return;
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      try {
        const v = String(draft || '');
        if (v.trim().length === 0) window.localStorage.removeItem(draftStorageKey);
        else window.localStorage.setItem(draftStorageKey, v);
      } catch {}
    }, 250);
    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    };
  }, [draft, draftStorageKey]);

  const canAdminDelete = profile?.role === 'admin';
  const canClearThread = Boolean(myId && (withId || groupId));

  useEffect(() => {
    if (!msgCtxMenu) return;
    function onDoc() {
      setMsgCtxMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMsgCtxMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [msgCtxMenu]);

  useEffect(() => {
    setDmEditingMsgId(null);
    setDmEditingDraft('');
    setDmEditBusy(false);
  }, [withId, groupId]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    function onDoc(e) {
      if (headerMenuRef.current && headerMenuRef.current.contains(e.target)) return;
      setHeaderMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    if (!convCtxMenu) return;
    function onDoc() {
      setConvCtxMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setConvCtxMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [convCtxMenu]);

  useEffect(() => {
    setHeaderMenuOpen(false);
  }, [withId, groupId]);

  async function executeAdminDeleteMessage() {
    const messageId = confirmDeleteDmMsgId;
    if (!messageId) return;
    const target = messages.find((m) => m.id === messageId);
    const ownMessage = Boolean(myId && target?.sender_id === myId);
    if (!canAdminDelete && !ownMessage) return;
    setMsgErr('');
    try {
      const url = groupId ? `/api/erp/dm/group-messages/${messageId}` : `/api/erp/dm/messages/${messageId}`;
      const res = await erpAuthorizedFetch(url, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete message');
      setConfirmDeleteDmMsgId(null);
      if (data.message?.id) {
        setMessages((prev) => prev.map((row) => (row.id === data.message.id ? { ...row, ...data.message } : row)));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch (e) {
      setMsgErr(e?.message || 'Could not delete message');
    }
  }

  function startDmEdit(m) {
    if (!m?.id || m.sender_id !== myId || m.kind === 'call') return;
    if (!canEditChatMessageByAge(m.created_at)) return;
    setDmEditingDraft(m.body ?? '');
    setDmEditingMsgId(m.id);
  }

  function cancelDmEdit() {
    setDmEditingMsgId(null);
    setDmEditingDraft('');
  }

  async function saveDmEdit() {
    if (!dmEditingMsgId || dmEditBusy || !myId) return;
    setDmEditBusy(true);
    setMsgErr('');
    try {
      const url = groupId ? `/api/erp/dm/group-messages/${dmEditingMsgId}` : `/api/erp/dm/messages/${dmEditingMsgId}`;
      const res = await erpAuthorizedFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: dmEditingDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save edit');
      if (data.message?.id) {
        setMessages((prev) => prev.map((row) => (row.id === data.message.id ? { ...row, ...data.message } : row)));
      }
      setDmEditingMsgId(null);
      setDmEditingDraft('');
    } catch (e) {
      setMsgErr(e?.message || 'Could not save edit');
    } finally {
      setDmEditBusy(false);
    }
  }

  const [clearThreadOpen, setClearThreadOpen] = useState(false);
  const [clearThreadTyped, setClearThreadTyped] = useState('');
  const [clearThreadBusy, setClearThreadBusy] = useState(false);
  const [clearThreadErr, setClearThreadErr] = useState('');

  const [jitsiSession, setJitsiSession] = useState(null);
  const [callBusy, setCallBusy] = useState(false);

  async function clearCurrentThread() {
    if (!canClearThread || clearThreadBusy) return;
    if (String(clearThreadTyped || '').trim().toUpperCase() !== 'DELETE') {
      setClearThreadErr('Type DELETE to confirm.');
      return;
    }
    setClearThreadBusy(true);
    setClearThreadErr('');
    setMsgErr('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/dm/clear', {
        method: 'POST',
        body: JSON.stringify(groupId ? { groupId } : { withId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not clear chat');
      setMessages([]);
      setClearThreadOpen(false);
      if (groupId) await loadGroupThread(groupId);
      else if (withId) await loadThread(withId);
      void loadConversationSummaries();
    } catch (e) {
      setClearThreadErr(e?.message || 'Could not clear chat');
    } finally {
      setClearThreadBusy(false);
    }
  }

  const selected = useMemo(() => directory.find((u) => u.id === withId) || null, [directory, withId]);
  const selectedGroup = useMemo(() => groups.find((g) => g.id === groupId) || null, [groups, groupId]);

  const nameById = useMemo(() => {
    const o = {};
    for (const u of directory) {
      o[u.id] = displayName(u);
    }
    for (const u of groupMembers) {
      o[u.id] = displayName(u);
    }
    return o;
  }, [directory, groupMembers]);

  const dmMentionCandidates = useMemo(() => {
    if (!withId && !groupId) return [];
    const pool = groupId
      ? (groupMembers || []).filter((u) => u?.id && u.id !== myId)
      : selected
        ? [selected]
        : [];
    const q = (mentionQuery || '').trim().toLowerCase();
    const sorted = [...pool].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    if (!q) return sorted;
    return sorted.filter((u) => displayName(u).toLowerCase().includes(q));
  }, [withId, groupId, groupMembers, selected, myId, mentionQuery]);

  const groupMemberById = useMemo(() => {
    const m = {};
    for (const u of groupMembers) {
      if (u?.id) m[u.id] = u;
    }
    return m;
  }, [groupMembers]);

  /** Current user profile for group “You” row (group API + directory fallback). */
  const myGroupProfile = useMemo(() => {
    if (!myId) return null;
    return groupMemberById[myId] || directory.find((u) => u.id === myId) || null;
  }, [groupMemberById, directory, myId]);

  /** Track which message ids we've already pulled reactions for, so a new
   *  realtime message arriving doesn't refetch reactions for the entire
   *  thread (which would clobber an in-flight optimistic add and cause
   *  reaction chips to flicker). */
  const fetchedReactionsForRef = useRef(new Set());

  // Reset reactions cache whenever the active thread switches.
  useEffect(() => {
    setReactions({});
    fetchedReactionsForRef.current = new Set();
    mentionAnchorRef.current = -1;
    setMentionOpen(false);
    setMentionStart(-1);
    setMentionEnd(-1);
    setMentionQuery('');
  }, [withId, groupId]);

  // Incrementally fetch reactions for any message ids we haven't loaded yet.
  useEffect(() => {
    if (!myId) return undefined;
    if (!withId && !groupId) return undefined;
    const allIds = messages.map((m) => m.id).filter(Boolean);
    const fetched = fetchedReactionsForRef.current;
    const missing = allIds.filter((id) => !fetched.has(id));
    if (missing.length === 0) return undefined;

    const inGroup = Boolean(groupId);
    let cancelled = false;
    (async () => {
      const rows = inGroup
        ? await loadGroupReactionsForMessages(missing)
        : await loadDmReactionsForMessages(missing);
      if (cancelled) return;
      // Mark them all as fetched whether or not they had reactions, so we
      // never refetch them unless the thread switches.
      for (const id of missing) fetched.add(id);
      if (rows.length === 0) return;
      setReactions((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          const mid = inGroup ? r.group_message_id : r.dm_message_id;
          if (!mid) continue;
          const list = next[mid] || [];
          if (list.some((x) => x.id === r.id)) continue;
          next[mid] = [
            ...list,
            {
              id: r.id,
              user_id: r.user_id,
              emoji: r.emoji,
              created_at: r.created_at,
            },
          ];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [myId, withId, groupId, messages]);

  /** Apply a reaction row received from realtime (or after server insert). */
  const applyLocalReactionRow = useCallback((row) => {
    if (!row) return;
    const mid = row.group_message_id || row.dm_message_id;
    if (!mid) return;
    setReactions((prev) => {
      const list = prev[mid] || [];
      if (list.some((r) => r.id === row.id)) return prev;
      return {
        ...prev,
        [mid]: [
          ...list,
          {
            id: row.id,
            user_id: row.user_id,
            emoji: row.emoji,
            created_at: row.created_at,
          },
        ],
      };
    });
  }, []);

  /** Remove a reaction row received from realtime (or after server delete). */
  const removeLocalReactionRow = useCallback((row) => {
    if (!row) return;
    const mid = row.group_message_id || row.dm_message_id;
    if (!mid) return;
    setReactions((prev) => {
      const list = prev[mid];
      if (!list) return prev;
      const next = list.filter((r) => r.id !== row.id);
      if (next.length === list.length) return prev;
      return { ...prev, [mid]: next };
    });
  }, []);

  /**
   * Toggle the viewer's reaction on a message. Optimistic UI: we update local
   * state immediately and roll back on error. Realtime keeps everyone else's
   * view in sync.
   */
  const toggleMyReaction = useCallback(
    async (msg, emoji) => {
      if (!myId || !msg?.id || !emoji) return;
      if (msg.deleted_at || msg.kind === 'call') return;
      const scope = groupId ? 'group' : 'dm';
      const list = reactions[msg.id] || [];
      const existing = list.find((r) => r.user_id === myId && r.emoji === emoji);
      if (existing) {
        setReactions((prev) => {
          const cur = prev[msg.id] || [];
          return { ...prev, [msg.id]: cur.filter((r) => r.id !== existing.id) };
        });
        const res = await toggleMessageReaction({
          scope,
          messageId: msg.id,
          emoji,
          viewerId: myId,
        });
        if (res?.error) {
          setReactions((prev) => {
            const cur = prev[msg.id] || [];
            if (cur.some((r) => r.id === existing.id)) return prev;
            return { ...prev, [msg.id]: [...cur, existing] };
          });
        }
        return;
      }
      const tempId = `pending-${msg.id}-${emoji}-${Date.now()}`;
      setReactions((prev) => {
        const cur = prev[msg.id] || [];
        return {
          ...prev,
          [msg.id]: [
            ...cur,
            {
              id: tempId,
              user_id: myId,
              emoji,
              created_at: new Date().toISOString(),
            },
          ],
        };
      });
      const res = await toggleMessageReaction({
        scope,
        messageId: msg.id,
        emoji,
        viewerId: myId,
      });
      if (res?.error || !res?.added) {
        setReactions((prev) => {
          const cur = prev[msg.id] || [];
          return { ...prev, [msg.id]: cur.filter((r) => r.id !== tempId) };
        });
      } else {
        const fresh = res.added;
        setReactions((prev) => {
          const cur = prev[msg.id] || [];
          return {
            ...prev,
            [msg.id]: cur.map((r) =>
              r.id === tempId
                ? {
                    id: fresh.id,
                    user_id: fresh.user_id,
                    emoji: fresh.emoji,
                    created_at: fresh.created_at,
                  }
                : r,
            ),
          };
        });
      }
    },
    [myId, groupId, reactions],
  );

  const existingGroupMemberIds = useMemo(
    () => new Set((groupMembers || []).map((m) => m.id).filter(Boolean)),
    [groupMembers],
  );

  const inviteDirectoryUsers = useMemo(
    () => directory.filter((u) => u?.id && !existingGroupMemberIds.has(u.id)),
    [directory, existingGroupMemberIds],
  );

  useEffect(() => {
    setPendingFiles([]);
  }, [withId, groupId]);

  useEffect(() => {
    setGroupInviteModalOpen(false);
    setInvitePickIds([]);
    setInviteErr('');
  }, [groupId]);

  const loadDirectory = useCallback(async () => {
    const cached = readErpDataCache('dm:directory');
    if (hasErpDataCache('dm:directory')) {
      setDirectory(cached?.users ?? []);
      setDirLoading(false);
    } else {
      setDirLoading(true);
    }
    setDirErr('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/dm/directory');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load directory');
      const users = Array.isArray(data.users) ? data.users : [];
      writeErpDataCache('dm:directory', { users });
      setDirectory(users);
    } catch (e) {
      setDirErr(e?.message || 'Could not load directory');
      if (!hasErpDataCache('dm:directory')) setDirectory([]);
    } finally {
      setDirLoading(false);
    }
  }, []);

  /**
   * Wait for a validated user (`getUser` refreshes JWT) before loading the DM directory.
   * Avoids 401 when `getSession` briefly has no access_token (e.g. React Strict Mode / hydration).
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      if (!cancelled) setMyId(uid);
      if (authErr || !uid) {
        if (!cancelled) {
          setDirLoading(false);
          setDirectory([]);
        }
        return;
      }
      if (!cancelled) await loadDirectory();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDirectory]);

  useEffect(() => {
    if (!myId) {
      setPinnedDmKeys([]);
      return undefined;
    }
    setPinnedDmKeys(readPinnedDmConversations(myId));
    return subscribePinnedDmConversations(myId, setPinnedDmKeys);
  }, [myId]);

  const loadThreadMessagePins = useCallback(async () => {
    if (!messagePinsApiAvailableRef.current || !myId) {
      setMessagePins([]);
      return;
    }
    if (groupId) {
      const { rows, schemaMissing, error } = await loadGroupMessagePins({ groupId });
      if (schemaMissing) {
        messagePinsApiAvailableRef.current = false;
        setMessagePinsEnabled(false);
      }
      if (error) setMsgErr(error);
      setMessagePins(rows);
      return;
    }
    if (withId) {
      const key = dmThreadKey(myId, withId);
      const { rows, schemaMissing, error } = await loadDmMessagePins({ dmThreadKey: key });
      if (schemaMissing) {
        messagePinsApiAvailableRef.current = false;
        setMessagePinsEnabled(false);
      }
      if (error) setMsgErr(error);
      setMessagePins(rows);
      return;
    }
    setMessagePins([]);
  }, [myId, withId, groupId]);

  useEffect(() => {
    setPinnedMsgIndex(0);
    void loadThreadMessagePins();
  }, [loadThreadMessagePins]);

  const pinnedMessageIds = useMemo(() => {
    const set = new Set();
    for (const row of messagePins) {
      const id = pinRowMessageId(row);
      if (id) set.add(id);
    }
    return set;
  }, [messagePins]);

  const pinMessageById = useCallback(
    async (messageId) => {
      if (!myId || !messageId || !messagePinsApiAvailableRef.current) return;
      const msg = messages.find((row) => row.id === messageId);
      if (!msg || msg.deleted_at || msg.kind === 'call') return;
      let result;
      if (groupId) {
        result = await pinGroupMessage({ messageId, groupId, pinnedBy: myId });
      } else if (withId) {
        result = await pinDmMessage({
          messageId,
          dmThreadKey: dmThreadKey(myId, withId),
          pinnedBy: myId,
        });
      } else {
        return;
      }
      if (result.schemaMissing) {
        messagePinsApiAvailableRef.current = false;
        setMessagePinsEnabled(false);
        setMsgErr('Message pinning is not available until the latest database migration is applied.');
        return;
      }
      if (result.error) {
        setMsgErr(result.error);
        return;
      }
      await loadThreadMessagePins();
      setPinnedMsgIndex(0);
    },
    [myId, messages, groupId, withId, loadThreadMessagePins],
  );

  const unpinMessageByPinId = useCallback(
    async (pinId) => {
      if (!pinId || !messagePinsApiAvailableRef.current) return;
      const result = await unpinChatMessage(pinId);
      if (result.schemaMissing) {
        messagePinsApiAvailableRef.current = false;
        setMessagePinsEnabled(false);
        return;
      }
      if (result.error) {
        setMsgErr(result.error);
        return;
      }
      await loadThreadMessagePins();
      setPinnedMsgIndex(0);
    },
    [loadThreadMessagePins],
  );

  const loadGroupMembers = useCallback(async (gid) => {
    if (!gid) {
      setGroupMembers([]);
      return;
    }
    setGroupMembersLoading(true);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/dm/group-members?groupId=${encodeURIComponent(gid)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load group members');
      setGroupMembers(Array.isArray(data.members) ? data.members : []);
    } catch {
      setGroupMembers([]);
    } finally {
      setGroupMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (groupId && myId) {
      void loadGroupMembers(groupId);
      return;
    }
    setGroupMembers([]);
  }, [groupId, myId, loadGroupMembers]);

  const loadGroups = useCallback(async () => {
    if (!myId) {
      setGroups([]);
      setGroupsLoading(false);
      return;
    }
    const cacheKey = `dm:groups:${myId}`;
    const cached = readErpDataCache(cacheKey);
    if (hasErpDataCache(cacheKey)) {
      setGroups(cached?.groups ?? []);
      setGroupsLoading(false);
    } else {
      setGroupsLoading(true);
    }
    try {
      const { data: mems, error: mErr } = await supabase
        .from('erp_message_group_members')
        .select('group_id')
        .eq('user_id', myId);
      if (mErr) throw new Error(mErr.message);
      const gids = [...new Set((mems || []).map((m) => m.group_id).filter(Boolean))];
      if (gids.length === 0) {
        writeErpDataCache(cacheKey, { groups: [] });
        setGroups([]);
        return;
      }
      const { data: gr, error: gErr } = await supabase
        .from('erp_message_groups')
        .select('id, name, created_by, updated_at')
        .in('id', gids)
        .order('updated_at', { ascending: false });
      if (gErr) throw new Error(gErr.message);
      const nextGroups = gr || [];
      writeErpDataCache(cacheKey, { groups: nextGroups });
      setGroups(nextGroups);
    } catch {
      if (!hasErpDataCache(cacheKey)) setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!myId) return;
    const ch = supabase
      .channel(`erp-dm-groups-${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_message_group_members', filter: `user_id=eq.${myId}` },
        () => {
          void loadGroups();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, loadGroups]);

  useEffect(() => {
    if (withId || groupId) setMobileDmTab('chat');
  }, [withId, groupId]);

  useEffect(() => {
    if (withId && groupId) {
      router.replace(`/erp/messages?group=${encodeURIComponent(groupId)}`, { scroll: false });
    }
  }, [withId, groupId, router]);

  useEffect(() => {
    if (!groupId || groupsLoading) return;
    if (!groups.some((g) => g.id === groupId)) {
      router.replace('/erp/messages', { scroll: false });
    }
  }, [groupId, groups, groupsLoading, router]);

  const loadConversationSummaries = useCallback(async () => {
    if (!myId) return;
    const cacheKey = `dm:inbox:${myId}`;
    const cached = readErpDataCache(cacheKey);
    if (hasErpDataCache(cacheKey)) {
      setConversationSummaries(cached?.summaries ?? []);
      setConvListLoading(false);
    } else {
      setConvListLoading(true);
    }
    try {
      const { data: dmClears } = await supabase
        .from('erp_dm_thread_clears')
        .select('peer_id, cleared_at')
        .eq('user_id', myId)
        .limit(2000);
      const dmClearedAtByPeer = {};
      for (const r of dmClears || []) {
        if (r?.peer_id && r?.cleared_at) dmClearedAtByPeer[r.peer_id] = r.cleared_at;
      }

      const { data: groupClears } = await supabase
        .from('erp_group_thread_clears')
        .select('group_id, cleared_at')
        .eq('user_id', myId)
        .limit(4000);
      const groupClearedAtByGroup = {};
      for (const r of groupClears || []) {
        if (r?.group_id && r?.cleared_at) groupClearedAtByGroup[r.group_id] = r.cleared_at;
      }

      const { data: msgs } = await supabase
        .from('erp_direct_messages')
        .select('sender_id, recipient_id, body, created_at, kind, meta, attachment_path, attachment_name, attachment_mime, attachments, deleted_at')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
        .order('created_at', { ascending: false })
        .limit(800);

      const peerLatest = new Map();
      for (const m of msgs || []) {
        const peer = m.sender_id === myId ? m.recipient_id : m.sender_id;
        const clearedAt = dmClearedAtByPeer[peer];
        if (clearedAt && m?.created_at && new Date(m.created_at) <= new Date(clearedAt)) continue;
        if (!peerLatest.has(peer)) peerLatest.set(peer, m);
      }

      const peerIds = [...peerLatest.keys()];
      const nameByPeer = {};
      for (const u of directory) {
        if (peerIds.includes(u.id)) nameByPeer[u.id] = displayName(u);
      }
      const missing = peerIds.filter((id) => !nameByPeer[id]);
      if (missing.length > 0) {
        const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', missing);
        for (const p of profs || []) {
          nameByPeer[p.id] = (p.full_name && String(p.full_name).trim()) || 'Member';
        }
      }

      let unreadDmMap = {};
      if (readStateApisAvailableRef.current) {
        const { data: unreadDm, error: eDm } = await supabase.rpc('erp_my_dm_unread_summary');
        if (eDm && isSupabaseSchemaMissingError(eDm)) readStateApisAvailableRef.current = false;
        else if (!eDm && unreadDm) {
          for (const row of unreadDm) unreadDmMap[row.peer_id] = Number(row.unread) || 0;
        }
      }

      const dmItems = [];
      for (const [peerId, m] of peerLatest) {
        dmItems.push({
          kind: 'dm',
          key: `dm-${peerId}`,
          peerId,
          title: nameByPeer[peerId] || 'Member',
          preview: messageRowPreview(m, myId),
          lastAt: m.created_at,
          unread: unreadDmMap[peerId] || 0,
        });
      }

      let groupPreviewMap = {};
      const gids = (groups || []).map((g) => g.id).filter(Boolean);
      if (gids.length > 0 && readStateApisAvailableRef.current) {
        const { data: glm, error: eGlm } = await supabase.rpc('erp_group_latest_messages', { p_group_ids: gids });
        if (eGlm && isSupabaseSchemaMissingError(eGlm)) readStateApisAvailableRef.current = false;
        else if (!eGlm && glm) {
          for (const r of glm) groupPreviewMap[r.group_id] = r;
        }
      }

      let unreadGroupMap = {};
      if (readStateApisAvailableRef.current) {
        const { data: ug, error: eUg } = await supabase.rpc('erp_my_group_unread_summary');
        if (eUg && isSupabaseSchemaMissingError(eUg)) readStateApisAvailableRef.current = false;
        else if (!eUg && ug) {
          for (const r of ug) unreadGroupMap[r.group_id] = Number(r.unread) || 0;
        }
      }

      const groupItems = (groups || []).map((g) => {
        const last = groupPreviewMap[g.id];
        const clearedAt = groupClearedAtByGroup[g.id] || null;
        const lastAt = last?.created_at || g.updated_at;
        const isCleared = clearedAt && lastAt && new Date(lastAt) <= new Date(clearedAt);
        return {
          kind: 'group',
          key: `group-${g.id}`,
          groupId: g.id,
          title: g.name || 'Group',
          preview: isCleared ? 'No messages yet.' : last ? messageRowPreview(last, myId) : 'Group chat',
          lastAt: isCleared ? g.updated_at : lastAt,
          unread: isCleared ? 0 : unreadGroupMap[g.id] || 0,
        };
      });

      const merged = [...dmItems, ...groupItems].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
      writeErpDataCache(cacheKey, { summaries: merged });
      setConversationSummaries(merged);
    } finally {
      setConvListLoading(false);
    }
  }, [myId, directory, groups]);

  const refreshPeerDmReadAt = useCallback(
    async (peerId) => {
      if (!myId || !peerId || groupId) return;
      const { data } = await supabase
        .from('erp_dm_read_state')
        .select('last_read_at')
        .eq('user_id', peerId)
        .eq('peer_id', myId)
        .maybeSingle();
      setPeerDmReadAt(data?.last_read_at ?? null);
    },
    [myId, groupId],
  );

  const markIncomingDmDelivered = useCallback(
    async (peerId, messageIds) => {
      if (!myId || !peerId || groupId || !messageIds?.length) return;
      try {
        await erpAuthorizedFetch('/api/erp/dm/mark-delivered', {
          method: 'POST',
          body: JSON.stringify({ messageIds }),
        });
      } catch {
        /* non-fatal */
      }
    },
    [myId, groupId],
  );

  const refreshGroupReadStates = useCallback(async (gid) => {
    if (!gid) {
      setGroupReadByUserId({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from('erp_group_read_state')
        .select('user_id, last_read_at, updated_at')
        .eq('group_id', gid);
      if (error) throw error;
      const map = {};
      for (const row of data || []) map[row.user_id] = row;
      setGroupReadByUserId(map);
    } catch {
      setGroupReadByUserId({});
    }
  }, []);

  const loadThread = useCallback(
    async (otherId, opts) => {
      const loadId = ++dmThreadLoadGenRef.current;
      const silent = Boolean(opts?.silent);
      if (!myId || !otherId) {
        if (!silent) setMessages([]);
        return;
      }
      if (!silent) setMsgLoading(true);
      setMsgErr('');
      try {
        const { data: clearRow, error: clearErr } = await supabase
          .from('erp_dm_thread_clears')
          .select('cleared_at')
          .eq('user_id', myId)
          .eq('peer_id', otherId)
          .maybeSingle();
        const clearedAt = !clearErr && clearRow?.cleared_at ? clearRow.cleared_at : null;
        const filter = `and(sender_id.eq.${myId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myId})`;
        let q = supabase
          .from('erp_direct_messages')
          .select(
            'id, sender_id, recipient_id, body, created_at, edited_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, deleted_at, recipient_delivered_at, reply_to_id',
          )
          .or(filter)
          .order('created_at', { ascending: true })
          .limit(300);
        if (clearedAt) q = q.gt('created_at', clearedAt);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        if (loadId !== dmThreadLoadGenRef.current) return;
        const rows = data || [];
        setMessages(rows);
        const incomingIds = rows
          .filter((m) => m.sender_id === otherId && m.recipient_id === myId && !m.recipient_delivered_at)
          .map((m) => m.id);
        if (incomingIds.length) void markIncomingDmDelivered(otherId, incomingIds);
        void refreshPeerDmReadAt(otherId);
        const nowIso = new Date().toISOString();
        if (readStateApisAvailableRef.current) {
          const lastReadAt = rows.length > 0 ? rows[rows.length - 1].created_at : nowIso;
          const { error: rsErr } = await supabase.from('erp_dm_read_state').upsert(
            {
              user_id: myId,
              peer_id: otherId,
              last_read_at: lastReadAt,
              updated_at: nowIso,
            },
            { onConflict: 'user_id,peer_id' },
          );
          if (rsErr && isSupabaseSchemaMissingError(rsErr)) readStateApisAvailableRef.current = false;
        }
        await supabase
          .from('erp_notifications')
          .update({ read: true })
          .eq('user_id', myId)
          .eq('read', false)
          .like('link', `%/erp/messages?with=${otherId}%`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erp-notifications-reload'));
        }
      } catch (e) {
        setMsgErr(e?.message || 'Could not load messages');
        if (!silent) setMessages([]);
      } finally {
        if (!silent) setMsgLoading(false);
        void loadConversationSummaries();
      }
    },
    [myId, loadConversationSummaries, markIncomingDmDelivered, refreshPeerDmReadAt],
  );

  const loadGroupThread = useCallback(
    async (gid, opts) => {
      const loadId = ++groupThreadLoadGenRef.current;
      const silent = Boolean(opts?.silent);
      if (!myId || !gid) {
        if (!silent) setMessages([]);
        return;
      }
      if (!silent) setMsgLoading(true);
      setMsgErr('');
      try {
        const { data: clearRow, error: clearErr } = await supabase
          .from('erp_group_thread_clears')
          .select('cleared_at')
          .eq('user_id', myId)
          .eq('group_id', gid)
          .maybeSingle();
        const clearedAt = !clearErr && clearRow?.cleared_at ? clearRow.cleared_at : null;
        let q = supabase
          .from('erp_group_messages')
          .select('id, group_id, sender_id, body, created_at, edited_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, deleted_at, reply_to_id')
          .eq('group_id', gid)
          .order('created_at', { ascending: true })
          .limit(500);
        if (clearedAt) q = q.gt('created_at', clearedAt);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        if (loadId !== groupThreadLoadGenRef.current) return;
        const rows = data || [];
        setMessages(rows);
        void refreshGroupReadStates(gid);
        const nowIso = new Date().toISOString();
        if (readStateApisAvailableRef.current) {
          const lastReadAt = rows.length > 0 ? rows[rows.length - 1].created_at : nowIso;
          const { error: grsErr } = await supabase.from('erp_group_read_state').upsert(
            {
              user_id: myId,
              group_id: gid,
              last_read_at: lastReadAt,
              updated_at: nowIso,
            },
            { onConflict: 'user_id,group_id' },
          );
          if (grsErr && isSupabaseSchemaMissingError(grsErr)) readStateApisAvailableRef.current = false;
        }
        await supabase
          .from('erp_notifications')
          .update({ read: true })
          .eq('user_id', myId)
          .eq('read', false)
          .like('link', `%/erp/messages?group=${gid}%`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erp-notifications-reload'));
        }
      } catch (e) {
        setMsgErr(e?.message || 'Could not load messages');
        if (!silent) setMessages([]);
      } finally {
        if (!silent) setMsgLoading(false);
        void loadConversationSummaries();
      }
    },
    [myId, loadConversationSummaries, refreshGroupReadStates],
  );

  useEffect(() => {
    if (!myId) return;
    void loadConversationSummaries();
  }, [myId, loadConversationSummaries]);

  useEffect(() => {
    if (!myId) return;
    const ch = supabase
      .channel(`erp-dm-inbox-${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_direct_messages', filter: `recipient_id=eq.${myId}` },
        () => void loadConversationSummaries(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_direct_messages', filter: `sender_id=eq.${myId}` },
        () => void loadConversationSummaries(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, loadConversationSummaries]);

  useEffect(() => {
    if (!myId || !groups?.length) return;
    const ch = supabase.channel(`erp-gmsg-inbox-${myId}`);
    for (const g of groups) {
      ch.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'erp_group_messages',
          filter: `group_id=eq.${g.id}`,
        },
        () => void loadConversationSummaries(),
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, groups, loadConversationSummaries]);

  useEffect(() => {
    if (groupId && myId) {
      void loadGroupThread(groupId);
      return;
    }
    if (withId && myId) {
      void loadThread(withId);
      return;
    }
    setMessages([]);
  }, [withId, groupId, myId, loadThread, loadGroupThread]);

  useEffect(() => {
    if (!myId || !withId || groupId) {
      setPeerDmReadAt(null);
      return;
    }
    void refreshPeerDmReadAt(withId);
    const ch = supabase
      .channel(`erp-dm-peer-read-${myId}-${withId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_dm_read_state', filter: `user_id=eq.${withId}` },
        (payload) => {
          const row = payload.new;
          if (!row || row.peer_id !== myId) return;
          if (row.last_read_at) setPeerDmReadAt(row.last_read_at);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, withId, groupId, refreshPeerDmReadAt]);

  const lastMessageAnchorId = messages.length ? messages[messages.length - 1]?.id : null;

  /** Pin thread to newest message after load and when the list grows (immediate, correct scroll parent). */
  useLayoutEffect(() => {
    const el = threadScrollRef.current;
    if (!el || msgLoading) return;
    el.scrollTop = el.scrollHeight;
  }, [msgLoading, withId, groupId, lastMessageAnchorId]);

  useEffect(() => {
    if (!myId || !withId || groupId) return;
    const filterRecipient = `recipient_id=eq.${myId}`;
    const filterSender = `sender_id=eq.${myId}`;
    const upsertDmRow = (row) => {
      if (!row?.id) return;
      const sid = row.sender_id;
      const rid = row.recipient_id;
      const inThread =
        (sid === myId && rid === withId) || (sid === withId && rid === myId);
      if (!inThread) return;
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === row.id);
        if (i < 0) return [...prev, row];
        const next = [...prev];
        next[i] = { ...next[i], ...row };
        return next;
      });
    };
    const ch = supabase
      .channel(`erp-dm-${myId}-${withId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_direct_messages', filter: filterRecipient },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          const sid = row.sender_id;
          const rid = row.recipient_id;
          if (
            (sid === myId && rid === withId) ||
            (sid === withId && rid === myId)
          ) {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            if (sid === withId && rid === myId && !row.recipient_delivered_at) {
              void markIncomingDmDelivered(withId, [row.id]);
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_direct_messages', filter: filterSender },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          const sid = row.sender_id;
          const rid = row.recipient_id;
          if (
            (sid === myId && rid === withId) ||
            (sid === withId && rid === myId)
          ) {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'erp_direct_messages', filter: filterRecipient },
        (payload) => upsertDmRow(payload.new),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'erp_direct_messages', filter: filterSender },
        (payload) => upsertDmRow(payload.new),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, withId, groupId, markIncomingDmDelivered]);

  useEffect(() => {
    if (!myId || !groupId || withId) return;
    const ch = supabase
      .channel(`erp-gmsg-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'erp_group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, groupId, withId]);

  useEffect(() => {
    if (!myId || !groupId || withId) return undefined;
    const ch = supabase
      .channel(`erp-grs-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_group_read_state', filter: `group_id=eq.${groupId}` },
        () => void refreshGroupReadStates(groupId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, groupId, withId, refreshGroupReadStates]);

  useEffect(() => {
    setReplyTarget(null);
  }, [withId, groupId]);

  // Realtime: react to other people's emoji reactions on this thread.
  // We subscribe broadly and filter to the current thread client-side because
  // postgres_changes can't filter by an `IN (…)` set of message ids.
  useEffect(() => {
    if (!myId) return undefined;
    if (!withId && !groupId) return undefined;
    const inGroup = Boolean(groupId);
    const channelName = inGroup
      ? `erp-rxn-g-${groupId}-${myId}`
      : `erp-rxn-dm-${myId}-${withId}`;
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_dm_reactions' },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          if (inGroup ? !row.group_message_id : !row.dm_message_id) return;
          if (row.user_id === myId) return; // optimistic insert already covers viewer
          applyLocalReactionRow(row);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'erp_dm_reactions' },
        (payload) => {
          const row = payload.old;
          if (!row?.id) return;
          if (inGroup ? !row.group_message_id : !row.dm_message_id) return;
          removeLocalReactionRow(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [myId, withId, groupId, applyLocalReactionRow, removeLocalReactionRow]);

  function selectUser(id) {
    router.replace(`/erp/messages?with=${encodeURIComponent(id)}`, { scroll: false });
    setMobileDmTab('chat');
  }

  function selectGroup(id) {
    router.replace(`/erp/messages?group=${encodeURIComponent(id)}`, { scroll: false });
    setMobileDmTab('chat');
  }

  function toggleNewGroupMember(uid) {
    setNewGroupMemberIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!myId || !name || createGroupBusy) return;
    const others = newGroupMemberIds.filter((id) => id !== myId);
    if (others.length === 0) {
      setCreateGroupErr('Choose at least one other person for the group.');
      return;
    }
    setCreateGroupBusy(true);
    setCreateGroupErr('');
    try {
      const { data: gRow, error: gErr } = await supabase
        .from('erp_message_groups')
        .insert({ name, created_by: myId })
        .select('id, name, created_by, updated_at')
        .single();
      if (gErr || !gRow?.id) throw new Error(gErr?.message || 'Could not create group');
      const memberRows = [{ group_id: gRow.id, user_id: myId }, ...others.map((uid) => ({ group_id: gRow.id, user_id: uid }))];
      const { error: mErr } = await supabase.from('erp_message_group_members').insert(memberRows);
      if (mErr) {
        await supabase.from('erp_message_groups').delete().eq('id', gRow.id);
        throw new Error(mErr.message);
      }
      setGroupModalOpen(false);
      setNewGroupName('');
      setNewGroupMemberIds([]);
      await loadGroups();
      selectGroup(gRow.id);
    } catch (e) {
      setCreateGroupErr(e?.message || 'Could not create group');
    } finally {
      setCreateGroupBusy(false);
    }
  }

  function toggleInviteMember(uid) {
    setInvitePickIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  async function submitGroupInvites() {
    if (!groupId || invitePickIds.length === 0 || inviteBusy) return;
    setInviteBusy(true);
    setInviteErr('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/dm/group-members', {
        method: 'POST',
        body: JSON.stringify({ groupId, inviteUserIds: invitePickIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not invite members');
      setGroupInviteModalOpen(false);
      setInvitePickIds([]);
      await loadGroupMembers(groupId);
      void loadGroups();
      void loadConversationSummaries();
    } catch (e) {
      setInviteErr(e?.message || 'Could not invite');
    } finally {
      setInviteBusy(false);
    }
  }

  async function executeLeaveGroup() {
    if (!groupId || !myId) return;
    setMsgErr('');
    try {
      const { error } = await supabase.from('erp_message_group_members').delete().eq('group_id', groupId).eq('user_id', myId);
      if (error) throw new Error(error.message);
      setConfirmLeaveGroupOpen(false);
      router.replace('/erp/messages', { scroll: false });
      setMessages([]);
      setGroupMembers([]);
      void loadGroups();
      void loadConversationSummaries();
    } catch (e) {
      setMsgErr(e?.message || 'Could not leave group');
    }
  }

  function wrapSelection(/* legacy – rich composer uses toolbar + selection */ before, after = before) {
    const r = composerRef.current;
    if (!r) return;
    if (before === '**') r.applyBold();
    else if (before === '*' && after === '*') r.applyItalic();
    else if (before === '~~') r.applyStrikethrough();
    else if (before === '`') r.applyInlineCode();
  }

  /** Inserts Markdown line-prefix syntax at the caret via plain snippet (composer may show rich text elsewhere). */
  function insertLinePrefix(prefix) {
    composerRef.current?.insertPlainText?.(prefix);
  }

  function insertLink() {
    composerRef.current?.applyLinkFromPrompt?.();
  }

  function insertEmoji(ch) {
    composerRef.current?.insertPlainText?.(ch);
  }

  function syncMentionFromValue(val, cursorPos) {
    if (!withId && !groupId) return;
    let i = cursorPos - 1;
    while (i >= 0) {
      const ch = val[i];
      if (ch === '@') {
        const before = i === 0 ? ' ' : val[i - 1];
        if (before === ' ' || before === '\n' || before === '\t' || i === 0) {
          const q = val.slice(i + 1, cursorPos);
          if (!/\s/.test(q)) {
            if (mentionAnchorRef.current !== i) {
              mentionAnchorRef.current = i;
              setMentionHighlight(0);
            }
            setMentionOpen(true);
            setMentionStart(i);
            setMentionEnd(cursorPos);
            setMentionQuery(q);
            return;
          }
        }
        break;
      }
      if (ch === ' ' || ch === '\n') break;
      i -= 1;
    }
    mentionAnchorRef.current = -1;
    setMentionOpen(false);
    setMentionStart(-1);
    setMentionEnd(-1);
    setMentionQuery('');
  }

  const syncMentionFromEditor = useCallback(() => {
    const root = composerRef.current?.getEditableRoot?.();
    if (!root) return;
    const { text, offset } = erpCaretOffsetInInnerText(root);
    syncMentionFromValue(text, offset);
  }, [withId, groupId]);

  function pickMention(user) {
    if (!user?.id || mentionStart < 0) return;
    const label = displayName(user).replace(/\s+/g, ' ');
    const insertText = `@${label} `;
    const root = composerRef.current?.getEditableRoot?.();
    if (root) {
      erpReplaceInnerTextSlice(root, mentionStart, mentionEnd, insertText);
      composerRef.current?.flushMarkdown?.();
    } else {
      const before = draft.slice(0, mentionStart);
      const after = draft.slice(mentionEnd);
      setDraft(`${before}${insertText}${after}`);
    }
    mentionAnchorRef.current = -1;
    setMentionOpen(false);
    setMentionStart(-1);
    setMentionEnd(-1);
    setMentionQuery('');
    requestAnimationFrame(() => {
      try {
        composerRef.current?.focus?.();
      } catch {
        /* ignore */
      }
    });
  }

  function onDmComposerKeyDown(e) {
    if (!mentionOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      mentionAnchorRef.current = -1;
      setMentionOpen(false);
      setMentionStart(-1);
      setMentionEnd(-1);
      setMentionQuery('');
      return;
    }
    if (dmMentionCandidates.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionHighlight((h) => Math.min(h + 1, dmMentionCandidates.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pickMention(dmMentionCandidates[mentionHighlight]);
    }
  }

  function insertMention() {
    if (!withId && !groupId) return;
    composerRef.current?.insertPlainText?.('@');
    requestAnimationFrame(() => syncMentionFromEditor());
  }

  useEffect(() => {
    if (!mentionOpen) return undefined;
    setMentionHighlight((h) => {
      if (!dmMentionCandidates.length) return 0;
      return Math.min(Math.max(0, h), dmMentionCandidates.length - 1);
    });
  }, [mentionOpen, dmMentionCandidates.length]);

  useEffect(() => {
    if (!mentionOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (mentionOpen) {
          mentionAnchorRef.current = -1;
          setMentionOpen(false);
          setMentionStart(-1);
          setMentionEnd(-1);
          setMentionQuery('');
        }
      }
    };
    const onPointer = (e) => {
      const t = e.target;
      if (mentionPickerRef.current && t instanceof Node && mentionPickerRef.current.contains(t)) return;
      if (mentionComboRef.current && t instanceof Node && mentionComboRef.current.contains(t)) return;
      if (mentionOpen) {
        mentionAnchorRef.current = -1;
        setMentionOpen(false);
        setMentionStart(-1);
        setMentionEnd(-1);
        setMentionQuery('');
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [mentionOpen]);

  const addPendingFiles = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMsgErr('');
    setPendingFiles((prev) => {
      const merged = mergeUniqueFiles(incoming, prev);
      const out = [...prev];
      for (const f of merged) {
        if (f.size > DM_MAX_FILE_BYTES) {
          setMsgErr(`"${f.name}" is too large. Max ${ERP_MAX_UPLOAD_MB} MB.`);
          continue;
        }
        if (out.length >= DM_MAX_FILES) {
          setMsgErr(`At most ${DM_MAX_FILES} files per message.`);
          break;
        }
        out.push(f);
      }
      return out;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  function onChatDragEnter(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  }

  function onChatDragOver(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function onChatDragLeave(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingFile(false);
  }

  function onChatDrop(e) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    addPendingFiles(Array.from(e.dataTransfer.files));
  }

  function onChatPaste(e) {
    const files = collectFilesFromDataTransfer(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    addPendingFiles(files);
  }

  function send() {
    const text = draft.trim();
    const filesToUpload = pendingFiles.slice();
    if ((!text && filesToUpload.length === 0) || !myId) return;
    for (const f of filesToUpload) {
      if (f.size > DM_MAX_FILE_BYTES) {
        setMsgErr(`Each file must be ${ERP_MAX_UPLOAD_MB} MB or smaller.`);
        return;
      }
    }
    if (!groupId && !withId) return;

    // Snapshot the targets so async work uses the convo the user actually pressed Send on.
    const groupIdAtSend = groupId || null;
    const withIdAtSend = withId || null;
    const replyToId = replyTarget?.id ?? null;

    // Clear the composer right away so the user can keep typing/sending.
    setMsgErr('');
    setDraft('');
    setReplyTarget(null);
    try {
      composerRef.current?.replaceMarkdown?.('');
    } catch {}
    try {
      if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
    } catch {}
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    setInflightSends((n) => n + 1);

    sendChainRef.current = sendChainRef.current
      .catch(() => {})
      .then(async () => {
        const uploadedPaths = [];
        try {
          let attachmentRows = [];
          if (filesToUpload.length) {
            const folder = groupIdAtSend
              ? groupFolder(groupIdAtSend)
              : dmPairFolder(myId, withIdAtSend);
            // Parallel uploads — multiple files for the same message go up at once.
            attachmentRows = await Promise.all(
              filesToUpload.map(async (file) => {
                const blob = withGuessedErpFileMime(file);
                const fname = `${crypto.randomUUID()}_${safeFileBase(file.name)}`;
                const storagePath = `${folder}/${fname}`;
                const { error: upErr } = await supabase.storage.from('erp-files').upload(storagePath, blob, {
                  upsert: false,
                  contentType: blob.type || 'application/octet-stream',
                });
                if (upErr) throw new Error(upErr.message);
                uploadedPaths.push(storagePath);
                return {
                  path: storagePath,
                  name: file.name || 'file',
                  mime: blob.type || 'application/octet-stream',
                };
              }),
            );
          }

          if (groupIdAtSend) {
            const row = {
              group_id: groupIdAtSend,
              sender_id: myId,
              body: text || '',
            };
            if (replyToId) row.reply_to_id = replyToId;
            if (attachmentRows.length) row.attachments = attachmentRows;
            const { error } = await supabase.from('erp_group_messages').insert(row);
            if (error) throw new Error(error.message);
            // Only refresh the open thread/list if the user is still on this convo.
            if (groupIdRef.current === groupIdAtSend) {
              await loadGroupThread(groupIdAtSend, { silent: true });
            }
            void loadGroups();
          } else if (withIdAtSend) {
            const row = {
              sender_id: myId,
              recipient_id: withIdAtSend,
              body: text || '',
            };
            if (replyToId) row.reply_to_id = replyToId;
            if (attachmentRows.length) row.attachments = attachmentRows;
            const { data: insertedDm, error } = await supabase
              .from('erp_direct_messages')
              .insert(row)
              .select('id')
              .maybeSingle();
            if (error) throw new Error(error.message);
            if (insertedDm?.id) {
              erpAuthorizedFetch('/api/erp/notify-dm', {
                method: 'POST',
                body: JSON.stringify({ messageId: insertedDm.id }),
              }).catch(() => {});
            }
            if (withIdRef.current === withIdAtSend) {
              await loadThread(withIdAtSend, { silent: true });
            }
          }
        } catch (e) {
          if (uploadedPaths.length) {
            await supabase.storage.from('erp-files').remove(uploadedPaths).catch(() => {});
          }
          setMsgErr(e?.message || 'Could not send');
        } finally {
          setInflightSends((n) => Math.max(0, n - 1));
        }
      });
  }

  const canSend = (draft.trim() || pendingFiles.length > 0) && myId && (groupId || withId);
  const threadOpen = Boolean(withId || groupId);
  const canStartCall = Boolean(myId && (withId || groupId));

  const dmImageGallery = useMemo(
    () => buildChatImageGallery(messages, { normalizeAttachments: normalizeMessageAttachments }),
    [messages],
  );
  const messageById = useMemo(() => {
    const map = {};
    for (const row of messages) {
      if (row?.id) map[row.id] = row;
    }
    return map;
  }, [messages]);
  const groupAudienceIds = useMemo(
    () => (groupMembers || []).map((member) => member.id).filter(Boolean),
    [groupMembers],
  );

  const filteredConversations = useMemo(() => {
    let rows = conversationSummaries;
    if (inboxFilter === 'unread') rows = rows.filter((row) => row.unread > 0);
    else if (inboxFilter === 'groups') rows = rows.filter((row) => row.kind === 'group');
    else if (inboxFilter === 'mentions') rows = rows.filter((row) => /@\w/.test(String(row.preview || '')));
    const q = inboxSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (row) =>
          String(row.title || '')
            .toLowerCase()
            .includes(q) || String(row.preview || '').toLowerCase().includes(q),
      );
    }
    return sortDmConversations(rows, pinnedDmKeys);
  }, [conversationSummaries, inboxFilter, inboxSearch, pinnedDmKeys]);

  const activeConversationKey = useMemo(() => {
    if (withId) return `dm-${withId}`;
    if (groupId) return `group-${groupId}`;
    return null;
  }, [withId, groupId]);

  const activeConversationPinned = useMemo(
    () => Boolean(activeConversationKey && isDmConversationPinned(myId, activeConversationKey, pinnedDmKeys)),
    [myId, activeConversationKey, pinnedDmKeys],
  );

  const toggleActiveConversationPin = useCallback(() => {
    if (!myId || !activeConversationKey) return;
    setPinnedDmKeys(togglePinDmConversation(myId, activeConversationKey));
  }, [myId, activeConversationKey]);

  const toggleConversationPin = useCallback(
    (conversationKey) => {
      if (!myId || !conversationKey) return;
      setPinnedDmKeys(togglePinDmConversation(myId, conversationKey));
    },
    [myId],
  );

  const inboxPinnedConversations = useMemo(
    () => filteredConversations.filter((row) => isDmConversationPinned(myId, row.key, pinnedDmKeys)),
    [filteredConversations, myId, pinnedDmKeys],
  );

  const inboxRecentConversations = useMemo(
    () => filteredConversations.filter((row) => !isDmConversationPinned(myId, row.key, pinnedDmKeys)),
    [filteredConversations, myId, pinnedDmKeys],
  );

  const inboxFilterTabs = useMemo(
    () => [
      { id: 'all', label: 'All' },
      { id: 'unread', label: 'Unread', dot: conversationSummaries.some((row) => row.unread > 0) },
      { id: 'mentions', label: 'Mentions' },
      { id: 'groups', label: 'Groups' },
    ],
    [conversationSummaries],
  );

  const startReplyToMessage = useCallback(
    (message) => {
      if (!message?.id || message.deleted_at || message.kind === 'call') return;
      let label = 'Member';
      if (message.sender_id === myId) {
        label = 'You';
      } else if (groupId) {
        const member = groupMembers.find((user) => user.id === message.sender_id);
        if (member) label = displayName(member);
      } else if (selected?.id === message.sender_id) {
        label = displayName(selected);
      }
      setReplyTarget({
        id: message.id,
        label,
        snippet: dmMessageSnippet(message, myId),
      });
      requestAnimationFrame(() => {
        try {
          composerRef.current?.focus();
        } catch {
          /* ignore */
        }
      });
    },
    [myId, groupId, groupMembers, selected],
  );

  const clearMsgTouch = useCallback(() => {
    const st = msgTouchRef.current;
    if (st?.timer) window.clearTimeout(st.timer);
    msgTouchRef.current = null;
  }, []);

  useEffect(() => () => clearMsgTouch(), [clearMsgTouch]);

  const openMsgCtxAt = useCallback((clientX, clientY, messageId) => {
    setMsgCtxMenu({ x: clientX, y: clientY, messageId });
  }, []);

  const getMessageTouchHandlers = useCallback(
    (m) => {
      const canInteract = !m.deleted_at && m.kind !== 'call';
      if (!canInteract) return {};
      return {
        onContextMenu: (e) => {
          if (allowNativeLinkContextMenu(e)) return;
          e.preventDefault();
          e.stopPropagation();
          openMsgCtxAt(e.clientX, e.clientY, m.id);
        },
        onTouchStart: (e) => {
          if (isNativeLinkContextTarget(e.target)) return;
          if (e.touches.length !== 1) return;
          const touch = e.touches[0];
          clearMsgTouch();
          const timer = window.setTimeout(() => {
            try {
              navigator.vibrate?.(12);
            } catch {
              /* ignore */
            }
            openMsgCtxAt(touch.clientX, touch.clientY, m.id);
            msgTouchRef.current = null;
            setMsgSwipeDx(null);
          }, MSG_LONG_PRESS_MS);
          msgTouchRef.current = {
            timer,
            messageId: m.id,
            message: m,
            startX: touch.clientX,
            startY: touch.clientY,
            swipeDx: 0,
          };
        },
        onTouchMove: (e) => {
          const st = msgTouchRef.current;
          if (!st || st.messageId !== m.id || e.touches.length !== 1) return;
          const touch = e.touches[0];
          const dx = touch.clientX - st.startX;
          const dy = touch.clientY - st.startY;
          if (st.timer && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            window.clearTimeout(st.timer);
            st.timer = null;
          }
          if (!st.timer && dx > 8 && dx > Math.abs(dy)) {
            const clamped = Math.min(MSG_SWIPE_REPLY_MAX_PX, Math.max(0, dx));
            st.swipeDx = clamped;
            setMsgSwipeDx({ messageId: m.id, dx: clamped });
          }
        },
        onTouchEnd: () => {
          const st = msgTouchRef.current;
          if (!st || st.messageId !== m.id) return;
          if (st.timer) window.clearTimeout(st.timer);
          if (st.swipeDx >= MSG_SWIPE_REPLY_TRIGGER_PX) {
            startReplyToMessage(m);
          }
          msgTouchRef.current = null;
          setMsgSwipeDx(null);
        },
        onTouchCancel: () => {
          const st = msgTouchRef.current;
          if (!st || st.messageId !== m.id) return;
          if (st.timer) window.clearTimeout(st.timer);
          msgTouchRef.current = null;
          setMsgSwipeDx(null);
        },
      };
    },
    [clearMsgTouch, openMsgCtxAt, startReplyToMessage],
  );

  const scrollToDmMessage = useCallback((messageId) => {
    if (!messageId) return;
    const el = document.getElementById(`erp-dm-msg-${messageId}`);
    const pane = threadScrollRef.current;
    if (!el || !pane) return;
    const delta = el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    const next = pane.scrollTop + delta - pane.clientHeight / 2 + el.getBoundingClientRect().height / 2;
    pane.scrollTo({ top: Math.max(0, next), behavior: 'smooth' });
  }, []);

  const openDmMessageInfo = useCallback((message) => {
    if (!message || message.kind === 'call' || message.deleted_at) return;
    setDmMessageInfo(message);
  }, []);

  /** Open the in-app file preview for a chat attachment. Keeping this in
   *  parent state means the modal renders once at the bottom of the page and
   *  Esc/backdrop dismiss work uniformly across DM + group threads. */
  const openDmFilePreview = useCallback(
    (attachment) => {
      if (!attachment?.path) return;
      setDmFilePreview(
        mergePreviewWithGallery(
          {
            path: attachment.path,
            name: attachment.name || attachment.path.split('/').pop() || 'file',
            mime: attachment.mime || attachment.mimetype || null,
          },
          dmImageGallery,
        ),
      );
    },
    [dmImageGallery],
  );

  /** Inline-image / image-link clicks inside rendered markdown. The URL is
   *  already a usable signed/public link, so we hand it straight to the
   *  preview modal rather than trying to extract a storage path. */
  const openDmInlineMedia = useCallback(
    ({ url, name } = {}) => {
      if (!url) return;
      setDmFilePreview(
        mergePreviewWithGallery(
          {
            url,
            name: name || url.split('/').pop()?.split('?')[0] || 'image',
            mime: null,
          },
          dmImageGallery,
        ),
      );
    },
    [dmImageGallery],
  );

  /**
   * Called by the Jitsi modal with { hadPeer, durationSec }. If this was our
   * outgoing call AND someone actually joined, we log it as an "answered" call
   * in the shared chat thread so both sides see a call history entry.
   */
  const handleCloseJitsi = useCallback(
    (summary) => {
      const session = jitsiSession;
      setJitsiSession(null);
      if (!session || !session.isOutgoing) return;
      const hadPeer = Boolean(summary?.hadPeer);
      const durationSec = Math.max(0, Math.floor(Number(summary?.durationSec) || 0));
      if (!hadPeer) return;
      const body = session.groupId
        ? { groupId: session.groupId, audioOnly: Boolean(session.audioOnly), durationSec }
        : { peerUserId: session.peerUserId || withId, audioOnly: Boolean(session.audioOnly), durationSec };
      erpAuthorizedFetch('/api/erp/calls/log', {
        method: 'POST',
        body: JSON.stringify(body),
      }).catch(() => {});
    },
    [jitsiSession, withId],
  );

  const prepareJitsiRoom = useCallback(async () => {
    if (!withId && !groupId) throw new Error('No conversation open');
    const res = await erpAuthorizedFetch('/api/erp/calls/jitsi-room', {
      method: 'POST',
      body: JSON.stringify(groupId ? { groupId } : { peerUserId: withId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not create call room');
    if (!data?.roomName || !data?.domain) throw new Error('Invalid call room response');
    return data;
  }, [withId, groupId]);

  const startJitsiCall = useCallback(
    async (audioOnly, { ring = true } = {}) => {
      if (!canStartCall) return;
      setCallBusy(true);
      setMsgErr('');
      try {
        const data = await prepareJitsiRoom();
        const recipientName = groupId
          ? (selectedGroup?.name && String(selectedGroup.name).trim()) || 'group'
          : displayName(selected);
        setJitsiSession({
          roomName: data.roomName,
          domain: data.domain,
          joinUrl: data.joinUrl || `https://${data.domain}/${encodeURIComponent(data.roomName)}`,
          jwt: data.jwt || '',
          audioOnly,
          isOutgoing: ring,
          recipientName,
          peerUserId: groupId ? null : withId,
          groupId: groupId || null,
        });
        if (ring) {
          erpAuthorizedFetch('/api/erp/calls/ring', {
            method: 'POST',
            body: JSON.stringify(
              groupId ? { groupId, audioOnly } : { peerUserId: withId, audioOnly },
            ),
          }).catch(() => {});
        }
      } catch (e) {
        setMsgErr(e?.message || 'Could not start call');
      } finally {
        setCallBusy(false);
      }
    },
    [canStartCall, prepareJitsiRoom, groupId, withId, selected, selectedGroup],
  );

  const copyJitsiInviteLink = useCallback(async () => {
    if (!canStartCall) return;
    setCallBusy(true);
    setMsgErr('');
    try {
      const data = await prepareJitsiRoom();
      const url = data.joinUrl || `https://${data.domain}/${encodeURIComponent(data.roomName)}`;
      await navigator.clipboard.writeText(url);
    } catch (e) {
      setMsgErr(e?.message || 'Could not copy link');
    } finally {
      setCallBusy(false);
    }
  }, [canStartCall, prepareJitsiRoom]);

  /** Auto-answer when arriving via /erp/messages?...&join=1 (from an incoming-call notification). */
  const autoAnsweredRef = useRef(null);
  useEffect(() => {
    const join = searchParams.get('join');
    if (join !== '1' || !canStartCall || jitsiSession) return;
    const key = `${withId || ''}|${groupId || ''}`;
    if (autoAnsweredRef.current === key) return;
    autoAnsweredRef.current = key;
    const audio = searchParams.get('audio') === '1';
    void startJitsiCall(audio, { ring: false });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('join');
    params.delete('audio');
    const qs = params.toString();
    router.replace(`/erp/messages${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, canStartCall, jitsiSession, withId, groupId, startJitsiCall, router]);

  /**
   * If the user is the caller (outgoing call still ringing) and the recipient declines
   * or doesn't answer, close the empty Jitsi modal automatically — no point sitting in
   * a solo room. We rely on the global `erp-call-signal` event dispatched by ErpShell.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function onSignal() {
      setJitsiSession((cur) => {
        if (!cur || !cur.isOutgoing) return cur;
        return null;
      });
    }
    window.addEventListener('erp-call-signal', onSignal);
    return () => window.removeEventListener('erp-call-signal', onSignal);
  }, []);

  const renderInboxConversationRow = useCallback(
    (row) => {
      const peerProf = row.kind === 'dm' ? directory.find((u) => u.id === row.peerId) : null;
      const timeLabel = formatInboxTime(row.lastAt);
      const unread = row.unread > 99 ? '99+' : String(row.unread);
      const hasUnread = row.unread > 0;
      const pinned = isDmConversationPinned(myId, row.key, pinnedDmKeys);
      return (
        <li key={row.key}>
          <button
            type="button"
            onClick={() => (row.kind === 'dm' ? selectUser(row.peerId) : selectGroup(row.groupId))}
            onContextMenu={(e) => {
              e.preventDefault();
              setConvCtxMenu({ x: e.clientX, y: e.clientY, row });
            }}
            className={`group/conv flex w-full touch-manipulation items-center gap-3 border-b border-slate-100/90 px-4 py-3.5 text-left transition active:bg-slate-50 dark:border-teal-900/30 dark:active:bg-white/[0.04] ${
              hasUnread ? 'bg-slate-50/80 dark:bg-teal-950/20' : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.03]'
            }`}
          >
            {row.kind === 'dm' ? (
              <span className="relative shrink-0">
                <ErpAvatarWithOnline
                  presenceUserId={peerProf?.id || row.peerId}
                  lastActiveAt={peerProf?.last_active_at}
                  size="md"
                >
                  <ErpUserAvatar
                    profile={
                      peerProf
                        ? { full_name: peerProf.full_name, role: peerProf.role, avatar_path: peerProf.avatar_path }
                        : { full_name: row.title }
                    }
                    email={peerProf?.email}
                    size="md"
                    className="!h-12 !w-12"
                    alt={row.title}
                  />
                </ErpAvatarWithOnline>
              </span>
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-[#103D4D] text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-[#0a1218]">
                {(row.title || 'G').slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`truncate text-[15px] ${hasUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-900 dark:text-slate-100'}`}
                >
                  {row.title}
                </p>
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  {pinned ? (
                    <ErpIconPin filled className="h-3.5 w-3.5 text-amber-500" />
                  ) : null}
                  {timeLabel ? (
                    <span
                      className={`text-[11px] tabular-nums ${hasUnread ? 'font-semibold text-[#103D4D] dark:text-teal-300' : 'text-slate-400 dark:text-slate-500'}`}
                    >
                      {timeLabel}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p
                  className={`min-w-0 flex-1 truncate text-[13px] leading-snug ${hasUnread ? 'font-medium text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {row.preview}
                </p>
                {row.unread > 0 ? (
                  <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[#103D4D] px-1.5 text-[10px] font-bold leading-none text-white dark:bg-teal-500">
                    {unread}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleConversationPin(row.key);
              }}
              className="ml-1 hidden shrink-0 rounded-lg p-1.5 text-amber-500 opacity-0 transition hover:bg-amber-50 group-hover/conv:opacity-100 dark:hover:bg-amber-950/30 sm:inline-flex"
              title={pinned ? 'Unpin chat' : 'Pin chat'}
              aria-label={pinned ? 'Unpin chat' : 'Pin chat'}
            >
              <ErpIconPin filled={pinned} className="h-4 w-4" />
            </button>
          </button>
        </li>
      );
    },
    [directory, myId, pinnedDmKeys, selectGroup, selectUser, toggleConversationPin],
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden max-lg:h-full lg:h-full lg:min-h-0 dark:bg-[#0a1218] ${
        threadOpen ? 'gap-0 pb-0' : 'gap-0 pb-0 lg:gap-4 lg:pb-2'
      }`}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden max-lg:h-full lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_min(24rem,32%)] lg:items-stretch lg:gap-0 lg:overflow-hidden dark:bg-[#0a1218] ${
          threadOpen ? 'min-h-0 flex-1' : 'lg:flex-1'
        }`}
      >
      <aside
        className={`flex max-lg:w-full flex-col overflow-hidden bg-white dark:!bg-[#0c1820] lg:col-start-2 lg:row-start-1 lg:max-h-full lg:min-h-0 lg:w-auto lg:max-w-[28rem] lg:justify-self-end lg:rounded-3xl lg:border lg:border-cyan-200/60 lg:bg-gradient-to-b lg:from-white lg:to-cyan-50/25 lg:p-4 lg:shadow-md lg:shadow-cyan-900/5 lg:ring-1 lg:ring-cyan-900/[0.06] dark:lg:border-teal-800/45 dark:lg:bg-gradient-to-b dark:lg:from-[#0c1820] dark:lg:to-[#080d12] dark:lg:shadow-black/30 dark:lg:ring-teal-900/30 sm:rounded-2xl sm:p-3 ${
          mobileDmTab === 'people' ? 'max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-hidden' : 'max-lg:hidden'
        } ${threadOpen ? 'max-lg:hidden lg:flex' : 'lg:flex'}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-teal-900/35 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileDmTab('chat')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Back to messages"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">New message</h2>
        </div>
        <div className="mb-3 hidden flex-col gap-3 sm:mb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 lg:flex">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#103D4D]/80 dark:text-teal-300/90">
            Workspace members
          </label>
          <button
            type="button"
            onClick={() => {
              setNewGroupName('');
              setNewGroupMemberIds([]);
              setCreateGroupErr('');
              setGroupModalOpen(true);
            }}
            className="min-h-[44px] w-full touch-manipulation rounded-xl erp-brand-fill px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-md shadow-[#103D4D]/20 transition sm:min-h-0 sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[10px] sm:shadow-sm"
          >
            New group
          </button>
        </div>
        {dirLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
          </div>
        ) : dirErr ? (
          <p className="text-sm text-red-600 py-4">{dirErr}</p>
        ) : directory.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No workspace profiles to show.</p>
        ) : (
          <div className="mb-0 flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin] lg:mb-0 lg:px-0 lg:pb-0">
            <ErpTeamDirectoryGrid
              users={directory}
              loading={false}
              mode="dm"
              dense
              unlimitedListHeight
              search={query}
              onSearchChange={setQuery}
              showBulkActions={false}
              dmActiveId={!groupId ? withId : null}
              onDmPick={(id) => selectUser(id)}
            />
          </div>
        )}
      </aside>

      <section
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:!bg-[#0a1218] lg:col-start-1 lg:row-start-1 ${
          mobileDmTab === 'chat' ? 'flex max-lg:min-h-0 max-lg:flex-1' : 'max-lg:hidden'
        } ${
          threadOpen
            ? 'h-full min-h-0 rounded-none border-0 shadow-none ring-0 max-lg:flex-1'
            : 'max-lg:h-full max-lg:min-h-0 max-lg:flex-1 min-h-[280px] sm:min-h-[320px] lg:h-full lg:flex-1 lg:rounded-3xl lg:border lg:border-cyan-200/50 lg:shadow-md lg:ring-1 lg:ring-cyan-900/[0.05] dark:lg:border-teal-800/45 dark:lg:ring-teal-900/30'
        }`}
      >
        {!withId && !groupId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white max-lg:h-full dark:!bg-[#0a1218]">
            <div className="shrink-0 border-b border-slate-100 bg-white px-4 pb-3 pt-[max(0.25rem,env(safe-area-inset-top))] dark:border-teal-900/35 dark:!bg-[#0a1218] lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[1.65rem] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                  Messages
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileDmTab('people')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#103D4D]/10 text-[#103D4D] ring-1 ring-[#103D4D]/15 transition hover:bg-[#103D4D]/15 active:scale-95 dark:bg-teal-500/15 dark:text-teal-200 dark:ring-teal-500/25 dark:hover:bg-teal-500/25"
                  aria-label="New message"
                >
                  <IconCompose className="h-[18px] w-[18px]" />
                </button>
              </div>
              <label className="relative mt-3 block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                  <IconSearch className="h-[18px] w-[18px]" />
                </span>
                <input
                  type="search"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Search messages…"
                  className="w-full rounded-xl border border-slate-200/90 bg-slate-50/90 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#103D4D]/35 focus:bg-white focus:ring-2 focus:ring-[#103D4D]/10 dark:border-teal-900/45 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50 dark:focus:ring-teal-500/15"
                />
              </label>
              <div
                className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Filter conversations"
              >
                {inboxFilterTabs.map((tab) => {
                  const active = inboxFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setInboxFilter(tab.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition touch-manipulation ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm dark:bg-teal-100 dark:text-slate-900'
                          : 'border border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 dark:border-teal-900/45 dark:bg-[#121f28] dark:text-slate-300 dark:hover:border-teal-800/60'
                      }`}
                    >
                      {tab.label}
                      {tab.dot && !active ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative hidden shrink-0 overflow-hidden border-b border-teal-900/10 erp-brand-fill px-4 py-3.5 shadow-md shadow-teal-900/15 sm:px-5 lg:block">
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-6 left-1/4 h-24 w-40 rounded-full bg-teal-300/15 blur-xl"
                aria-hidden
              />
              <p className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/95">
                Inbox
              </p>
              <h2 className="relative mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">Messages</h2>
              <p className="relative mt-0.5 max-w-md text-xs leading-snug text-cyan-100/90">
                Your recent direct and group chats
              </p>
            </div>
            {convListLoading && conversationSummaries.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
              </div>
            ) : filteredConversations.length > 0 ? (
              <>
                {inboxPinnedConversations.length > 0 ? (
                  <p className="shrink-0 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600/90 dark:text-amber-400/90 lg:pt-2">
                    Pinned
                  </p>
                ) : null}
                <ul className="min-h-0 flex-1 overflow-y-auto pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))] [scrollbar-color:rgba(16,61,77,0.25)_transparent] [scrollbar-width:thin] lg:pb-0">
                  {inboxPinnedConversations.map(renderInboxConversationRow)}
                  {inboxRecentConversations.length > 0 && inboxPinnedConversations.length > 0 ? (
                    <li aria-hidden className="list-none">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        Recent
                      </p>
                    </li>
                  ) : inboxRecentConversations.length > 0 ? (
                    <li aria-hidden className="list-none">
                      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 lg:pt-2">
                        Recent
                      </p>
                    </li>
                  ) : null}
                  {inboxRecentConversations.map(renderInboxConversationRow)}
                </ul>
              </>
            ) : conversationSummaries.length > 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No matches</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Try another search or filter.</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center sm:py-16">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-200/90 to-teal-100 shadow-inner ring-2 ring-cyan-200/80 dark:from-teal-950/60 dark:to-[#0f1a22] dark:ring-teal-800/45"
                  aria-hidden
                >
                  <svg className="h-7 w-7 text-[#103D4D] dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path
                      d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8.5z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#103D4D] dark:text-teal-200">No conversations yet</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-600 dark:text-slate-400 lg:hidden">
                    Tap{' '}
                    <button
                      type="button"
                      onClick={() => setMobileDmTab('people')}
                      className="inline-flex h-7 w-7 translate-y-0.5 items-center justify-center rounded-full bg-[#103D4D]/10 align-middle text-[#103D4D] ring-1 ring-[#103D4D]/15 dark:bg-teal-500/15 dark:text-teal-200 dark:ring-teal-500/25"
                      aria-label="New message"
                    >
                      <IconCompose className="h-3.5 w-3.5" />
                    </button>{' '}
                    to start a chat with someone or create a group.
                  </p>
                  <p className="mt-1 hidden max-w-sm text-xs text-slate-600 dark:text-slate-400 lg:block">
                    Pick a person from the member list on the right, or create a group to start chatting.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 flex-nowrap items-center gap-2 border-b border-slate-100 px-3 py-3 dark:border-teal-900/35 dark:bg-[#0a1418]/95 sm:px-4 max-lg:pt-[max(0.75rem,env(safe-area-inset-top))]">
              {threadOpen ? (
                <button
                  type="button"
                  title="Back to conversations"
                  onClick={() => {
                    router.replace('/erp/messages', { scroll: false });
                    setMobileDmTab('chat');
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-xl border border-slate-200/90 bg-white text-[#103D4D] shadow-sm transition hover:bg-slate-50 active:scale-[0.98] dark:border-teal-800/50 dark:bg-[#121f28] dark:text-teal-200 dark:hover:bg-[#182630] sm:h-10 sm:w-10"
                  aria-label="Back to conversations"
                >
                  <IconChevronLeft className="h-5 w-5 shrink-0" />
                </button>
              ) : null}
              {groupId ? (
                selectedGroup ? (
                  <>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex shrink-0 items-center pt-0.5">
                        {groupMembersLoading ? (
                          <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200 ring-2 ring-white dark:bg-slate-700 dark:ring-slate-900" />
                        ) : groupMembers.length > 0 ? (
                          <div className="flex items-center pl-0.5">
                            {groupMembers.slice(0, 8).map((u, i) => (
                              <div
                                key={u.id}
                                className={`relative rounded-full ring-2 ring-white dark:ring-[#0a1418] ${i > 0 ? '-ml-2' : ''}`}
                                style={{ zIndex: 8 - i }}
                              >
                                <ErpAvatarWithOnline presenceUserId={u.id} lastActiveAt={u.last_active_at} size="sm">
                                  <ErpUserAvatar
                                    profile={{
                                      full_name: u.full_name,
                                      role: u.role,
                                      avatar_path: u.avatar_path,
                                    }}
                                    email={u.email}
                                    size="sm"
                                    className="!h-9 !w-9"
                                    alt={displayName(u)}
                                  />
                                </ErpAvatarWithOnline>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0a1418]">
                            {(selectedGroup.name || 'G').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900 dark:text-slate-100">{selectedGroup.name}</p>
                        <p className="line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                          {groupMembersLoading
                            ? 'Loading members…'
                            : groupMembers.length > 0
                              ? `${groupMembers.length} ${groupMembers.length === 1 ? 'member' : 'members'} · ${groupMembers.map((u) => displayName(u)).join(', ')}`
                              : 'Group chat'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={groupMembersLoading || !groupId}
                      onClick={() => {
                        setInvitePickIds([]);
                        setInviteErr('');
                        setGroupInviteModalOpen(true);
                      }}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-200/90 bg-gradient-to-r from-cyan-50 to-white px-2.5 py-2 text-xs font-bold text-[#103D4D] shadow-sm transition hover:border-cyan-300 hover:from-cyan-100/80 disabled:opacity-45 dark:border-teal-700/55 dark:bg-gradient-to-r dark:from-teal-950/70 dark:to-[#121f28] dark:text-teal-100 dark:hover:border-teal-600/60 dark:hover:from-teal-900/50 sm:px-3"
                      title="Invite workspace members"
                    >
                      <IconUserPlus className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                      <span className="hidden sm:inline">Invite</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmLeaveGroupOpen(true)}
                      disabled={!groupId || groupMembersLoading}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200/80 bg-white px-2.5 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-45 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-950/55 sm:px-3"
                      title="Leave group"
                    >
                      <span className="hidden sm:inline">Leave</span>
                      <span className="sm:hidden">×</span>
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400">Group</p>
                )
              ) : selected ? (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ErpAvatarWithOnline
                    presenceUserId={selected.id}
                    lastActiveAt={selected.last_active_at}
                    size="md"
                  >
                    <ErpUserAvatar
                      profile={{ full_name: selected.full_name, role: selected.role, avatar_path: selected.avatar_path }}
                      size="md"
                      className="!h-10 !w-10 shrink-0"
                      alt={displayName(selected)}
                    />
                  </ErpAvatarWithOnline>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900 dark:text-slate-100">{displayName(selected)}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-teal-300/70">
                      {selected.email?.trim() ? (
                        <span className="text-slate-600 dark:text-slate-400">{selected.email.trim()}</span>
                      ) : (
                        <span className="capitalize text-slate-600 dark:text-slate-400">{erpWorkspaceSubtitle(selected)}</span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">Conversation</p>
              )}
              {threadOpen && canStartCall ? (
                <>
                  <button
                    type="button"
                    disabled={callBusy}
                    onClick={() => void startJitsiCall(true)}
                    title="Voice call"
                    aria-label="Voice call"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/90 bg-gradient-to-br from-cyan-50 to-white text-cyan-700 shadow-sm transition hover:border-cyan-300 hover:from-cyan-100 hover:text-cyan-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/55 dark:bg-gradient-to-br dark:from-teal-950/90 dark:to-[#0f1820] dark:text-teal-200 dark:shadow-none dark:hover:border-teal-500/50 dark:hover:from-teal-900/80 dark:hover:to-[#121f28] dark:hover:text-teal-100 sm:h-10 sm:w-10"
                  >
                    <IconPhoneCall className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    disabled={callBusy}
                    onClick={() => void startJitsiCall(false)}
                    title="Video call"
                    aria-label="Video call"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200/90 bg-gradient-to-br from-teal-50 to-white text-teal-700 shadow-sm transition hover:border-teal-300 hover:from-teal-100 hover:text-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/55 dark:bg-gradient-to-br dark:from-teal-950/90 dark:to-[#0f1820] dark:text-teal-200 dark:shadow-none dark:hover:border-teal-500/50 dark:hover:from-teal-900/80 dark:hover:to-[#121f28] dark:hover:text-teal-100 sm:h-10 sm:w-10"
                  >
                    <IconVideoCall className="h-[18px] w-[18px]" />
                  </button>
                </>
              ) : null}
              {threadOpen ? (
                <div className="relative shrink-0" ref={headerMenuRef}>
                  <button
                    type="button"
                    title="More options"
                    aria-label="More options"
                    aria-haspopup="menu"
                    aria-expanded={headerMenuOpen}
                    onClick={() => setHeaderMenuOpen((v) => !v)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-[#103D4D] shadow-sm transition hover:bg-slate-50 active:scale-[0.98] dark:border-teal-800/50 dark:bg-[#121f28] dark:text-teal-200 dark:hover:bg-[#182630] sm:h-10 sm:w-10"
                  >
                    <IconDotsVertical className="h-5 w-5" />
                  </button>
                  {headerMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-teal-800/50 dark:bg-[#0d141c] dark:ring-teal-950/40"
                    >
                      {activeConversationKey ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            toggleActiveConversationPin();
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          <ErpIconPin filled={activeConversationPinned} className="h-[18px] w-[18px] text-amber-500" />
                          {activeConversationPinned ? 'Unpin chat' : 'Pin chat'}
                        </button>
                      ) : null}
                      {canStartCall ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={callBusy}
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            void copyJitsiInviteLink();
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          <IconLinkSimple className="h-[18px] w-[18px] text-slate-500" />
                          Copy meeting link
                        </button>
                      ) : null}
                      {canClearThread ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            setClearThreadTyped('');
                            setClearThreadErr('');
                            setClearThreadOpen(true);
                          }}
                          className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/35 ${
                            canStartCall ? 'border-t border-slate-100 dark:border-teal-900/35' : ''
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-[18px] w-[18px] text-rose-500"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <path d="M3 6h18" strokeLinecap="round" />
                            <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Clear chat
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </header>

            {threadOpen && messagePins.length > 0 ? (
              <ErpPinnedMessagesBar
                pins={messagePins}
                activeIndex={pinnedMsgIndex}
                onActiveIndexChange={setPinnedMsgIndex}
                getMessage={(id) => messageById[id] || messages.find((row) => row.id === id) || null}
                getSenderLabel={(msg) => {
                  if (msg.sender_id === myId) return 'You';
                  return nameById[msg.sender_id] || 'Member';
                }}
                getSnippet={(msg) => dmMessageSnippet(msg, myId)}
                onJump={scrollToDmMessage}
                onUnpin={(pinId) => void unpinMessageByPinId(pinId)}
              />
            ) : null}

            <div ref={threadScrollRef} className={ERP_WA_THREAD_CLASS}>
              {msgLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
                </div>
              ) : (
                messages.map((m, idx) => {
                  const mine = m.sender_id === myId;
                  if (m.kind === 'call') {
                    return <CallLogBubble key={m.id} msg={m} mine={mine} />;
                  }
                  const deleted = Boolean(m.deleted_at);
                  const hasText = !deleted && m.body && String(m.body).trim().length > 0;
                  const attList = deleted ? [] : normalizeMessageAttachments(m);
                  const imageAttList = attList.filter((a) => isChatImagePreviewItem(a));
                  const otherAttList = attList.filter((a) => !isChatImagePreviewItem(a));
                  const parent = m.reply_to_id ? messageById[m.reply_to_id] : null;
                  const parentLabel =
                    parent && parent.sender_id === myId
                      ? 'You'
                      : parent
                        ? nameById[parent.sender_id] || 'Member'
                        : null;
                  const groupSeenSummary =
                    mine && groupId && !deleted && m.kind !== 'call'
                      ? computeMessageSeenBy({
                          messageCreatedAt: m.created_at,
                          readStatesByUserId: groupReadByUserId,
                          audienceUserIds: groupAudienceIds,
                          excludeUserId: myId,
                          nameById,
                        })
                      : null;
                  const prev = messages[idx - 1];
                  const clusterStart = idx === 0 || !prev || prev.sender_id !== m.sender_id;
                  const senderProf = groupMemberById[m.sender_id];
                  const senderName = mine ? 'You' : nameById[m.sender_id] || 'Member';
                  const senderSubtitle =
                    groupId && !mine && clusterStart && senderProf ? erpWorkspaceSubtitle(senderProf) : '';
                  const selfProf = mine ? myGroupProfile : null;

                  const canEditDmMine =
                    mine &&
                    !deleted &&
                    m.kind !== 'call' &&
                    Boolean(myId) &&
                    canEditChatMessageByAge(m.created_at);
                  const editingDm = dmEditingMsgId === m.id;

                  const msgReactions = reactions[m.id] || [];
                  const canReactToMsg =
                    Boolean(myId) && !deleted && m.kind !== 'call' && !editingDm;
                  const myReactedEmojis = canReactToMsg
                    ? new Set(
                        msgReactions
                          .filter((r) => r.user_id === myId)
                          .map((r) => r.emoji),
                      )
                    : null;
                  const reactionsBar =
                    msgReactions.length > 0 ? (
                      <ErpMessageReactionsBar
                        rows={msgReactions}
                        viewerId={myId}
                        mine={mine}
                        onToggle={canReactToMsg ? (emoji) => void toggleMyReaction(m, emoji) : undefined}
                        nameById={nameById}
                      />
                    ) : null;
                  const reactionLauncherEl = canReactToMsg ? (
                    <ErpMessageReactionLauncher
                      mine={mine}
                      reactedEmojis={myReactedEmojis}
                      onPick={(emoji) => void toggleMyReaction(m, emoji)}
                    />
                  ) : null;
                  const canForwardMsg = !deleted && m.kind !== 'call';
                  const copyText = dmMessageCopyPlain(m, myId);
                  const copyLinksText = m.body ? chatMessageLinksToCopyText(m.body) : '';
                  const isPinnedMsg = pinnedMessageIds.has(m.id);
                  const canPinMsg = canForwardMsg && messagePinsEnabled;
                  const actionsMenuEl = canForwardMsg ? (
                    <ErpMessageActionsMenu
                      mine={mine}
                      showCopy={Boolean(copyText)}
                      showCopyLink={Boolean(copyLinksText)}
                      copyLinkLabel={m.body ? chatMessageCopyLinkLabel(m.body) : 'Copy link'}
                      showPin={canPinMsg && !isPinnedMsg}
                      showUnpin={canPinMsg && isPinnedMsg}
                      showReply
                      showForward
                      showInfo={mine}
                      showEdit={canEditDmMine && !editingDm}
                      showDelete={canAdminDelete || mine}
                      onCopy={() => void navigator.clipboard?.writeText(copyText).catch(() => {})}
                      onCopyLink={() => void navigator.clipboard?.writeText(copyLinksText).catch(() => {})}
                      onPin={() => void pinMessageById(m.id)}
                      onUnpin={() => {
                        const pinRow = messagePins.find((row) => pinRowMessageId(row) === m.id);
                        if (pinRow?.id) void unpinMessageByPinId(pinRow.id);
                      }}
                      onReply={() => startReplyToMessage(m)}
                      onForward={() => {
                        let sName = 'Member';
                        if (m.sender_id === myId) {
                          sName = 'me';
                        } else if (groupId) {
                          const gm = groupMembers.find((u) => u.id === m.sender_id);
                          if (gm) sName = displayName(gm);
                        } else if (selected && selected.id === m.sender_id) {
                          sName = displayName(selected);
                        }
                        setForwardSourceMessage(
                          messageToForwardSource(m, sName),
                        );
                      }}
                      onInfo={() => openDmMessageInfo(m)}
                      onEdit={() => startDmEdit(m)}
                      onDelete={() => setConfirmDeleteDmMsgId(m.id)}
                    />
                  ) : null;
                  const launcherStack =
                    reactionLauncherEl || actionsMenuEl ? (
                      <div className={ERP_WA_LAUNCHER_COL}>
                        {actionsMenuEl}
                        {reactionLauncherEl}
                      </div>
                    ) : null;

                  const msgTouchHandlers = getMessageTouchHandlers(m);
                  const swipeDx = msgSwipeDx?.messageId === m.id ? msgSwipeDx.dx : 0;
                  const bubble = (
                    <div
                      className={`${erpWaBubbleClass(mine)} touch-manipulation`}
                      style={
                        swipeDx > 0
                          ? { transform: `translateX(${swipeDx}px)`, transition: swipeDx ? 'none' : undefined }
                          : undefined
                      }
                      {...msgTouchHandlers}
                    >
                      {!editingDm && !deleted && m.reply_to_id ? (
                        <button
                          type="button"
                          onClick={() => scrollToDmMessage(m.reply_to_id)}
                          className={erpWaReplyQuoteClass(mine)}
                        >
                          <span
                            className={`block text-[11px] font-semibold text-[#027eb5] dark:text-[#53bdeb]`}
                          >
                            {parentLabel ? parentLabel : 'Reply'}
                          </span>
                          <span className="mt-0.5 line-clamp-2 opacity-90">
                            {parent ? dmMessageSnippet(parent, myId) : 'Original message unavailable'}
                          </span>
                        </button>
                      ) : null}
                      {editingDm ? (
                        <ErpChatMessageEditBox
                          value={dmEditingDraft}
                          onChange={setDmEditingDraft}
                          onCancel={cancelDmEdit}
                          onSave={() => void saveDmEdit()}
                          busy={dmEditBusy}
                          mine={mine}
                        />
                      ) : deleted ? (
                        <p className={`text-sm italic opacity-70 ${mine ? '' : 'text-slate-500 dark:text-slate-400'}`}>
                          {ERP_CHAT_DELETED_PLACEHOLDER}
                        </p>
                      ) : hasText ? (
                        <ChatMessageHtml
                          text={m.body}
                          onMediaOpen={openDmInlineMedia}
                          readMore
                          readMoreClassName={erpWaReadMoreClass(mine)}
                          className={erpWaBubbleBodyClass(mine)}
                        />
                      ) : null}
                      {imageAttList.length ? (
                        <div className={hasText || editingDm ? 'mt-1.5' : ''}>
                          {imageAttList.length === 1 ? (
                            <DmAttachmentView
                              path={imageAttList[0].path}
                              name={imageAttList[0].name}
                              mime={imageAttList[0].mime}
                              mine={mine}
                              onPreview={openDmFilePreview}
                            />
                          ) : (
                            <ErpChatImageAlbum attachments={imageAttList} onPreview={openDmFilePreview} />
                          )}
                        </div>
                      ) : null}
                      {otherAttList.length ? (
                        <div className={hasText || editingDm || imageAttList.length ? 'mt-1.5 space-y-1' : 'space-y-1'}>
                          {otherAttList.map((a, ai) => (
                            <DmAttachmentView
                              key={`${a.path}-${ai}`}
                              path={a.path}
                              name={a.name}
                              mime={a.mime}
                              mine={mine}
                              onPreview={openDmFilePreview}
                            />
                          ))}
                        </div>
                      ) : null}
                      {!editingDm ? (
                        <div className={`mt-0.5 flex flex-wrap items-end justify-end gap-1 ${mine ? '' : 'justify-start'}`}>
                          <p className={erpWaMetaClass(mine)}>
                            {new Date(m.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {m.edited_at ? ' · Edited' : ''}
                          </p>
                          {mine && !deleted && m.kind !== 'call' ? (
                            groupId ? (
                              <GroupReceiptTicks
                                seenCount={groupSeenSummary?.seenCount || 0}
                                totalCount={groupSeenSummary?.totalCount || 0}
                                mineTone
                                onClick={() => openDmMessageInfo(m)}
                              />
                            ) : (
                              <DmReceiptTicks
                                read={messageReadByCursor(m.created_at, peerDmReadAt)}
                                delivered={Boolean(m.recipient_delivered_at)}
                                onClick={() => openDmMessageInfo(m)}
                              />
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );

                  if (!groupId) {
                    return (
                      <div key={m.id} id={`erp-dm-msg-${m.id}`} className={erpWaMessageRowClass(mine)}>
                        <div
                          className={`flex ${ERP_WA_MSG_MAX} min-w-0 flex-col ${
                            mine ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div className={erpWaBubbleRowClass(mine)}>
                            {launcherStack}
                            <div className="min-w-0 max-w-full">{bubble}</div>
                          </div>
                          {reactionsBar}
                        </div>
                      </div>
                    );
                  }

                  if (mine) {
                    return (
                      <div key={m.id} id={`erp-dm-msg-${m.id}`} className={`${erpWaMessageRowClass(true)} gap-2`}>
                        <div className={`flex min-w-0 ${ERP_WA_MSG_MAX} flex-col items-end`}>
                          {clusterStart ? (
                            <p className="mb-0.5 pr-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              You
                            </p>
                          ) : null}
                          <div className={erpWaBubbleRowClass(true)}>
                            {launcherStack}
                            <div className="min-w-0 max-w-full">{bubble}</div>
                          </div>
                          {reactionsBar}
                        </div>
                        <div className="flex w-9 shrink-0 flex-col justify-end pb-0.5">
                          {clusterStart ? (
                            <ErpUserAvatar
                              profile={
                                selfProf
                                  ? {
                                      full_name: selfProf.full_name,
                                      role: selfProf.role,
                                      avatar_path: selfProf.avatar_path,
                                    }
                                  : { full_name: 'You' }
                              }
                              email={selfProf?.email}
                              size="sm"
                              className="!h-9 !w-9"
                              alt="You"
                            />
                          ) : (
                            <span className="block h-1 w-9 shrink-0" aria-hidden />
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} id={`erp-dm-msg-${m.id}`} className={`${erpWaMessageRowClass(false)} gap-2`}>
                      <div className="flex w-9 shrink-0 flex-col justify-end pb-0.5">
                        {clusterStart ? (
                          <ErpUserAvatar
                            profile={
                              senderProf
                                ? {
                                    full_name: senderProf.full_name,
                                    role: senderProf.role,
                                    avatar_path: senderProf.avatar_path,
                                  }
                                : { full_name: senderName }
                            }
                            email={senderProf?.email}
                            size="sm"
                            className="!h-9 !w-9"
                            alt={senderName}
                          />
                        ) : (
                          <span className="block h-1 w-9 shrink-0" aria-hidden />
                        )}
                      </div>
                      <div className={`min-w-0 ${ERP_WA_MSG_MAX} flex flex-col items-start`}>
                        {clusterStart ? (
                          <div className="mb-0.5 pl-0.5">
                            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{senderName}</p>
                            {senderSubtitle ? (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">{senderSubtitle}</p>
                            ) : null}
                          </div>
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

            <ErpInlineErrorAlert
              message={msgErr}
              toast={false}
              className="px-4 text-xs font-semibold text-rose-700 dark:text-rose-200"
            />

            <div
              className="relative z-[1] mt-auto shrink-0"
              onDragEnter={onChatDragEnter}
              onDragOver={onChatDragOver}
              onDragLeave={onChatDragLeave}
              onDrop={onChatDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={FILE_INPUT_ACCEPT}
                multiple
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  if (list.length) addPendingFiles(list);
                }}
              />
              <ErpChatComposer
                isDragging={isDraggingFile}
                onDragEnter={onChatDragEnter}
                onDragOver={onChatDragOver}
                onDragLeave={onChatDragLeave}
                onDrop={onChatDrop}
                replyBanner={
                  replyTarget ? (
                    <div className="border-b border-slate-100 px-2.5 py-2 dark:border-teal-900/35">
                      <div className="flex items-start justify-between gap-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/80 px-3 py-2 dark:border-teal-800/55 dark:bg-teal-950/35">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#0d3442]/80 dark:text-teal-300/95">
                            Replying to {replyTarget.label}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-700 dark:text-slate-300">{replyTarget.snippet}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyTarget(null)}
                          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null
                }
                pendingFiles={pendingFiles}
                onRemovePendingAt={(idx) => {
                  setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                pendingFilesHint={
                  pendingFiles.length
                    ? `${pendingFiles.length}/${DM_MAX_FILES} files · max ${ERP_MAX_UPLOAD_MB} MB each`
                    : null
                }
                onAttachClick={() => fileInputRef.current?.click()}
                onFilesPicked={addPendingFiles}
                onMentionClick={() => insertMention()}
                mentionDisabled={!withId && !groupId}
                canSend={canSend}
                onSend={() => void send()}
                sending={sending}
                inflightSends={inflightSends}
                onQuickEmoji={insertEmoji}
                getFormatState={() => composerRef.current?.getFormatState?.() ?? {}}
                composer={
                  <div
                    ref={mentionComboRef}
                    className="relative min-w-0"
                    role="combobox"
                    aria-expanded={mentionOpen}
                    aria-haspopup="listbox"
                    aria-controls="erp-dm-mention-listbox"
                  >
                    <ErpMarkdownWysComposer
                      key={`${draftStorageKey || 'idle'}-${composerBump}`}
                      ref={composerRef}
                      resetKey={`${draftStorageKey || 'idle'}-${composerBump}`}
                      initialMarkdown={draft}
                      onMarkdownChange={setDraft}
                      onComposerInput={syncMentionFromEditor}
                      onKeyDown={onDmComposerKeyDown}
                      onEnterSubmit={() => void send()}
                      onPaste={onChatPaste}
                      placeholder={
                        selected && !groupId
                          ? `Send to ${displayName(selected).replace(/\s+/g, ' ')}`
                          : selectedGroup
                            ? `Send to ${selectedGroup.name || 'group'}`
                            : 'Write a message…'
                      }
                      embedded
                    />
                    <ErpChatMentionPicker
                      open={mentionOpen}
                      anchorRef={mentionComboRef}
                      pickerRef={mentionPickerRef}
                      id="erp-dm-mention-listbox"
                    >
                      {dmMentionCandidates.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">No matching people.</p>
                      ) : (
                        dmMentionCandidates.map((u, idx) => (
                          <button
                            key={u.id}
                            type="button"
                            role="option"
                            aria-selected={idx === mentionHighlight}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                              idx === mentionHighlight
                                ? 'bg-[#B2EBF2]/50 text-slate-900 dark:bg-teal-900/55 dark:text-teal-50'
                                : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/80'
                            }`}
                            onMouseEnter={() => setMentionHighlight(idx)}
                            onMouseDown={(ev) => {
                              ev.preventDefault();
                              pickMention(u);
                            }}
                          >
                            <ErpUserAvatar profile={u} email={u.email} size="sm" alt="" className="h-7 w-7 text-[10px] shadow-none ring-1 ring-slate-200/80" />
                            <span className="min-w-0 truncate font-medium">{displayName(u)}</span>
                          </button>
                        ))
                      )}
                    </ErpChatMentionPicker>
                  </div>
                }
                toolbar={
                  <ErpChatFormatToolbar
                    onBold={() => wrapSelection('**')}
                    onItalic={() => wrapSelection('*')}
                    onUnderline={() => composerRef.current?.applyUnderline?.()}
                    onStrikethrough={() => wrapSelection('~~')}
                    onInlineCode={() => wrapSelection('`')}
                    onLink={insertLink}
                    onBlockquote={() => composerRef.current?.applyBlockquote?.()}
                    onBulletList={() => composerRef.current?.applyBulletList?.()}
                    onOrderedList={() => composerRef.current?.applyOrderedList?.()}
                    onHeading={(lvl) => composerRef.current?.applyHeading?.(lvl)}
                    onParagraph={() => composerRef.current?.applyParagraph?.()}
                    onCodeBlock={() => composerRef.current?.applyCodeBlock?.()}
                    onHorizontalRule={() => composerRef.current?.applyHorizontalRule?.()}
                    onUndo={() => composerRef.current?.applyUndo?.()}
                    onRedo={() => composerRef.current?.applyRedo?.()}
                    onRemoveFormat={() => composerRef.current?.applyRemoveFormat?.()}
                    extraActions={
                      <button
                        type="button"
                        disabled={!withId && !groupId}
                        className={`${chatFmtBtnClass()} disabled:opacity-35`}
                        title="Mention someone"
                        onClick={() => insertMention()}
                      >
                        <IconAt className="h-4 w-4" />
                      </button>
                    }
                  />
                }
                footerHint="Enter to send · Shift+Enter for new line · Bold/italic show as you type"
                dockFlush={threadOpen}
                viewportDock={threadOpen}
                className={ERP_WA_COMPOSER_SHELL}
              />
            </div>
          </div>
        )}
      </section>
      </div>

      {groupModalOpen ? (
        <ErpBodyPortal>
          <div
            className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/55 p-0 sm:p-4"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setGroupModalOpen(false);
            }}
          >
            <div
              className={`max-h-[min(90vh,720px)] w-full ${erpModalPanelMaxWidthClass} overflow-y-auto rounded-none border border-slate-200 bg-white p-4 text-xs shadow-2xl ring-1 ring-slate-900/10 sm:rounded-2xl sm:p-5`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dm-new-group-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="dm-new-group-title" className="text-base font-bold text-slate-900 sm:text-lg">
                Create group
              </h2>
              <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
                You are included automatically. Choose at least one other person and a group name.
              </p>
              <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Group name</label>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Design sync"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 sm:text-sm"
                maxLength={120}
              />
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Add people</p>
              <div className="mt-2 rounded-xl border border-slate-200/90 bg-slate-50/50 p-2">
                <ErpTeamDirectoryGrid
                  users={directory}
                  mode="group"
                  dense
                  groupSelectedIds={newGroupMemberIds}
                  onGroupToggle={toggleNewGroupMember}
                />
              </div>
              {createGroupErr ? <p className="mt-2 text-xs text-red-600">{createGroupErr}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setGroupModalOpen(false);
                    setCreateGroupErr('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={createGroupBusy || !newGroupName.trim()}
                  onClick={() => void createGroup()}
                  className="rounded-xl erp-brand-fill px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-45"
                >
                  {createGroupBusy ? 'Creating…' : 'Create group'}
                </button>
              </div>
            </div>
          </div>
        </ErpBodyPortal>
      ) : null}

      {groupInviteModalOpen && groupId ? (
        <ErpBodyPortal>
          <div
            className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/55 p-0 sm:p-4"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setGroupInviteModalOpen(false);
                setInviteErr('');
              }
            }}
          >
            <div
              className={`max-h-[min(90vh,720px)] w-full ${erpModalPanelMaxWidthClass} overflow-y-auto rounded-none border border-slate-200 bg-white p-4 text-xs shadow-2xl ring-1 ring-slate-900/10 sm:rounded-2xl sm:p-5`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dm-invite-group-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="dm-invite-group-title" className="text-base font-bold text-slate-900 sm:text-lg">
                Invite to &ldquo;{selectedGroup?.name || 'group'}&rdquo;
              </h2>
              <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
                Choose workspace members to add to this group. They will see new messages from here on.
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Add people</p>
              {inviteDirectoryUsers.length === 0 ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-4 text-center text-sm text-slate-600">
                  Everyone from the directory is already in this group, or the directory is still loading.
                </p>
              ) : (
                <div className="mt-2 rounded-xl border border-slate-200/90 bg-slate-50/50 p-2">
                  <ErpTeamDirectoryGrid
                    users={inviteDirectoryUsers}
                    mode="group"
                    dense
                    groupSelectedIds={invitePickIds}
                    onGroupToggle={toggleInviteMember}
                  />
                </div>
              )}
              {inviteErr ? <p className="mt-2 text-xs text-red-600">{inviteErr}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setGroupInviteModalOpen(false);
                    setInviteErr('');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={inviteBusy || invitePickIds.length === 0 || inviteDirectoryUsers.length === 0}
                  onClick={() => void submitGroupInvites()}
                  className="rounded-xl erp-brand-fill px-4 py-2 text-sm font-bold text-white shadow-md disabled:opacity-45"
                >
                  {inviteBusy ? 'Adding…' : 'Add to group'}
                </button>
              </div>
            </div>
          </div>
        </ErpBodyPortal>
      ) : null}

      {typeof document !== 'undefined' && msgCtxMenu ? (
        <ErpBodyPortal>
          <div className="fixed inset-0 z-[300]">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close menu"
              onClick={() => setMsgCtxMenu(null)}
            />
            <div
              className={`absolute min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
              style={{
                left: Math.max(8, Math.min(msgCtxMenu.x, window.innerWidth - 176)),
                top: Math.max(8, Math.min(msgCtxMenu.y, window.innerHeight - 140)),
              }}
              role="menu"
              aria-label="Message actions"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const ctxMsg = messages.find((x) => x.id === msgCtxMenu.messageId);
                const tombstone = Boolean(ctxMsg?.deleted_at);
                const ctxMine = Boolean(ctxMsg && myId && ctxMsg.sender_id === myId);
                const showEdit =
                  !tombstone &&
                  ctxMine &&
                  ctxMsg?.kind !== 'call' &&
                  Boolean(ctxMsg?.created_at) &&
                  canEditChatMessageByAge(ctxMsg.created_at);
                const showDelete = Boolean(!tombstone && (canAdminDelete || ctxMine));
                /** Forward is offered for any normal (non-tombstone, non-call) message. */
                const showForward = Boolean(!tombstone && ctxMsg && ctxMsg.kind !== 'call');
                const showReply = showForward;
                const copyText = dmMessageCopyPlain(ctxMsg, myId);
                const copyLinksText = ctxMsg?.body ? chatMessageLinksToCopyText(ctxMsg.body) : '';
                const showCopy = Boolean(showForward && copyText);
                const showCopyLink = Boolean(showForward && copyLinksText);
                const isPinnedCtx = Boolean(ctxMsg?.id && pinnedMessageIds.has(ctxMsg.id));
                const canPinCtx = Boolean(showForward && messagePinsEnabled);
                return (
                  <>
                    {showCopy ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          setMsgCtxMenu(null);
                          void navigator.clipboard?.writeText(copyText).catch(() => {});
                        }}
                      >
                        {showCopyLink ? 'Copy text' : 'Copy'}
                      </button>
                    ) : null}
                    {showCopyLink ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          setMsgCtxMenu(null);
                          void navigator.clipboard?.writeText(copyLinksText).catch(() => {});
                        }}
                      >
                        {ctxMsg?.body ? chatMessageCopyLinkLabel(ctxMsg.body) : 'Copy link'}
                      </button>
                    ) : null}
                    {canPinCtx && !isPinnedCtx ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          setMsgCtxMenu(null);
                          if (ctxMsg?.id) void pinMessageById(ctxMsg.id);
                        }}
                      >
                        Pin message
                      </button>
                    ) : null}
                    {canPinCtx && isPinnedCtx ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          const pinRow = messagePins.find((row) => pinRowMessageId(row) === ctxMsg?.id);
                          setMsgCtxMenu(null);
                          if (pinRow?.id) void unpinMessageByPinId(pinRow.id);
                        }}
                      >
                        Unpin message
                      </button>
                    ) : null}
                    {showReply ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          setMsgCtxMenu(null);
                          if (ctxMsg) startReplyToMessage(ctxMsg);
                        }}
                      >
                        Reply
                      </button>
                    ) : null}
                    {showForward ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          const m = ctxMsg;
                          setMsgCtxMenu(null);
                          if (!m) return;
                          let senderName = 'Member';
                          if (m.sender_id === myId) {
                            senderName = 'me';
                          } else if (groupId) {
                            const gm = groupMembers.find((u) => u.id === m.sender_id);
                            if (gm) senderName = displayName(gm);
                          } else if (selected && selected.id === m.sender_id) {
                            senderName = displayName(selected);
                          }
                          setForwardSourceMessage(messageToForwardSource(m, senderName));
                        }}
                      >
                        Forward
                      </button>
                    ) : null}
                    {ctxMine && !tombstone && ctxMsg?.kind !== 'call' ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          setMsgCtxMenu(null);
                          if (ctxMsg) openDmMessageInfo(ctxMsg);
                        }}
                      >
                        Message info
                      </button>
                    ) : null}
                    {showEdit ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                        onClick={() => {
                          setMsgCtxMenu(null);
                          if (ctxMsg) startDmEdit(ctxMsg);
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                    {showDelete ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/45"
                        onClick={() => {
                          const id = msgCtxMenu?.messageId;
                          setMsgCtxMenu(null);
                          if (id) setConfirmDeleteDmMsgId(id);
                        }}
                        role="menuitem"
                      >
                        Delete
                      </button>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
        </ErpBodyPortal>
      ) : null}

      {typeof document !== 'undefined' && convCtxMenu ? (
        <ErpBodyPortal>
          <div className="fixed inset-0 z-[270]">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close menu"
              onClick={() => setConvCtxMenu(null)}
            />
            <div
              className={`absolute min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
              style={{
                left: Math.max(8, Math.min(convCtxMenu.x, window.innerWidth - 208)),
                top: Math.max(8, Math.min(convCtxMenu.y, window.innerHeight - 80)),
              }}
              role="menu"
              aria-label="Conversation actions"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                role="menuitem"
                onClick={() => {
                  const key = convCtxMenu.row?.key;
                  setConvCtxMenu(null);
                  if (key) toggleConversationPin(key);
                }}
              >
                <ErpIconPin
                  filled={isDmConversationPinned(myId, convCtxMenu.row?.key, pinnedDmKeys)}
                  className="h-4 w-4 shrink-0 text-amber-500"
                />
                {isDmConversationPinned(myId, convCtxMenu.row?.key, pinnedDmKeys) ? 'Unpin chat' : 'Pin chat'}
              </button>
            </div>
          </div>
        </ErpBodyPortal>
      ) : null}

      {typeof document !== 'undefined' && clearThreadOpen ? (
        <ErpBodyPortal>
          <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close"
              onClick={() => (clearThreadBusy ? null : setClearThreadOpen(false))}
            />
            <div
              className={`relative z-[311] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-3xl`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="erp-clear-thread-title"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Clear history</p>
              <h2 id="erp-clear-thread-title" className="mt-1 text-lg font-bold text-slate-900">
                Clear chat for you
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                This hides older messages on <span className="font-semibold text-slate-800">your</span> account only. The
                other person still sees the full thread. Nothing is removed for them until a message is deleted from the
                menu: you can delete your own messages anytime; Super Admin can remove any message for moderation.
              </p>
              <p className="mt-4 text-sm text-slate-700">
                Type <span className="font-extrabold text-slate-900">DELETE</span> to confirm.
              </p>
              <input
                value={clearThreadTyped}
                onChange={(e) => {
                  setClearThreadTyped(e.target.value);
                  setClearThreadErr('');
                }}
                placeholder="DELETE"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
                disabled={clearThreadBusy}
                autoFocus
              />
              {clearThreadErr ? <p className="mt-2 text-sm text-rose-700">{clearThreadErr}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClearThreadOpen(false)}
                  disabled={clearThreadBusy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void clearCurrentThread()}
                  disabled={clearThreadBusy}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                >
                  {clearThreadBusy ? 'Clearing…' : 'Clear chat'}
                </button>
              </div>
            </div>
          </div>
        </ErpBodyPortal>
      ) : null}

      <ErpConfirmDialog
        open={confirmDeleteDmMsgId != null}
        title="Delete message?"
        confirmLabel="Delete message"
        tone="danger"
        onCancel={() => setConfirmDeleteDmMsgId(null)}
        onConfirm={() => void executeAdminDeleteMessage()}
      >
        <p>Text is cleared and replaced with “This message has been deleted”. Attachments go to Trash. You can delete only your own messages; Super Admin can delete any message.</p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmLeaveGroupOpen}
        title="Leave this group?"
        confirmLabel="Leave group"
        tone="danger"
        onCancel={() => setConfirmLeaveGroupOpen(false)}
        onConfirm={() => void executeLeaveGroup()}
      >
        <p>You will stop receiving messages from this group. You can be added again later.</p>
      </ErpConfirmDialog>

      <ErpJitsiCallModal
        open={Boolean(jitsiSession)}
        onClose={handleCloseJitsi}
        domain={jitsiSession?.domain}
        roomName={jitsiSession?.roomName}
        joinUrl={jitsiSession?.joinUrl}
        jwt={jitsiSession?.jwt || ''}
        displayName={(profile?.full_name && String(profile.full_name).trim()) || 'Member'}
        startAudioOnly={Boolean(jitsiSession?.audioOnly)}
        recipientName={jitsiSession?.recipientName || ''}
        isOutgoing={Boolean(jitsiSession?.isOutgoing)}
      />

      <ErpFilePreviewModal file={dmFilePreview} onClose={() => setDmFilePreview(null)} />

      <ErpChatMessageInfoModal
        open={Boolean(dmMessageInfo)}
        onClose={() => setDmMessageInfo(null)}
        message={dmMessageInfo}
        mode={groupId ? 'group' : 'dm'}
        peerName={selected ? displayName(selected) : 'Contact'}
        peerReadAt={peerDmReadAt}
        seenBy={
          dmMessageInfo && groupId
            ? computeMessageSeenBy({
                messageCreatedAt: dmMessageInfo.created_at,
                readStatesByUserId: groupReadByUserId,
                audienceUserIds: groupAudienceIds,
                excludeUserId: myId,
                nameById,
              }).seenBy
            : []
        }
        pendingBy={
          dmMessageInfo && groupId
            ? computeMessageSeenBy({
                messageCreatedAt: dmMessageInfo.created_at,
                readStatesByUserId: groupReadByUserId,
                audienceUserIds: groupAudienceIds,
                excludeUserId: myId,
                nameById,
              }).pendingBy
            : []
        }
      />

      <ErpForwardMessageModal
        open={Boolean(forwardSourceMessage)}
        source={forwardSourceMessage}
        myId={myId}
        onClose={() => setForwardSourceMessage(null)}
      />
    </div>
  );
}
