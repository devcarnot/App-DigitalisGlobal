'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { isSupabaseSchemaMissingError } from '../../lib/supabase-errors';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { erpWorkspaceSubtitle } from '../../lib/erp-roles';
import ErpUserAvatar from './ErpUserAvatar';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';
import ChatMessageHtml from './ChatMessageHtml';
import ErpMarkdownWysComposer from './ErpMarkdownWysComposer';
import ErpBodyPortal from './ErpBodyPortal';
import ErpTeamDirectoryGrid from './ErpTeamDirectoryGrid';
import { useErpSession } from './useErpSession';
import ErpConfirmDialog from './ErpConfirmDialog';
import ErpFilePreviewModal from './ErpFilePreviewModal';
import ErpForwardMessageModal from './ErpForwardMessageModal';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';
import { downloadFromSignedUrlWithFallback } from '../../lib/browser-download';
import { canEditChatMessageByAge } from '../../lib/erp-message-edit-window';
import { ERP_CHAT_DELETED_PLACEHOLDER } from '../../lib/erp-chat-deleted-copy';
import { ERP_DARK_MENU_PORTAL } from '../../lib/erp-dark-surfaces';
import {
  loadDmReactionsForMessages,
  loadGroupReactionsForMessages,
  toggleMessageReaction,
} from '../../lib/erp-message-reactions';
import { ErpMessageReactionLauncher, ErpMessageReactionsBar } from './ErpMessageReactions';

const ErpJitsiCallModal = dynamic(() => import('./ErpJitsiCallModal'), { ssr: false });

function displayName(u) {
  return (u?.full_name && String(u.full_name).trim()) || 'User';
}

const DM_MAX_FILE_BYTES = 12 * 1024 * 1024;
/** Max files attached to one DM or group message. */
const DM_MAX_FILES = 10;
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

function IconPaperclip({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEmoji({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.2 1.5 4 1.5 4-1.5 4-1.5" strokeLinecap="round" />
      <circle cx="9" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
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
      const { data, error } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setErr(true);
        return;
      }
      setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const isImg = mime && String(mime).startsWith('image/');

  if (err) {
    return (
      <p className={`text-xs ${mine ? 'text-teal-100/90' : 'text-slate-500'}`}>Could not load attachment.</p>
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
          <img src={url} alt="" className="max-h-56 max-w-full rounded-lg object-contain" />
        </button>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="block mt-1 max-h-56 max-w-full rounded-lg object-contain" />
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

function fmtBtnClass(active) {
  return `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
    active
      ? 'border-[#103D4D]/40 bg-cyan-50 text-[#103D4D] dark:border-teal-500/45 dark:bg-teal-950/60 dark:text-teal-200'
      : 'border-transparent bg-slate-100/90 text-slate-600 hover:bg-slate-200/90 dark:bg-[#151f28]/90 dark:text-teal-200/85 dark:hover:bg-[#1a2835]'
  }`;
}

function messageReadByPeer(createdAt, peerReadAtIso) {
  if (!peerReadAtIso || !createdAt) return false;
  return new Date(peerReadAtIso).getTime() >= new Date(createdAt).getTime();
}

function IconDmReceiptCheck({ className }) {
  return (
    <svg className={className} viewBox="0 0 12 10" fill="none" aria-hidden>
      <path d="M1 5.2l2.7 2.6L11 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** WhatsApp-style sent / delivered / read for outgoing 1:1 DMs on the teal bubble. */
function DmReceiptTicks({ read, delivered }) {
  const label = read ? 'Read' : delivered ? 'Delivered' : 'Sent';
  const tone = read ? 'text-sky-300' : delivered ? 'text-white/55' : 'text-white/40';
  return (
    <span className={`inline-flex shrink-0 items-center gap-px ${tone}`} title={label} aria-label={label}>
      {delivered ? (
        <span className="relative inline-flex h-3 w-[18px]">
          <IconDmReceiptCheck className="absolute left-0 top-0 h-3 w-3 shrink-0" />
          <IconDmReceiptCheck className="absolute left-[5px] top-0 h-3 w-3 shrink-0" />
        </span>
      ) : (
        <IconDmReceiptCheck className="h-3 w-3 shrink-0" />
      )}
    </span>
  );
}

export default function ErpDirectMessages() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const withId = searchParams.get('with');
  const groupId = searchParams.get('group');
  const { profile } = useErpSession();

  const [myId, setMyId] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [dirLoading, setDirLoading] = useState(true);
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
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const [query, setQuery] = useState('');
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
  /** When set, opens the Forward modal pre-loaded with this message's body + attachments. */
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [dmEditingMsgId, setDmEditingMsgId] = useState(null);
  const [dmEditingDraft, setDmEditingDraft] = useState('');
  const [dmEditBusy, setDmEditBusy] = useState(false);
  const [confirmDeleteDmMsgId, setConfirmDeleteDmMsgId] = useState(null);
  const [confirmLeaveGroupOpen, setConfirmLeaveGroupOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  // Inline file preview modal — used for chat image / file attachments so a
  // click stays inside the workspace (the desktop shell would otherwise
  // externalise any `target="_blank"` link to the system browser).
  const [dmFilePreview, setDmFilePreview] = useState(null);
  const headerMenuRef = useRef(null);

  const threadScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  /** Bump when conversation restores draft so the WYSIWYG composer remounts after localStorage hydrate. */
  const [composerBump, bumpComposerHydration] = useReducer((x) => x + 1, 0);
  /** Migration 044 (RPCs + read_state tables). Set false after first schema-missing error to avoid repeated 404s until deploy. */
  const readStateApisAvailableRef = useRef(true);
  /** Other user’s last_read_at for this 1:1 thread (their erp_dm_read_state row targeting us). */
  const [peerDmReadAt, setPeerDmReadAt] = useState(null);
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
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
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
    setDirLoading(true);
    setDirErr('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/dm/directory');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load directory');
      setDirectory(Array.isArray(data.users) ? data.users : []);
    } catch (e) {
      setDirErr(e?.message || 'Could not load directory');
      setDirectory([]);
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
    setGroupsLoading(true);
    try {
      const { data: mems, error: mErr } = await supabase
        .from('erp_message_group_members')
        .select('group_id')
        .eq('user_id', myId);
      if (mErr) throw new Error(mErr.message);
      const gids = [...new Set((mems || []).map((m) => m.group_id).filter(Boolean))];
      if (gids.length === 0) {
        setGroups([]);
        return;
      }
      const { data: gr, error: gErr } = await supabase
        .from('erp_message_groups')
        .select('id, name, created_by, updated_at')
        .in('id', gids)
        .order('updated_at', { ascending: false });
      if (gErr) throw new Error(gErr.message);
      setGroups(gr || []);
    } catch {
      setGroups([]);
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
    setConvListLoading(true);
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

  const loadThread = useCallback(
    async (otherId) => {
      if (!myId || !otherId) {
        setMessages([]);
        return;
      }
      setMsgLoading(true);
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
            'id, sender_id, recipient_id, body, created_at, edited_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, deleted_at, recipient_delivered_at',
          )
          .or(filter)
          .order('created_at', { ascending: true })
          .limit(300);
        if (clearedAt) q = q.gt('created_at', clearedAt);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
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
        setMessages([]);
      } finally {
        setMsgLoading(false);
        void loadConversationSummaries();
      }
    },
    [myId, loadConversationSummaries, markIncomingDmDelivered, refreshPeerDmReadAt],
  );

  const loadGroupThread = useCallback(
    async (gid) => {
      if (!myId || !gid) {
        setMessages([]);
        return;
      }
      setMsgLoading(true);
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
          .select('id, group_id, sender_id, body, created_at, edited_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, deleted_at')
          .eq('group_id', gid)
          .order('created_at', { ascending: true })
          .limit(500);
        if (clearedAt) q = q.gt('created_at', clearedAt);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const rows = data || [];
        setMessages(rows);
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
        setMessages([]);
      } finally {
        setMsgLoading(false);
        void loadConversationSummaries();
      }
    },
    [myId, loadConversationSummaries],
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

  function insertMention() {
    if (!selected) return;
    const label = displayName(selected).replace(/\s+/g, ' ');
    insertEmoji(`@${label} `);
  }

  const addPendingFiles = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMsgErr('');
    setPendingFiles((prev) => {
      const out = [...prev];
      for (const f of incoming) {
        if (f.size > DM_MAX_FILE_BYTES) {
          setMsgErr(`"${f.name}" is too large. Max ${Math.round(DM_MAX_FILE_BYTES / 1024 / 1024)} MB.`);
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
    /**
     * Collect pasted files. Some clipboard sources (notably Windows screenshot
     * tools / Chromium on certain OSes) list the same image as two `file`
     * entries in `clipboardData.items`, which used to cause double attachment.
     * Prefer `clipboardData.files` (modern, generally deduped FileList) and
     * still dedupe by name|type|size as a safety net.
     */
    const collected = [];
    const dt = e.clipboardData;
    if (dt?.files && dt.files.length) {
      for (const f of dt.files) collected.push(f);
    }
    if (collected.length === 0 && dt?.items) {
      for (const it of dt.items) {
        if (it?.kind === 'file') {
          const f = it.getAsFile?.();
          if (f) collected.push(f);
        }
      }
    }
    if (collected.length === 0) return;

    const seen = new Set();
    const files = [];
    for (const f of collected) {
      if (!f) continue;
      const key = `${f.name || ''}|${f.type || ''}|${f.size || 0}|${f.lastModified || 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(f);
    }
    if (files.length === 0) return;

    e.preventDefault();
    addPendingFiles(files);
  }

  async function send() {
    const text = draft.trim();
    const files = pendingFiles;
    if ((!text && files.length === 0) || !myId || sending) return;
    for (const f of files) {
      if (f.size > DM_MAX_FILE_BYTES) {
        setMsgErr('Each file must be 12 MB or smaller.');
        return;
      }
    }
    if (groupId) {
      setSending(true);
      setMsgErr('');
      const uploaded = [];
      try {
        const attachmentRows = [];
        if (files.length) {
          const folder = groupFolder(groupId);
          for (const file of files) {
            const fname = `${crypto.randomUUID()}_${safeFileBase(file.name)}`;
            const storagePath = `${folder}/${fname}`;
            const { error: upErr } = await supabase.storage.from('erp-files').upload(storagePath, file, {
              upsert: false,
              contentType: file.type || 'application/octet-stream',
            });
            if (upErr) throw new Error(upErr.message);
            uploaded.push(storagePath);
            attachmentRows.push({
              path: storagePath,
              name: file.name || 'file',
              mime: file.type || 'application/octet-stream',
            });
          }
        }
        const row = {
          group_id: groupId,
          sender_id: myId,
          body: text || '',
        };
        if (attachmentRows.length) {
          row.attachments = attachmentRows;
        }
        const { error } = await supabase.from('erp_group_messages').insert(row);
        if (error) throw new Error(error.message);
        setDraft('');
        try {
          composerRef.current?.replaceMarkdown?.('');
        } catch {}
        try {
          if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
        } catch {}
        setPendingFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadGroupThread(groupId);
        void loadGroups();
      } catch (e) {
        if (uploaded.length) await supabase.storage.from('erp-files').remove(uploaded);
        setMsgErr(e?.message || 'Could not send');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!withId) return;
    setSending(true);
    setMsgErr('');
    const uploaded = [];
    try {
      const attachmentRows = [];
      if (files.length) {
        const folder = dmPairFolder(myId, withId);
        for (const file of files) {
          const fname = `${crypto.randomUUID()}_${safeFileBase(file.name)}`;
          const storagePath = `${folder}/${fname}`;
          const { error: upErr } = await supabase.storage.from('erp-files').upload(storagePath, file, {
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          });
          if (upErr) throw new Error(upErr.message);
          uploaded.push(storagePath);
          attachmentRows.push({
            path: storagePath,
            name: file.name || 'file',
            mime: file.type || 'application/octet-stream',
          });
        }
      }

      const row = {
        sender_id: myId,
        recipient_id: withId,
        body: text || '',
      };
      if (attachmentRows.length) {
        row.attachments = attachmentRows;
      }

      const { data: insertedDm, error } = await supabase.from('erp_direct_messages').insert(row).select('id').maybeSingle();
      if (error) throw new Error(error.message);
      setDraft('');
      try {
        composerRef.current?.replaceMarkdown?.('');
      } catch {}
      try {
        if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
      } catch {}
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (insertedDm?.id) {
        erpAuthorizedFetch('/api/erp/notify-dm', {
          method: 'POST',
          body: JSON.stringify({ messageId: insertedDm.id }),
        }).catch(() => {});
      }
      await loadThread(withId);
    } catch (e) {
      if (uploaded.length) await supabase.storage.from('erp-files').remove(uploaded);
      setMsgErr(e?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  const canSend = (draft.trim() || pendingFiles.length > 0) && myId && !sending && (groupId || withId);
  const threadOpen = Boolean(withId || groupId);
  const canStartCall = Boolean(myId && (withId || groupId));

  /** Open the in-app file preview for a chat attachment. Keeping this in
   *  parent state means the modal renders once at the bottom of the page and
   *  Esc/backdrop dismiss work uniformly across DM + group threads. */
  const openDmFilePreview = useCallback((attachment) => {
    if (!attachment?.path) return;
    setDmFilePreview({
      path: attachment.path,
      name: attachment.name || attachment.path.split('/').pop() || 'file',
      mime: attachment.mime || attachment.mimetype || null,
    });
  }, []);

  /** Inline-image / image-link clicks inside rendered markdown. The URL is
   *  already a usable signed/public link, so we hand it straight to the
   *  preview modal rather than trying to extract a storage path. */
  const openDmInlineMedia = useCallback(({ url, name } = {}) => {
    if (!url) return;
    setDmFilePreview({
      url,
      name: name || url.split('/').pop()?.split('?')[0] || 'image',
      mime: null,
    });
  }, []);

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

  return (
    <div
      className={`flex min-h-0 flex-col gap-3 pb-2 sm:gap-4 max-lg:min-h-0 max-lg:flex-1 lg:h-full lg:min-h-0 lg:flex-1 lg:gap-4 ${
        threadOpen ? 'max-lg:pb-0 max-lg:gap-2' : 'sm:min-h-[min(70vh,720px)] lg:min-h-0'
      }`}
    >
      <div
        className={`sticky top-0 z-10 -mx-1 grid shrink-0 grid-cols-2 gap-1 rounded-2xl border border-cyan-200/60 bg-gradient-to-r from-white/95 to-cyan-50/40 p-1 shadow-sm ring-1 ring-cyan-900/[0.04] backdrop-blur-sm dark:border-teal-800/50 dark:from-[#101a22] dark:to-[#0a141c] dark:ring-teal-900/35 lg:hidden ${
          threadOpen ? 'max-lg:hidden' : ''
        }`}
        role="tablist"
        aria-label="Messages view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileDmTab === 'chat'}
          onClick={() => setMobileDmTab('chat')}
          className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-bold transition touch-manipulation ${
            mobileDmTab === 'chat'
              ? 'bg-white text-[#103D4D] shadow-md shadow-cyan-900/10 ring-1 ring-cyan-200/80 dark:bg-[#121f28] dark:text-teal-200 dark:ring-teal-700/50'
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200'
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileDmTab === 'people'}
          onClick={() => setMobileDmTab('people')}
          className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-bold transition touch-manipulation ${
            mobileDmTab === 'people'
              ? 'bg-white text-[#103D4D] shadow-md shadow-cyan-900/10 ring-1 ring-cyan-200/80 dark:bg-[#121f28] dark:text-teal-200 dark:ring-teal-700/50'
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200'
          }`}
        >
          People
        </button>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row-reverse lg:items-stretch lg:gap-5 ${
          threadOpen ? 'max-lg:min-h-0 max-lg:flex-1' : 'lg:flex-1'
        }`}
      >
      <aside
        className={`w-full shrink-0 flex-col rounded-3xl border border-cyan-200/60 bg-gradient-to-b from-white to-cyan-50/25 p-4 shadow-md shadow-cyan-900/5 ring-1 ring-cyan-900/[0.06] dark:border-teal-800/45 dark:from-[#0c1820] dark:to-[#080d12] dark:shadow-black/30 dark:ring-teal-900/30 sm:rounded-2xl sm:p-3 lg:flex lg:h-full lg:min-h-0 lg:w-[min(100%,28rem)] lg:max-w-md lg:flex-col ${
          mobileDmTab === 'people' ? 'flex' : 'max-lg:hidden'
        }`}
      >
        <div className="mb-3 flex flex-col gap-3 sm:mb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
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
          <div className="mb-0 min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin] lg:mb-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
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
        className={`flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-3xl border border-cyan-200/50 bg-white/95 shadow-md ring-1 ring-cyan-900/[0.05] dark:border-teal-800/45 dark:bg-[#0a1218]/95 dark:ring-teal-900/30 max-lg:min-h-0 sm:min-h-[320px] sm:rounded-2xl lg:min-h-0 lg:h-full lg:flex-1 lg:flex ${
          mobileDmTab === 'chat' ? 'flex' : 'max-lg:hidden'
        } ${threadOpen ? 'max-lg:flex-1 max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:ring-0' : 'max-lg:flex-1'}`}
      >
        {!withId && !groupId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-cyan-50/50 via-white to-slate-50/30 dark:from-[#0a1418] dark:via-[#080c10] dark:to-[#05080c]">
            <div className="relative shrink-0 overflow-hidden border-b border-teal-900/10 erp-brand-fill px-4 py-3.5 shadow-md shadow-teal-900/15 sm:px-5">
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
            ) : conversationSummaries.length > 0 ? (
              <ul className="min-h-0 flex-1 space-y-0 overflow-y-auto [scrollbar-color:rgba(16,61,77,0.25)_transparent] [scrollbar-width:thin]">
                {conversationSummaries.map((row) => {
                  const peerProf = row.kind === 'dm' ? directory.find((u) => u.id === row.peerId) : null;
                  const timeLabel = formatInboxTime(row.lastAt);
                  const unread = row.unread > 99 ? '99+' : String(row.unread);
                  const hasUnread = row.unread > 0;
                  return (
                    <li key={row.key}>
                      <button
                        type="button"
                        onClick={() =>
                          row.kind === 'dm' ? selectUser(row.peerId) : selectGroup(row.groupId)
                        }
                        className={`flex w-full touch-manipulation items-center gap-3 border-b border-cyan-100/70 px-4 py-3 text-left transition-colors sm:py-2.5 dark:border-teal-900/35 ${
                          hasUnread
                            ? 'bg-cyan-50/70 hover:bg-cyan-100/50 active:bg-cyan-100/70 dark:bg-teal-950/40 dark:hover:bg-teal-950/55 dark:active:bg-teal-950/65'
                            : 'hover:bg-cyan-50/40 active:bg-cyan-100/50 dark:hover:bg-teal-950/25 dark:active:bg-teal-950/40'
                        }`}
                      >
                        {row.kind === 'dm' ? (
                          <span
                            className={`shrink-0 rounded-full ${hasUnread ? 'ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-white dark:ring-offset-[#0a1218]' : ''}`}
                          >
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
                                className="!h-11 !w-11"
                                alt={row.title}
                              />
                            </ErpAvatarWithOnline>
                          </span>
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-[#103D4D] text-xs font-bold text-white shadow-md shadow-[#103D4D]/25 ring-2 ring-white dark:ring-teal-900/50">
                            {(row.title || 'G').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={`truncate font-semibold ${hasUnread ? 'text-[#0a3544] dark:text-teal-100' : 'text-slate-900 dark:text-slate-100'}`}
                            >
                              {row.title}
                            </p>
                            {timeLabel ? (
                              <span
                                className={`shrink-0 text-[11px] ${hasUnread ? 'font-semibold text-teal-700 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500'}`}
                              >
                                {timeLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-[13px] text-slate-600 dark:text-slate-400">{row.preview}</p>
                            {row.unread > 0 ? (
                              <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full erp-brand-fill px-1.5 text-[11px] font-bold leading-none text-white shadow-sm">
                                {unread}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
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
                    Open the{' '}
                    <button
                      type="button"
                      onClick={() => setMobileDmTab('people')}
                      className="font-semibold text-teal-700 underline decoration-teal-400/70 underline-offset-2 dark:text-teal-400"
                    >
                      People
                    </button>{' '}
                    tab to choose someone or a group.
                  </p>
                  <p className="mt-1 hidden max-w-sm text-xs text-slate-600 dark:text-slate-400 lg:block">
                    Pick a person from the member list on the right, or create a group to start chatting.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden max-lg:min-h-0">
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
              {threadOpen && (canStartCall || canClearThread) ? (
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

            <div
              ref={threadScrollRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgba(72,209,204,0.35)_rgba(15,23,42,0.45)] lg:min-h-0 lg:max-h-none lg:flex-1"
            >
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
                  const reactionLauncher = canReactToMsg ? (
                    <ErpMessageReactionLauncher
                      mine={mine}
                      reactedEmojis={myReactedEmojis}
                      onPick={(emoji) => void toggleMyReaction(m, emoji)}
                    />
                  ) : null;

                  const bubble = (
                    <div
                      className={`min-w-0 max-w-full overflow-hidden rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine
                          ? 'border border-[#103D4D]/35 erp-brand-fill text-white shadow-sm dark:border-teal-700/45 dark:text-teal-50'
                          : 'border border-transparent bg-slate-100 text-slate-900 ring-1 ring-slate-200/80 dark:bg-[#121f28] dark:text-slate-200 dark:ring-teal-900/35'
                      }`}
                      onContextMenu={
                        !deleted && (canAdminDelete || canEditDmMine)
                          ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMsgCtxMenu({ x: e.clientX, y: e.clientY, messageId: m.id });
                            }
                          : undefined
                      }
                    >
                      {editingDm ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={dmEditingDraft}
                            onChange={(e) => setDmEditingDraft(e.target.value)}
                            rows={3}
                            disabled={dmEditBusy}
                            aria-label="Edit message"
                            className={`w-full min-h-[4.25rem] resize-y rounded-lg border px-2 py-1.5 text-xs outline-none ${mine ? 'border-white/35 bg-black/20 text-white placeholder:text-white/45' : 'border-slate-300 bg-white text-slate-900'}`}
                          />
                          <div className={`flex flex-wrap gap-2 ${mine ? 'justify-end' : ''}`}>
                            <button
                              type="button"
                              disabled={dmEditBusy}
                              onClick={() => cancelDmEdit()}
                              className={`rounded-lg px-2 py-1 text-[11px] font-bold ${mine ? 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={dmEditBusy}
                              onClick={() => void saveDmEdit()}
                              className="rounded-lg bg-[#B2EBF2] px-2 py-1 text-[11px] font-bold text-[#0d3442] hover:bg-cyan-200 disabled:opacity-50"
                            >
                              {dmEditBusy ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : deleted ? (
                        <p className={`text-sm italic ${mine ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'}`}>{ERP_CHAT_DELETED_PLACEHOLDER}</p>
                      ) : hasText ? (
                        <ChatMessageHtml
                          text={m.body}
                          onMediaOpen={openDmInlineMedia}
                          className={
                            mine
                              ? '!text-white [&_a]:text-cyan-100 [&_code]:bg-white/15 [&_code]:text-white [&_pre]:border-white/20 [&_pre]:bg-white/10 [&_blockquote]:border-white/40'
                              : ''
                          }
                        />
                      ) : null}
                      {attList.length ? (
                        <div className={hasText || editingDm ? 'mt-1.5 space-y-1' : 'space-y-1'}>
                          {attList.map((a, ai) => (
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
                        <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${mine ? 'justify-end' : ''}`}>
                          <p className={`text-[10px] tabular-nums ${mine ? 'text-teal-100/90' : 'text-slate-500 dark:text-slate-400'}`}>
                            {new Date(m.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {m.edited_at ? ' · Edited' : ''}
                          </p>
                          {mine && !groupId && !deleted && m.kind !== 'call' ? (
                            <DmReceiptTicks
                              read={messageReadByPeer(m.created_at, peerDmReadAt)}
                              delivered={Boolean(m.recipient_delivered_at)}
                            />
                          ) : null}
                        </div>
                      ) : null}
                      {canEditDmMine && !editingDm && !deleted ? (
                        <button
                          type="button"
                          onClick={() => startDmEdit(m)}
                          className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide underline-offset-2 hover:underline ${mine ? 'text-teal-100/95' : 'text-[#103D4D] dark:text-teal-300'}`}
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  );

                  if (!groupId) {
                    return (
                      <div
                        key={m.id}
                        className={`flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
                      >
                        {mine ? reactionLauncher : null}
                        <div
                          className={`flex max-w-[min(100%,28rem)] min-w-0 flex-col ${
                            mine ? 'items-end' : 'items-start'
                          }`}
                        >
                          {bubble}
                          {reactionsBar}
                        </div>
                        {!mine ? reactionLauncher : null}
                      </div>
                    );
                  }

                  if (mine) {
                    return (
                      <div key={m.id} className="flex items-end justify-end gap-2">
                        {reactionLauncher}
                        <div className="flex min-w-0 max-w-[min(100%,28rem)] flex-col items-end">
                          {clusterStart ? (
                            <p className="mb-0.5 pr-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              You
                            </p>
                          ) : null}
                          {bubble}
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
                    <div key={m.id} className="flex items-end justify-start gap-2">
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
                      <div className="min-w-0 max-w-[min(100%,28rem)] flex flex-col items-start">
                        {clusterStart ? (
                          <div className="mb-0.5 pl-0.5">
                            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{senderName}</p>
                            {senderSubtitle ? (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">{senderSubtitle}</p>
                            ) : null}
                          </div>
                        ) : null}
                        {bubble}
                        {reactionsBar}
                      </div>
                      {reactionLauncher}
                    </div>
                  );
                })
              )}
            </div>

            {msgErr ? <p className="px-4 text-xs text-red-600">{msgErr}</p> : null}

            <div
              className="shrink-0 border-t border-slate-100 bg-[#fafbfc] p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-teal-900/40 dark:bg-[#070b11]"
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
              <div
                className={`relative rounded-2xl border bg-white p-2 shadow-sm ring-1 ring-slate-900/[0.03] transition-colors dark:border-teal-800/50 dark:bg-[#101a22] dark:shadow-none dark:ring-teal-900/40 ${
                  isDraggingFile
                    ? 'border-[#103D4D]/40 ring-[#103D4D]/20 dark:border-teal-500/45 dark:ring-teal-500/25'
                    : 'border-slate-200/90'
                }`}
              >
                {isDraggingFile ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#103D4D]/50 bg-cyan-50/85 text-[13px] font-bold text-[#103D4D] dark:border-teal-500/50 dark:bg-teal-950/80 dark:text-teal-100">
                    Drop to attach (multiple files)
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    title="Attach file or image"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-teal-200/85 dark:hover:bg-[#152028]"
                  >
                    <IconPaperclip className="h-5 w-5" />
                  </button>
                  <ErpMarkdownWysComposer
                    key={`${draftStorageKey || 'idle'}-${composerBump}`}
                    ref={composerRef}
                    resetKey={`${draftStorageKey || 'idle'}-${composerBump}`}
                    initialMarkdown={draft}
                    onMarkdownChange={setDraft}
                    onEnterSubmit={() => void send()}
                    onPaste={onChatPaste}
                    disabled={sending}
                    placeholder="Write a message…"
                    className=""
                  />
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={() => void send()}
                    className="shrink-0 self-end rounded-xl erp-brand-fill px-4 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-45"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>

                {pendingFiles.length ? (
                  <div className="mt-2 space-y-1.5">
                    {pendingFiles.map((f, idx) => (
                      <div
                        key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:bg-[#0d141c] dark:text-slate-200"
                      >
                        <span className="min-w-0 truncate">{f.name}</span>
                        <button
                          type="button"
                          className="shrink-0 font-semibold text-red-600 hover:underline"
                          onClick={() => {
                            setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {pendingFiles.length}/{DM_MAX_FILES} files · max {Math.round(DM_MAX_FILE_BYTES / 1024 / 1024)} MB each
                    </p>
                  </div>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 dark:border-teal-900/35">
                  <span className="mr-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-teal-500/80">Format</span>
                  <button type="button" className={fmtBtnClass(false)} title="Bold" onClick={() => wrapSelection('**')}>
                    B
                  </button>
                  <button type="button" className={fmtBtnClass(false)} title="Italic" onClick={() => wrapSelection('*')}>
                    I
                  </button>
                  <button type="button" className={fmtBtnClass(false)} title="Strikethrough" onClick={() => wrapSelection('~~')}>
                    S
                  </button>
                  <button type="button" className={fmtBtnClass(false)} title="Inline code" onClick={() => wrapSelection('`')}>
                    <span className="font-mono text-[11px] leading-none">{'</>'}</span>
                  </button>
                  <button type="button" className={fmtBtnClass(false)} title="Link" onClick={() => insertLink()}>
                    🔗
                  </button>
                  <button
                    type="button"
                    className={fmtBtnClass(false)}
                    title="Blockquote"
                    onClick={() => insertLinePrefix('> ')}
                  >
                    &gt;
                  </button>
                  <button type="button" className={fmtBtnClass(false)} title="Bullet list" onClick={() => insertLinePrefix('- ')}>
                    •
                  </button>
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={`dm-h${lvl}`}
                      type="button"
                      className={`${fmtBtnClass(false)} min-w-[1.65rem] px-0.5 text-[9px]`}
                      title={`Heading ${lvl}`}
                      aria-label={`Heading ${lvl}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => composerRef.current?.applyHeading?.(lvl)}
                    >
                      H{lvl}
                    </button>
                  ))}
                  <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-teal-800/50" aria-hidden />
                  <span className="flex items-center gap-0.5" title="Quick emoji">
                    <IconEmoji className="mr-0.5 h-4 w-4 text-slate-400 dark:text-teal-500/70" aria-hidden />
                    {['😀', '👍', '❤️', '🎉', '😂', '🙏'].map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-slate-200/80 dark:hover:bg-teal-900/45"
                        onClick={() => insertEmoji(em)}
                      >
                        {em}
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    disabled={!selected || Boolean(groupId)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-slate-100/90 text-slate-600 hover:bg-slate-200/90 disabled:opacity-35 dark:bg-[#151f28]/90 dark:text-teal-200/80 dark:hover:bg-[#1a2835]"
                    title={groupId ? 'Mentions are for direct chats' : 'Mention this person'}
                    onClick={() => insertMention()}
                  >
                    <IconAt className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">Enter to send · Shift+Enter for new line · Bold/italic show as you type</p>
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
                return (
                  <>
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
                          setForwardSourceMessage({
                            body: m.body || '',
                            attachments: Array.isArray(m.attachments) ? m.attachments : [],
                            senderName,
                          });
                        }}
                      >
                        <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M4 18v-4a4 4 0 014-4h12" />
                        </svg>
                        Forward
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

      <ErpForwardMessageModal
        open={Boolean(forwardSourceMessage)}
        source={forwardSourceMessage}
        myId={myId}
        onClose={() => setForwardSourceMessage(null)}
      />
    </div>
  );
}
