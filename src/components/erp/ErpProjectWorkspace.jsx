'use client';

import { useEffect, useState, useCallback, useRef, useMemo, useReducer, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch, fetchErpWorkspaceRoleTypeOptions, resolveDefaultWorkspaceRoleInviteId } from '../../lib/erp-client-api';
import {
  formatTaskDueDate,
  isTaskDueDateNotInPast,
  todayDateInputValue,
  taskDueColorClasses,
  taskDueStatus,
} from '../../lib/task-dates';
import { compareTaskPriority, normalizeTaskPriority, rollupPriorityFromTasks } from '../../lib/erp-task-priority';
import ErpTaskChecklistAndComments from './ErpTaskChecklistAndComments';
import ErpProjectTaskDetailModal from './ErpProjectTaskDetailModal';
import ProjectBulkPriorityContextMenu from './ProjectBulkPriorityContextMenu';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpTaskPriorityPicker from './ErpTaskPriorityPicker';
import { chatPaletteForUser } from '../../lib/erp-chat-colors';
import { isErpManagerRole, erpProjectMemberDelegationLabel } from '../../lib/erp-roles';
import { canAccessErpProjectCredentials } from '../../lib/erp-project-credentials';
import { recordProjectVisit } from '../../lib/erp-recent-projects';
import { useErpSession } from './useErpSession';
import { useErpBreadcrumb } from './ErpBreadcrumbContext';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';
import { logErpTaskStatusChange, logErpActivity } from '../../lib/erp-activity-client';
import { pickCanonicalRootTask } from '../../lib/erp-task-tree';
import ErpProjectSubtasksPanel from './ErpProjectSubtasksPanel';
import ErpProjectCredentialsPanel from './ErpProjectCredentialsPanel';
import ErpBodyPortal from './ErpBodyPortal';
import ErpProjectTimeLogger from './ErpProjectTimeLogger';
import ErpInviteMembersModal from './ErpInviteMembersModal';
import ErpUserAvatar from './ErpUserAvatar';
import ErpNativeSelect from './ErpNativeSelect';
import ErpConfirmDialog from './ErpConfirmDialog';
import ErpProjectChatMessageList, { MessageImage } from './ErpProjectChatMessageList';
import ErpFilePreviewModal from './ErpFilePreviewModal';
import ChatMessageHtml from './ChatMessageHtml';
import ErpWysiwygMarkdownField from './ErpWysiwygMarkdownField';
import ErpMarkdownWysComposer from './ErpMarkdownWysComposer';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';
import { erpCaretOffsetInInnerText, erpReplaceInnerTextSlice } from '../../lib/erp-contenteditable-selection';
import { ERP_PROJECT_MESSAGE_LIST_COLUMNS, ERP_TASK_LIST_COLUMNS } from '../../lib/erp-task-list-columns';
import { canEditChatMessageByAge } from '../../lib/erp-message-edit-window';
import {
  ERP_DARK_MENU_PORTAL,
  ERP_DARK_RING_SUBTLE_KPI,
  ERP_DARK_SECTION_VIOLET_PANEL,
  ERP_DARK_SOLID_CARD,
  ERP_DARK_STAT_AMBER_HOT,
  ERP_DARK_STAT_EMERALD,
  ERP_DARK_STAT_SKY,
} from '../../lib/erp-dark-surfaces';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';
import ErpCreatableMultiSelect from './ErpCreatableMultiSelect';
import { ERP_PROJECT_TYPES } from '../../lib/erp-project-types';

/** Tasks sync via Supabase realtime; polling is only a slow fallback if events are missed. */
const ERP_TASK_POLL_INTERVAL_MS = 120_000;
/** Collapse bursts of realtime events into one fetch (less CPU + fewer profile lookups). */
const ERP_TASK_REALTIME_DEBOUNCE_MS = 400;

function openEditProjectModal({
  project: projectSnap,
  setEditProjectDraftAttachments,
  setEditProjectPendingBriefFiles,
  setEditProjectOpen,
  setEditProjectTypeIds,
}) {
  setEditProjectDraftAttachments(
    normalizeAttachments(projectSnap?.description_attachments).map((a) => ({
      path: a.path,
      name: a.name,
      mime: a.mime || 'application/octet-stream',
    })),
  );
  setEditProjectPendingBriefFiles([]);
  if (typeof setEditProjectTypeIds === 'function' && projectSnap) {
    setEditProjectTypeIds(projectTypeIdsFromRow(projectSnap));
  }
  setEditProjectOpen(true);
}

function projectTypeIdsFromRow(proj) {
  if (!proj) return ['custom'];
  const raw = proj.project_type_ids;
  if (Array.isArray(raw) && raw.length) {
    const ids = [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
    return ids.length ? ids : ['custom'];
  }
  const legacy = proj.project_type ? String(proj.project_type).trim() : '';
  return legacy ? [legacy] : ['custom'];
}

function mergeMessages(prev, incoming) {
  const map = new Map();
  for (const m of prev || []) {
    if (m?.id) map.set(m.id, m);
  }
  for (const m of incoming || []) {
    if (m?.id) map.set(m.id, m);
  }
  const toMs = (x) => {
    const t = x?.created_at ? new Date(x.created_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };
  return Array.from(map.values()).sort((a, b) => {
    const diff = toMs(a) - toMs(b);
    if (diff !== 0) return diff;
    // Stable secondary sort so NaN/identical timestamps keep a deterministic order.
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/** Cap on how many messages we load per channel in a single request. The chat
 *  UI only renders a window of history; everything older than this can be
 *  fetched lazily if/when we add an "earlier messages" affordance. Prevents
 *  memory blow-ups on long-running channels. */
const ERP_MESSAGES_PAGE_SIZE = 200;

const CHAT_EMOJI_PICKER = ['😀', '😁', '😂', '😊', '😍', '👍', '🎉', '🙏', '🔥', '✅', '📌', '📎', '⚡', '💡', '😅', '🤝'];

/** Chat/sidebar panel height — fixed per breakpoint so the left chat and the
 *  right channels+members sidebar always line up at the exact same height. */
const PROJECT_CHAT_PANEL_CLASS =
  'flex flex-col min-h-0 h-[min(680px,78dvh)] overflow-hidden ' +
  'lg:h-[min(820px,82vh)] ' +
  'xl:h-[calc(100dvh-10rem)]';

/** iOS Photos + Android galleries; label-associated input works where programmatic .click() fails. */
const PROJECT_CHAT_FILE_ACCEPT = '*/*';

const PROJECT_CHAT_MAX_FILE_BYTES = 12 * 1024 * 1024;

const PROJECT_BRIEF_MAX_FILE_BYTES = 12 * 1024 * 1024;
const PROJECT_BRIEF_ATTACH_MAX = 24;
const PROJECT_BRIEF_FILE_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip';

function safeBriefFileName(name) {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

function normalizeBoardColumn(raw) {
  const v = String(raw || 'todo').toLowerCase();
  if (v === 'todo' || v === 'in_progress' || v === 'review' || v === 'completed') return v;
  return 'todo';
}

function leadSourceLabel(src) {
  const s = String(src || 'direct').toLowerCase();
  if (s === 'upwork') return 'upwork';
  if (s === 'fiverr') return 'fiverr';
  if (s === 'referral') return 'referral';
  if (s === 'airtasker') return 'airtasker';
  if (s === 'other') return 'other';
  return 'direct';
}

function leadSourceDotClass(src) {
  const s = String(src || 'direct').toLowerCase();
  if (s === 'upwork' || s === 'fiverr') return 'bg-emerald-500';
  if (s === 'referral') return 'bg-amber-400';
  if (s === 'airtasker') return 'bg-sky-500';
  if (s === 'other') return 'bg-slate-400';
  return 'bg-sky-500';
}

function daysLeftFromDateOnly(dateStr) {
  if (!dateStr) return null;
  const end = new Date(`${dateStr}T23:59:59`);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.ceil((end - start) / 86400000);
}

function taskProgressFromTasks(taskList) {
  const list = taskList || [];
  const work = list.filter((t) => t.parent_task_id);
  const use = work.length ? work : list;
  const total = use.length;
  const done = use.filter((t) => String(t.status).toLowerCase() === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
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

function normalizeAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((a) => a && typeof a.path === 'string');
  return [];
}

export default function ErpProjectWorkspace({ projectId, userId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useErpSession();
  const { setBreadcrumbLabel } = useErpBreadcrumb();

  useEffect(() => {
    if (!userId || !projectId) return;
    recordProjectVisit(userId, projectId);
  }, [userId, projectId]);
  const [resolvedWorkspaceRole, setResolvedWorkspaceRole] = useState(null);
  const isWorkspaceAdmin =
    isErpManagerRole(profile?.role) || resolvedWorkspaceRole === 'admin' || resolvedWorkspaceRole === 'team_lead';
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [nameMap, setNameMap] = useState({});
  const [profileByUserId, setProfileByUserId] = useState({});
  const [lastActiveByUserId, setLastActiveByUserId] = useState({});
  const [body, setBody] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** Scrollable message list (overflow-y-auto). Never use scrollIntoView on children — it scrolls the whole page. */
  const chatMessagesScrollRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const editProjectBriefFileRef = useRef(null);
  /** Rich project chat composer (replaces textarea). */
  const chatInputRef = useRef(null);
  const [chatComposerBump, bumpChatComposer] = useReducer((x) => x + 1, 0);
  const [showEmoji, setShowEmoji] = useState(false);
  const toolbarRef = useRef(null);
  const mentionPickerRef = useRef(null);
  const mentionAnchorRef = useRef(-1);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionEnd, setMentionEnd] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryTab, setGalleryTab] = useState('files');
  const [subtaskModalParentId, setSubtaskModalParentId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const editingTaskPreviousAssigneeIdsRef = useRef([]);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskDescription, setSubtaskDescription] = useState('');
  const [subtaskDue, setSubtaskDue] = useState('');
  const [subtaskPriority, setSubtaskPriority] = useState('medium');
  const [subtaskAssigneeIds, setSubtaskAssigneeIds] = useState([]);
  const [subtaskFiles, setSubtaskFiles] = useState([]);
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [creatingRootForSubtask, setCreatingRootForSubtask] = useState(false);
  const [subtaskInviteOpen, setSubtaskInviteOpen] = useState(false);
  const [subtaskInviteEmail, setSubtaskInviteEmail] = useState('');
  const [subtaskInviteRole, setSubtaskInviteRole] = useState('team_member');
  const [subtaskInviteRoleOptions, setSubtaskInviteRoleOptions] = useState([]);
  const [subtaskInviteBusy, setSubtaskInviteBusy] = useState(false);
  const [subtaskInviteNote, setSubtaskInviteNote] = useState('');
  const [subtaskDeleteConfirmOpen, setSubtaskDeleteConfirmOpen] = useState(false);
  const subtaskFileRef = useRef(null);
  const [projectBulkMenu, setProjectBulkMenu] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [reactionsByMessageId, setReactionsByMessageId] = useState({});
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [taskPanelView, setTaskPanelView] = useState('kanban');
  /** 'mine' = only tasks assigned to the current user via assignee_id or
   *  assignee_ids. 'team' = every task in the project (admins & team leads
   *  can switch to this view via the header toggle). */
  const [taskScope, setTaskScope] = useState('mine');
  const [rightSidebarTab, setRightSidebarTab] = useState('channels');
  const [inviteMembersOpen, setInviteMembersOpen] = useState(false);
  const [scopeSectionOpen, setScopeSectionOpen] = useState(true);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [totalTimeLogged, setTotalTimeLogged] = useState(0);
  const [projectTimeHistoryOpen, setProjectTimeHistoryOpen] = useState(false);
  const [projectDeleting, setProjectDeleting] = useState(false);
  const [projectChannels, setProjectChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const activeChannelIdRef = useRef(null);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelSaving, setNewChannelSaving] = useState(false);
  /** When set, the sidebar renders an inline rename input on that channel. */
  const [editingChannelId, setEditingChannelId] = useState(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [channelBusyId, setChannelBusyId] = useState(null);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState(null);
  const chatDraftSaveTimerRef = useRef(null);
  /** Used to avoid heavy refetch + scroll jump when briefly switching apps (e.g. WhatsApp). */
  const visibilityHiddenAtRef = useRef(null);
  const taskRealtimeDebounceRef = useRef(null);

  const chatDraftStorageKey = useMemo(() => {
    const ch = activeChannelId || 'general';
    return `erp:draft:project:${projectId}:channel:${ch}`;
  }, [activeChannelId, projectId]);

  // Restore unsent project chat draft when switching channels or returning to page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!chatDraftStorageKey) return;
    try {
      const saved = window.localStorage.getItem(chatDraftStorageKey);
      const next = saved != null ? String(saved) : '';
      setBody(next);
      bumpChatComposer();
      requestAnimationFrame(() => {
        try {
          const root = chatInputRef.current?.getEditableRoot?.();
          if (root) {
            const txt = String(root.innerText || '');
            syncMentionFromValue(txt, txt.length);
          }
        } catch {}
      });
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatDraftStorageKey]);

  // Persist unsent project chat draft as user types (debounced).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!chatDraftStorageKey) return;
    if (chatDraftSaveTimerRef.current) window.clearTimeout(chatDraftSaveTimerRef.current);
    chatDraftSaveTimerRef.current = window.setTimeout(() => {
      try {
        const v = String(body || '');
        if (v.trim().length === 0) window.localStorage.removeItem(chatDraftStorageKey);
        else window.localStorage.setItem(chatDraftStorageKey, v);
      } catch {}
    }, 250);
    return () => {
      if (chatDraftSaveTimerRef.current) window.clearTimeout(chatDraftSaveTimerRef.current);
    };
  }, [body, chatDraftStorageKey]);

  const myProjectMembership = useMemo(
    () => (userId ? members.find((m) => m.user_id === userId) : null),
    [members, userId],
  );
  const canAccessProjectCredentials = canAccessErpProjectCredentials(profile, myProjectMembership?.role);

  const canDeleteProject = isErpManagerRole(profile?.role);
  const canRemoveProjectMembers = profile?.role === 'admin' || resolvedWorkspaceRole === 'admin';
  const canEditProjectDetails = Boolean(
    profile?.role === 'admin' ||
      profile?.role === 'team_lead' ||
      myProjectMembership?.role === 'project_lead' ||
      resolvedWorkspaceRole === 'admin',
  );
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  const [editProjectStartDate, setEditProjectStartDate] = useState('');
  const [editProjectDueDate, setEditProjectDueDate] = useState('');
  const [editProjectBusy, setEditProjectBusy] = useState(false);
  const [editProjectTypeIds, setEditProjectTypeIds] = useState([]);
  const [editProjectTypeOptions, setEditProjectTypeOptions] = useState(ERP_PROJECT_TYPES);
  /** Saved brief files while edit modal is open (path/name/mime). */
  const [editProjectDraftAttachments, setEditProjectDraftAttachments] = useState([]);
  const [editProjectPendingBriefFiles, setEditProjectPendingBriefFiles] = useState([]);
  const processedEditUrlRef = useRef(null);
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const [deleteProjectTyped, setDeleteProjectTyped] = useState('');
  const [deleteProjectErr, setDeleteProjectErr] = useState('');
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [clearChatTyped, setClearChatTyped] = useState('');
  const [clearChatBusy, setClearChatBusy] = useState(false);
  const [clearChatErr, setClearChatErr] = useState('');
  const [chatCtxMenu, setChatCtxMenu] = useState(null);
  /** { userId, left, top } — project member row ⋮ menu (portal). */
  const [memberActionsMenu, setMemberActionsMenu] = useState(null);
  /** { left, top } — header ⋮ menu (Edit/Delete). */
  const [projectHeaderMenu, setProjectHeaderMenu] = useState(null);
  const [projectCompletionBusy, setProjectCompletionBusy] = useState(false);
  const [projectDescExpanded, setProjectDescExpanded] = useState(false);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState(null);
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState(null);
  const [chatEditingMessageId, setChatEditingMessageId] = useState(null);
  const [chatEditingDraft, setChatEditingDraft] = useState('');
  const [chatEditBusy, setChatEditBusy] = useState(false);

  useEffect(() => {
    setChatEditingMessageId(null);
    setChatEditingDraft('');
    setChatEditBusy(false);
  }, [projectId, activeChannelId]);

  useEffect(() => {
    if (!chatCtxMenu) return;
    function onDoc() {
      setChatCtxMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setChatCtxMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [chatCtxMenu]);

  useEffect(() => {
    if (!memberActionsMenu) return;
    function onDoc() {
      setMemberActionsMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMemberActionsMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [memberActionsMenu]);

  useEffect(() => {
    if (!projectHeaderMenu) return;
    function onDoc() {
      setProjectHeaderMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setProjectHeaderMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [projectHeaderMenu]);

  useEffect(() => {
    setProjectDescExpanded(false);
  }, [projectId]);

  useEffect(() => {
    setProjectTimeHistoryOpen(false);
  }, [projectId]);

  const avatarProfileFor = useCallback(
    (uid) => {
      const row = profileByUserId[uid];
      const mem = members.find((x) => x.user_id === uid);
      const fullName = row?.full_name ?? nameMap[uid] ?? 'Member';
      return {
        id: uid,
        full_name: fullName,
        role: row?.role ?? mem?.role ?? 'team_member',
        avatar_path: row?.avatar_path ?? null,
        member_team: row?.member_team ?? null,
      };
    },
    [profileByUserId, members, nameMap],
  );

  const memberDelegationLabel = useCallback(
    (projectMember) =>
      erpProjectMemberDelegationLabel(projectMember.role, profileByUserId[projectMember.user_id]),
    [profileByUserId],
  );

  const sortedProjectMembers = useMemo(() => {
    const list = [...members];
    list.sort((a, b) => {
      const ar = a.role === 'project_lead' ? 0 : a.role === 'client' ? 2 : 1;
      const br = b.role === 'project_lead' ? 0 : b.role === 'client' ? 2 : 1;
      if (ar !== br) return ar - br;
      const ta = profileByUserId[a.user_id]?.member_team || '';
      const tb = profileByUserId[b.user_id]?.member_team || '';
      if (ta !== tb) return String(ta).localeCompare(String(tb));
      const na = nameMap[a.user_id] || '';
      const nb = nameMap[b.user_id] || '';
      return na.localeCompare(nb);
    });
    return list;
  }, [members, profileByUserId, nameMap]);

  const workspacePanel =
    'rounded-2xl border border-cyan-200/40 bg-white/88 backdrop-blur-md shadow-[0_16px_48px_-14px_rgba(16,61,77,0.2),0_4px_20px_-8px_rgba(15,23,42,0.08)] ring-1 ring-white/70 ' +
    'dark:border-teal-950/45 dark:bg-[#060b10] dark:[background-image:none] dark:shadow-[0_20px_56px_-14px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(45,212,191,0.06)] dark:ring-1 dark:ring-teal-950/40';

  const resolveProfiles = useCallback(async (userIds) => {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return { names: {}, presence: {}, profiles: {} };
    const CHUNK = 80;
    const names = {};
    const presence = {};
    const profiles = {};
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('erp_profiles')
        .select('id, full_name, last_active_at, avatar_path, role, member_team')
        .in('id', slice);
      (data || []).forEach((p) => {
        names[p.id] = p.full_name || 'User';
        if (p.last_active_at != null) presence[p.id] = p.last_active_at;
        profiles[p.id] = {
          id: p.id,
          full_name: p.full_name || 'User',
          avatar_path: p.avatar_path ?? null,
          role: p.role ?? 'team_member',
          member_team: p.member_team ?? null,
        };
      });
    }
    return { names, presence, profiles };
  }, []);

  /** Ref to the latest `refreshSessionData` so long-lived callbacks (loadCore,
   *  realtime subscription handlers) can invoke the freshest version without
   *  having to be in a dependency array — which would otherwise cause the
   *  whole project to reload every time the active channel changes. */
  const refreshSessionDataRef = useRef(null);

  const refreshSessionData = useCallback(
    async (channelIdOverride) => {
      const cid = channelIdOverride ?? activeChannelId;
      if (!projectId || !cid) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      // Fetch the latest page of messages (newest → oldest) and reverse for
      // ascending display. Capped to ERP_MESSAGES_PAGE_SIZE so active channels
      // don't pull tens of thousands of rows on every channel switch.
      const [{ data: msgsDesc }, { data: tks }] = await Promise.all([
        supabase
          .from('erp_messages')
          .select(ERP_PROJECT_MESSAGE_LIST_COLUMNS)
          .eq('project_id', projectId)
          .eq('channel_id', cid)
          .order('created_at', { ascending: false })
          .limit(ERP_MESSAGES_PAGE_SIZE),
        supabase
          .from('erp_tasks')
          .select(ERP_TASK_LIST_COLUMNS)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);
      const msgs = Array.isArray(msgsDesc) ? [...msgsDesc].reverse() : [];

      setMessages(mergeMessages([], msgs));
      setTasks(tks || []);

      const msgList = msgs || [];
      if (msgList.length === 0) {
        setReactionsByMessageId({});
      } else {
        const midList = msgList.map((m) => m.id).filter(Boolean);
        const { data: reacts } = await supabase
          .from('erp_message_reactions')
          .select('id, message_id, user_id, emoji')
          .in('message_id', midList);
        const map = {};
        for (const r of reacts || []) {
          if (!map[r.message_id]) map[r.message_id] = [];
          map[r.message_id].push(r);
        }
        setReactionsByMessageId(map);
      }

      const uidSet = new Set();
      (msgs || []).forEach((m) => uidSet.add(m.user_id));
      (tks || []).forEach((t) => {
        if (t.assignee_id) uidSet.add(t.assignee_id);
        if (Array.isArray(t.assignee_ids)) {
          for (const aid of t.assignee_ids) if (aid) uidSet.add(aid);
        }
        if (t.created_by) uidSet.add(t.created_by);
        (Array.isArray(t.tagged_user_ids) ? t.tagged_user_ids : []).forEach((id) => uidSet.add(id));
      });
      const { names, presence, profiles } = await resolveProfiles([...uidSet]);
      setNameMap((prev) => ({ ...prev, ...names }));
      setLastActiveByUserId((prev) => ({ ...prev, ...presence }));
      setProfileByUserId((prev) => ({ ...prev, ...profiles }));
    },
    [projectId, activeChannelId, resolveProfiles],
  );

  useEffect(() => {
    refreshSessionDataRef.current = refreshSessionData;
  }, [refreshSessionData]);

  /** Tasks + member profiles only — avoids reloading all chat messages on every poll / task realtime event. */
  const refreshTasksOnly = useCallback(async () => {
    if (!projectId) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const { data: tks } = await supabase
      .from('erp_tasks')
      .select(ERP_TASK_LIST_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setTasks(tks || []);
    const uidSet = new Set();
    (tks || []).forEach((t) => {
      if (t.assignee_id) uidSet.add(t.assignee_id);
      if (Array.isArray(t.assignee_ids)) {
        for (const aid of t.assignee_ids) if (aid) uidSet.add(aid);
      }
      if (t.created_by) uidSet.add(t.created_by);
      (Array.isArray(t.tagged_user_ids) ? t.tagged_user_ids : []).forEach((id) => uidSet.add(id));
    });
    const { names, presence, profiles } = await resolveProfiles([...uidSet]);
    setNameMap((prev) => ({ ...prev, ...names }));
    setLastActiveByUserId((prev) => ({ ...prev, ...presence }));
    setProfileByUserId((prev) => ({ ...prev, ...profiles }));
  }, [projectId, resolveProfiles]);

  const scheduleRefreshTasksOnly = useCallback(() => {
    if (taskRealtimeDebounceRef.current != null) {
      window.clearTimeout(taskRealtimeDebounceRef.current);
    }
    taskRealtimeDebounceRef.current = window.setTimeout(() => {
      taskRealtimeDebounceRef.current = null;
      void refreshTasksOnly();
    }, ERP_TASK_REALTIME_DEBOUNCE_MS);
  }, [refreshTasksOnly]);

  useEffect(() => {
    return () => {
      if (taskRealtimeDebounceRef.current != null) {
        window.clearTimeout(taskRealtimeDebounceRef.current);
        taskRealtimeDebounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    if (!userId || !projectId || !activeChannelId) return;
    // Auto-clear chat notification badge when the user opens the channel.
    supabase
      .from('erp_notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .ilike('link', `%/erp/projects/${projectId}%channel=${activeChannelId}%`)
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erp-notifications-reload'));
        }
      });
  }, [userId, projectId, activeChannelId]);

  const selectChannel = useCallback(
    (cid) => {
      if (!cid) return;
      setActiveChannelId(cid);
      setReplyTarget(null);
      void refreshSessionData(cid);
      router.replace(`/erp/projects/${projectId}?channel=${encodeURIComponent(cid)}`, { scroll: false });
    },
    [projectId, refreshSessionData, router],
  );

  useEffect(() => {
    const raw = searchParams.get('channel');
    if (!raw || projectChannels.length === 0) return;
    const match = projectChannels.find((c) => c.id === raw);
    if (match && match.id !== activeChannelId) {
      setActiveChannelId(match.id);
      setReplyTarget(null);
      void refreshSessionData(match.id);
    }
  }, [searchParams, projectChannels, activeChannelId, refreshSessionData]);

  const briefAttachments = useMemo(
    () => normalizeAttachments(project?.description_attachments),
    [project?.description_attachments]
  );

  const attachmentGallery = useMemo(() => {
    const items = [];
    for (const m of messages) {
      const atts = normalizeAttachments(m.attachments);
      const who = nameMap[m.user_id] || 'Member';
      for (const a of atts) {
        items.push({
          ...a,
          messageId: m.id,
          created_at: m.created_at,
          senderLabel: who,
        });
      }
    }
    return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [messages, nameMap]);

  const galleryMediaItems = useMemo(
    () =>
      attachmentGallery.filter((a) => {
        const m = a.mime || '';
        return m.startsWith('image/') || m.startsWith('video/');
      }),
    [attachmentGallery]
  );
  const galleryFileItems = useMemo(
    () =>
      attachmentGallery.filter((a) => {
        const m = a.mime || '';
        return !(m.startsWith('image/') || m.startsWith('video/'));
      }),
    [attachmentGallery]
  );
  /** Extract every http(s) URL shared in chat message bodies, newest first,
   *  deduplicated by URL (keeps the most recent occurrence + its sender). */
  const galleryLinkItems = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s<>"'`]+)/gi;
    const byUrl = new Map();
    const sorted = [...messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    for (const m of sorted) {
      const body = typeof m.body === 'string' ? m.body : '';
      if (!body) continue;
      const matches = body.match(urlRegex);
      if (!matches) continue;
      const who = nameMap[m.user_id] || 'Member';
      for (const raw of matches) {
        const url = raw.replace(/[)\],.;!?]+$/g, '');
        if (!url || byUrl.has(url)) continue;
        let host = url;
        try {
          host = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          /* non-parsable, keep raw */
        }
        byUrl.set(url, {
          url,
          host,
          messageId: m.id,
          created_at: m.created_at,
          senderLabel: who,
        });
      }
    }
    return Array.from(byUrl.values());
  }, [messages, nameMap]);

  const messageById = useMemo(() => {
    const o = {};
    for (const m of messages) {
      if (m?.id) o[m.id] = m;
    }
    return o;
  }, [messages]);

  const mentionCandidates = useMemo(() => {
    const q = (mentionQuery || '').trim().toLowerCase();
    const list = [...members].sort((a, b) => {
      const na = (nameMap[a.user_id] || '').toLowerCase();
      const nb = (nameMap[b.user_id] || '').toLowerCase();
      return na.localeCompare(nb);
    });
    if (!q) return list;
    return list.filter((m) => {
      const name = (nameMap[m.user_id] || '').toLowerCase();
      return name.includes(q) || m.user_id.toLowerCase().includes(q);
    });
  }, [members, nameMap, mentionQuery]);

  const rootTasks = useMemo(() => {
    const roots = tasks.filter((t) => !t.parent_task_id);
    roots.sort((a, b) => {
      const pr = compareTaskPriority(normalizeTaskPriority(a.priority), normalizeTaskPriority(b.priority));
      if (pr !== 0) return pr;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return roots;
  }, [tasks]);

  const canonicalRoot = useMemo(
    () => pickCanonicalRootTask(rootTasks, project?.name),
    [rootTasks, project?.name],
  );

  const workTasks = useMemo(() => tasks.filter((t) => t.parent_task_id), [tasks]);

  const projectTaskMetrics = useMemo(() => taskProgressFromTasks(tasks), [tasks]);
  const boardCol = normalizeBoardColumn(project?.board_column);
  const isProjectCompleted = boardCol === 'completed';
  const daysLeftDeadline = useMemo(() => daysLeftFromDateOnly(project?.deadline_date), [project?.deadline_date]);

  const timelineItems = useMemo(() => {
    const list = (workTasks.length ? workTasks : tasks).slice();
    list.sort((a, b) => {
      const da = a.due_date || '';
      const db = b.due_date || '';
      if (!da && !db) return String(a.title || '').localeCompare(String(b.title || ''));
      if (!da) return 1;
      if (!db) return -1;
      const c = da.localeCompare(db);
      if (c !== 0) return c;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return list;
  }, [workTasks, tasks]);

  const subtaskModalParentTask = useMemo(
    () => (subtaskModalParentId ? tasks.find((r) => r.id === subtaskModalParentId) : null),
    [tasks, subtaskModalParentId],
  );

  const addingTaskUnderProjectAnchor = Boolean(
    canonicalRoot &&
      subtaskModalParentId === canonicalRoot.id &&
      String(canonicalRoot.title || '').trim() === String(project?.name || '').trim(),
  );

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: proj, error: pErr } = await supabase
      .from('erp_projects')
      .select('*')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle();
    if (pErr || !proj) {
      setError('Project not found or access denied.');
      setLoading(false);
      return;
    }
    setProject(proj);
    setEditProjectName(proj?.name ? String(proj.name) : '');
    setEditProjectDesc(proj?.description ? String(proj.description) : '');
    setEditProjectStartDate(proj?.start_date ? String(proj.start_date) : '');
    setEditProjectDueDate(proj?.deadline_date ? String(proj.deadline_date) : '');
    setEditProjectTypeIds(projectTypeIdsFromRow(proj));

    if (userId) {
      const { data: roleRow } = await supabase.from('erp_profiles').select('role').eq('id', userId).maybeSingle();
      setResolvedWorkspaceRole(roleRow?.role ?? null);
    } else {
      setResolvedWorkspaceRole(null);
    }

    const { data: mems } = await supabase.from('erp_project_members').select('user_id, role').eq('project_id', projectId);
    const m = mems || [];
    setMembers(m);
    const ids = m.map((x) => x.user_id);
    const { names, presence, profiles } = await resolveProfiles(ids);
    setNameMap((prev) => ({ ...prev, ...names }));
    setLastActiveByUserId((prev) => ({ ...prev, ...presence }));
    setProfileByUserId((prev) => ({ ...prev, ...profiles }));

    const { data: chs, error: chErr } = await supabase
      .from('erp_project_channels')
      .select('id, name, sort_order, is_general')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (chErr || !chs?.length) {
      setError(
        'Project chat channels are not set up. Run the latest database migration (erp_project_channels), or contact support.',
      );
      setProjectChannels([]);
      setActiveChannelId(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    setProjectChannels(chs);

    // Read the ?channel= param directly from window.location so this callback
    // doesn't depend on the `searchParams` object identity (which changes for
    // unrelated query-string tweaks and would otherwise reload the whole
    // project on every URL mutation).
    let urlCh = null;
    if (typeof window !== 'undefined') {
      try {
        urlCh = new URL(window.location.href).searchParams.get('channel');
      } catch {
        urlCh = null;
      }
    }
    const fromUrl = urlCh && chs.some((c) => c.id === urlCh);
    const pick = fromUrl ? chs.find((c) => c.id === urlCh) : chs.find((c) => c.is_general) || chs[0];
    const cid = pick?.id;
    if (!cid) {
      setError('No chat channel for this project.');
      setLoading(false);
      return;
    }
    setActiveChannelId(cid);
    // Call via ref so loadCore doesn't rebuild every time refreshSessionData
    // is recreated (which happens whenever activeChannelId changes).
    if (refreshSessionDataRef.current) {
      await refreshSessionDataRef.current(cid);
    }
    setLoading(false);
  }, [projectId, userId, resolveProfiles]);

  const reloadProjectMembers = useCallback(async () => {
    if (!projectId) return;
    const { data: mems } = await supabase.from('erp_project_members').select('user_id, role').eq('project_id', projectId);
    const m = mems || [];
    setMembers(m);
    const ids = m.map((x) => x.user_id);
    const { names, presence, profiles } = await resolveProfiles(ids);
    setNameMap((prev) => ({ ...prev, ...names }));
    setLastActiveByUserId((prev) => ({ ...prev, ...presence }));
    setProfileByUserId((prev) => ({ ...prev, ...profiles }));
  }, [projectId, resolveProfiles]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (!canAccessProjectCredentials && rightSidebarTab === 'credentials') {
      setRightSidebarTab('channels');
    }
  }, [canAccessProjectCredentials, rightSidebarTab]);

  useEffect(() => {
    if (project?.name) {
      setBreadcrumbLabel('project', project.name);
    }
    return () => setBreadcrumbLabel('project', null);
  }, [project?.name, setBreadcrumbLabel]);

  useEffect(() => {
    const wantEdit = searchParams?.get('edit') === '1';
    if (!wantEdit) {
      processedEditUrlRef.current = null;
      return;
    }
    if (!projectId || loading || !project) return;

    const fp = `${projectId}|${searchParams.toString()}`;
    if (processedEditUrlRef.current === fp) return;
    processedEditUrlRef.current = fp;

    const stripEditKeepChannel = () => {
      try {
        const u = new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost');
        u.searchParams.delete('edit');
        const qs = u.searchParams.toString();
        router.replace(`${u.pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
      } catch {
        router.replace(`/erp/projects/${projectId}`, { scroll: false });
      }
    };

    if (!canEditProjectDetails) {
      stripEditKeepChannel();
      return;
    }

    openEditProjectModal({
      project,
      setEditProjectDraftAttachments,
      setEditProjectPendingBriefFiles,
      setEditProjectOpen,
      setEditProjectTypeIds,
    });
    stripEditKeepChannel();
  }, [
    searchParams,
    project,
    loading,
    projectId,
    canEditProjectDetails,
    router,
    setEditProjectDraftAttachments,
    setEditProjectOpen,
    setEditProjectTypeIds,
  ]);

  useEffect(() => {
    if (!projectId || !project) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refreshTasksOnly();
    };
    tick();
    const id = setInterval(tick, ERP_TASK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, project, refreshTasksOnly]);

  useEffect(() => {
    if (!projectId || !project) return;
    const onVis = () => {
      const chatEl = chatMessagesScrollRef.current;
      if (document.visibilityState === 'hidden') {
        visibilityHiddenAtRef.current = Date.now();
        try {
          const cid = activeChannelIdRef.current;
          if (chatEl && cid) {
            sessionStorage.setItem(`erp:projChatScroll:${projectId}:${cid}`, String(chatEl.scrollTop));
          }
        } catch {
          /* ignore */
        }
        return;
      }
      const t0 = visibilityHiddenAtRef.current;
      visibilityHiddenAtRef.current = null;
      const hiddenMs = t0 ? Date.now() - t0 : 0;

      const tryRestoreChatScroll = () => {
        try {
          const cid = activeChannelIdRef.current;
          const el = chatMessagesScrollRef.current;
          if (!cid || !el) return;
          const raw = sessionStorage.getItem(`erp:projChatScroll:${projectId}:${cid}`);
          if (raw == null) return;
          const n = parseInt(raw, 10);
          if (Number.isNaN(n)) return;
          requestAnimationFrame(() => {
            try {
              el.scrollTop = n;
            } catch {
              /* ignore */
            }
          });
        } catch {
          /* ignore */
        }
      };

      // Brief app switch: restore scroll only, no network refetch (realtime + polls still run).
      if (hiddenMs < 5000) {
        tryRestoreChatScroll();
        return;
      }
      // Long away: full resync. Medium: tasks only so chat list is not replaced (keeps scroll + in-memory UI).
      if (hiddenMs > 3 * 60 * 1000) {
        void refreshSessionData().then(() => {
          try {
            const el = chatMessagesScrollRef.current;
            if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
          } catch {
            /* ignore */
          }
        });
      } else {
        void refreshTasksOnly().then(tryRestoreChatScroll);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [projectId, project, refreshSessionData, refreshTasksOnly]);

  useEffect(() => {
    if (!projectId) return;

    /** Pending user ids whose profiles need to be resolved — flushed in a
     *  single query every 120ms. Without this, a burst of chat messages fires
     *  one supabase round-trip per message (classic realtime chat smell). */
    const pending = new Set();
    let flushTimer = null;
    let cancelled = false;
    const flushPendingProfiles = async () => {
      flushTimer = null;
      if (cancelled) return;
      const ids = [...pending];
      pending.clear();
      if (ids.length === 0) return;
      try {
        const { names, presence, profiles } = await resolveProfiles(ids);
        if (cancelled) return;
        setNameMap((prev) => ({ ...prev, ...names }));
        setLastActiveByUserId((prev) => ({ ...prev, ...presence }));
        setProfileByUserId((prev) => ({ ...prev, ...profiles }));
      } catch {
        /* swallow — will retry on next insert */
      }
    };
    const schedulePendingFlush = () => {
      if (flushTimer != null) return;
      flushTimer = setTimeout(flushPendingProfiles, 120);
    };

    const channel = supabase
      .channel(`erp-messages-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_messages', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new;
          if (row?.channel_id && row.channel_id !== activeChannelIdRef.current) return;
          setMessages((prev) => mergeMessages(prev, [row]));
          if (row?.user_id) {
            pending.add(row.user_id);
            schedulePendingFlush();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'erp_messages', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new;
          if (row?.channel_id && row.channel_id !== activeChannelIdRef.current) return;
          setMessages((prev) => mergeMessages(prev, [row]));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      if (flushTimer != null) clearTimeout(flushTimer);
      supabase.removeChannel(channel);
    };
  }, [projectId, resolveProfiles]);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`erp-reactions-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_message_reactions', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new;
          if (!row?.message_id || !row?.id) return;
          setReactionsByMessageId((prev) => {
            const list = [...(prev[row.message_id] || [])];
            if (list.some((x) => x.id === row.id)) return prev;
            list.push({
              id: row.id,
              message_id: row.message_id,
              user_id: row.user_id,
              emoji: row.emoji,
            });
            return { ...prev, [row.message_id]: list };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'erp_message_reactions', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.old;
          if (!row?.message_id || !row?.id) return;
          setReactionsByMessageId((prev) => {
            const list = (prev[row.message_id] || []).filter((r) => r.id !== row.id);
            const next = { ...prev };
            if (list.length) next[row.message_id] = list;
            else delete next[row.message_id];
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`erp-tasks-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_tasks', filter: `project_id=eq.${projectId}` },
        () => {
          scheduleRefreshTasksOnly();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, scheduleRefreshTasksOnly]);

  /** Track the previously-seen channel id so we can force-scroll on channel
   *  switches (fresh history load) but respect the user's scroll position
   *  while they're reading older messages in the current channel.
   *  `lastInitialScrolledChannelRef` separately tracks the first time we
   *  actually had messages to render for a channel so async fetches after a
   *  channel switch still land at the bottom (latest message), not the top. */
  const lastScrolledChannelRef = useRef(null);
  const lastInitialScrolledChannelRef = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = chatMessagesScrollRef.current;
        if (!el) return;
        const channelChanged = lastScrolledChannelRef.current !== activeChannelId;
        const firstMessagesForChannel =
          messages.length > 0 && lastInitialScrolledChannelRef.current !== activeChannelId;
        // Near-bottom check: within 120px of the bottom edge counts as
        // "following the conversation", so new messages auto-scroll. If the
        // user has scrolled up to read history, we leave them alone.
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const shouldAutoScroll =
          channelChanged || firstMessagesForChannel || distanceFromBottom < 120;
        if (shouldAutoScroll) {
          el.scrollTop = el.scrollHeight;
        }
        lastScrolledChannelRef.current = activeChannelId;
        if (messages.length > 0) {
          lastInitialScrolledChannelRef.current = activeChannelId;
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, activeChannelId]);

  const downloadFile = useCallback(async (path) => {
    const { data, error: err } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (err || !data?.signedUrl) return;
    await downloadFromSignedUrlWithFallback(data.signedUrl, basenameFromStoragePath(path));
  }, []);

  const [filePreview, setFilePreview] = useState(null);
  const openFilePreview = useCallback(
    (attachment) => {
      if (!attachment?.path) return;
      setFilePreview({
        path: attachment.path,
        name: attachment.name || attachment.path.split('/').pop() || 'file',
        mime: attachment.mime || attachment.mimetype || null,
        projectName: project?.name || '',
      });
    },
    [project?.name],
  );
  const closeFilePreview = useCallback(() => setFilePreview(null), []);

  function onChatFilesChosen(e) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (!list.length) return;
    const ok = [];
    const tooBig = [];
    for (const f of list) {
      if (f.size > PROJECT_CHAT_MAX_FILE_BYTES) tooBig.push(f.name);
      else ok.push(f);
    }
    if (tooBig.length > 0) {
      setError(`Each file must be ${Math.round(PROJECT_CHAT_MAX_FILE_BYTES / (1024 * 1024))} MB or smaller. Skipped: ${tooBig.slice(0, 3).join(', ')}${tooBig.length > 3 ? '…' : ''}`);
    }
    if (ok.length > 0) setPendingFiles((prev) => [...prev, ...ok]);
    e.target.value = '';
  }

  function onChatDrop(e) {
    e.preventDefault();
    const list = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (!list.length) return;
    setPendingFiles((prev) => [...prev, ...list]);
  }

  function onChatPaste(e) {
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const files = [];
    for (const it of items) {
      if (it?.kind === 'file') {
        const f = it.getAsFile?.();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      // Only intercept paste when there are files/images (e.g., screenshot).
      e.preventDefault();
      setPendingFiles((prev) => [...prev, ...files]);
    }
  }

  function removePendingAt(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function syncMentionFromValue(val, cursorPos) {
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
    const root = chatInputRef.current?.getEditableRoot?.();
    if (!root) return;
    const { text, offset } = erpCaretOffsetInInnerText(root);
    syncMentionFromValue(text, offset);
  }, []);

  function pickMention(member) {
    if (!member || mentionStart < 0) return;
    const name = (nameMap[member.user_id] || 'Member').trim() || 'Member';
    const insertText = `@${name} `;
    const root = chatInputRef.current?.getEditableRoot?.();
    if (root) {
      erpReplaceInnerTextSlice(root, mentionStart, mentionEnd, insertText);
      chatInputRef.current?.flushMarkdown?.();
    } else {
      const before = body.slice(0, mentionStart);
      const after = body.slice(mentionEnd);
      setBody(`${before}${insertText}${after}`);
    }
    mentionAnchorRef.current = -1;
    setMentionOpen(false);
    setMentionStart(-1);
    setMentionEnd(-1);
    setMentionQuery('');
    requestAnimationFrame(() => {
      try {
        chatInputRef.current?.focus?.();
      } catch {}
    });
  }

  function onChatKeyDown(e) {
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
    if (mentionCandidates.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionHighlight((h) => Math.min(h + 1, mentionCandidates.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pickMention(mentionCandidates[mentionHighlight]);
    }
  }

  function onComposerKeyDown(e) {
    onChatKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!sending && (body.trim() || pendingFiles.length > 0)) {
      void sendMessage(e);
    }
  }

  function insertIntoComposer(text) {
    if (!text) return;
    chatInputRef.current?.insertPlainText?.(text);
  }

  /** Rich-text toolbar (stored as markdown via turndown). */
  const applyMarkdownWrap = useCallback((before, after) => {
    const r = chatInputRef.current;
    if (!r) return;
    if (before === '**') r.applyBold?.();
    else if (before === '*' && after === '*') r.applyItalic?.();
    else if (before === '~~') r.applyStrikethrough?.();
    else if (String(before).charCodeAt(0) === 96) r.applyInlineCode?.();
    else if (String(before)[0] === '[') r.applyLinkFromPrompt?.();
  }, []);

  const insertLinePrefix = useCallback((prefix) => {
    chatInputRef.current?.insertPlainText?.(prefix);
  }, []);

  useEffect(() => {
    if (!mentionOpen) return;
    setMentionHighlight((h) => {
      if (!mentionCandidates.length) return 0;
      return Math.min(Math.max(0, h), mentionCandidates.length - 1);
    });
  }, [mentionOpen, mentionCandidates.length]);

  useEffect(() => {
    if (!showEmoji && !mentionOpen) return;
    const onDown = (e) => {
      if (e.key === 'Escape') {
        setShowEmoji(false);
        if (mentionOpen) {
          mentionAnchorRef.current = -1;
          setMentionOpen(false);
          setMentionStart(-1);
          setMentionEnd(-1);
          setMentionQuery('');
        }
      }
    };
    const onClick = (e) => {
      const t = e.target;
      if (toolbarRef.current && t instanceof Node && toolbarRef.current.contains(t)) return;
      if (mentionPickerRef.current && t instanceof Node && mentionPickerRef.current.contains(t)) return;
      setShowEmoji(false);
      if (mentionOpen) {
        mentionAnchorRef.current = -1;
        setMentionOpen(false);
        setMentionStart(-1);
        setMentionEnd(-1);
        setMentionQuery('');
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('mousedown', onClick);
    };
  }, [showEmoji, mentionOpen]);

  useEffect(() => {
    if (reactionPickerFor == null) return;
    const onDoc = (e) => {
      const t = e.target;
      if (t instanceof Node && t.closest?.('[data-erp-reaction-anchor]')) return;
      setReactionPickerFor(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [reactionPickerFor]);

  const startReplyToMessage = useCallback(
    (m) => {
      const label = nameMap[m.user_id] || 'Member';
      setReplyTarget({ id: m.id, label, snippet: messageSnippet(m) });
      setReactionPickerFor(null);
      requestAnimationFrame(() => {
        try {
          chatInputRef.current?.focus();
        } catch {}
      });
    },
    [nameMap]
  );

  const scrollToMessage = useCallback((id) => {
    if (!id) return;
    const el = document.getElementById(`erp-chat-msg-${id}`);
    const pane = chatMessagesScrollRef.current;
    if (!el || !pane) return;
    const delta = el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    const next = pane.scrollTop + delta - pane.clientHeight / 2 + el.getBoundingClientRect().height / 2;
    pane.scrollTo({ top: Math.max(0, next), behavior: 'smooth' });
  }, []);

  const toggleReaction = useCallback(
    async (messageId, emoji) => {
      if (!userId || !messageId || !emoji) return;
      const rows = reactionsByMessageId[messageId] || [];
      const existing = rows.find((r) => r.user_id === userId && r.emoji === emoji);
      if (existing) {
        const { error } = await supabase.from('erp_message_reactions').delete().eq('id', existing.id);
        if (error) setError(error.message);
        return;
      }
      const { error } = await supabase.from('erp_message_reactions').insert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
      if (error) setError(error.message);
    },
    [userId, reactionsByMessageId],
  );

  async function sendMessage(e) {
    e.preventDefault();
    const text = body.trim();
    if ((!text && pendingFiles.length === 0) || !userId) return;
    setSending(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of pendingFiles) {
        const lower = String(file.name || '').toLowerCase();
        const guessedMime =
          file.type ||
          (lower.endsWith('.heic') || lower.endsWith('.heif')
            ? 'image/heic'
            : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
              ? 'image/jpeg'
              : lower.endsWith('.png')
                ? 'image/png'
                : 'application/octet-stream');
        const blob = file.type ? file : new File([file], file.name, { type: guessedMime });
        const fd = new FormData();
        fd.append('projectId', projectId);
        fd.append('scope', 'chat');
        fd.append('file', blob, file.name);
        const upRes = await erpAuthorizedFetch('/api/erp/uploads/task-attachment', {
          method: 'POST',
          body: fd,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upData?.ok || !upData?.path) {
          setError(upData?.error || `Upload failed for "${file.name}"`);
          return;
        }
        uploaded.push({
          path: upData.path,
          name: upData.name || file.name,
          mime: upData.mime || guessedMime,
        });
      }

      const replyToId = replyTarget?.id ?? null;

      if (!activeChannelId) {
        setError('Pick a chat channel before sending.');
        return;
      }

      const { data: row, error: err } = await supabase
        .from('erp_messages')
        .insert({
          project_id: projectId,
          channel_id: activeChannelId,
          user_id: userId,
          body: text || '',
          attachments: uploaded,
          reply_to_id: replyToId,
        })
        .select()
        .single();

      if (err) {
        setError(err.message);
        return;
      }
      if (row) {
        setMessages((prev) => mergeMessages(prev, [row]));
      }
      setReplyTarget(null);

      setBody('');
      try {
        chatInputRef.current?.replaceMarkdown?.('');
      } catch {}
      try {
        if (typeof window !== 'undefined' && chatDraftStorageKey) {
          window.localStorage.removeItem(chatDraftStorageKey);
        }
      } catch {}
      setPendingFiles([]);

      if (row?.id) {
        erpAuthorizedFetch('/api/erp/notify-message', {
          method: 'POST',
          body: JSON.stringify({ messageId: row.id }),
        }).catch(() => {});
      }
    } finally {
      setSending(false);
    }
  }

  async function handleCreateChannel(e) {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name || !userId || !projectId || newChannelSaving) return;
    if (name.length > 80) {
      setError('Channel name must be 80 characters or fewer.');
      return;
    }
    setNewChannelSaving(true);
    setError('');
    try {
      const { data, error: insErr } = await supabase
        .from('erp_project_channels')
        .insert({
          project_id: projectId,
          name,
          sort_order: projectChannels.length,
          is_general: false,
          created_by: userId,
        })
        .select('id, name, sort_order, is_general')
        .single();
      if (insErr) throw new Error(insErr.message);
      setProjectChannels((prev) =>
        [...prev, data].sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return String(a.name).localeCompare(String(b.name));
        }),
      );
      setNewChannelOpen(false);
      setNewChannelName('');
      selectChannel(data.id);
    } catch (err) {
      setError(err?.message || 'Could not create channel.');
    } finally {
      setNewChannelSaving(false);
    }
  }

  function beginRenameChannel(ch) {
    if (!ch || ch.is_general) return;
    setEditingChannelId(ch.id);
    setEditingChannelName(ch.name || '');
  }

  function cancelRenameChannel() {
    setEditingChannelId(null);
    setEditingChannelName('');
  }

  async function submitRenameChannel(channelId) {
    const next = editingChannelName.trim();
    const current = projectChannels.find((c) => c.id === channelId);
    if (!current) return;
    if (!next) {
      setError('Channel name cannot be empty.');
      return;
    }
    if (next.length > 80) {
      setError('Channel name must be 80 characters or fewer.');
      return;
    }
    if (next === current.name) {
      cancelRenameChannel();
      return;
    }
    setChannelBusyId(channelId);
    setError('');
    try {
      const { error: upErr } = await supabase
        .from('erp_project_channels')
        .update({ name: next })
        .eq('id', channelId);
      if (upErr) throw new Error(upErr.message);
      setProjectChannels((prev) =>
        prev
          .map((c) => (c.id === channelId ? { ...c, name: next } : c))
          .sort((a, b) => {
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return String(a.name).localeCompare(String(b.name));
          }),
      );
      cancelRenameChannel();
    } catch (err) {
      setError(err?.message || 'Could not rename channel.');
    } finally {
      setChannelBusyId(null);
    }
  }

  async function confirmDeleteChannel() {
    const target = deleteChannelTarget;
    if (!target?.id) return;
    setChannelBusyId(target.id);
    setError('');
    try {
      const { error: delErr } = await supabase
        .from('erp_project_channels')
        .delete()
        .eq('id', target.id);
      if (delErr) throw new Error(delErr.message);
      setProjectChannels((prev) => prev.filter((c) => c.id !== target.id));
      if (activeChannelIdRef.current === target.id) {
        const general = projectChannels.find((c) => c.is_general);
        if (general) selectChannel(general.id);
      }
      setDeleteChannelTarget(null);
    } catch (err) {
      setError(err?.message || 'Could not delete channel.');
    } finally {
      setChannelBusyId(null);
    }
  }

  async function setTaskStatus(taskId, status) {
    const t = tasks.find((x) => x.id === taskId);
    const prev = t?.status ?? null;
    const pid = t?.project_id || projectId;
    await supabase.from('erp_tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (userId && pid) {
      void logErpTaskStatusChange({
        projectId: pid,
        userId,
        taskId,
        title: t?.title,
        previousStatus: prev,
        nextStatus: status,
      });
    }
    await refreshTasksOnly();
  }

  async function setTaskPriority(taskId, priority) {
    if (!isWorkspaceAdmin) return;
    const t = tasks.find((x) => x.id === taskId);
    const prev = t?.priority ?? null;
    await supabase
      .from('erp_tasks')
      .update({ priority, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (userId && projectId && t) {
      void logErpActivity({
        projectId,
        userId,
        action: 'task_priority_changed',
        meta: {
          task_id: taskId,
          title: t.title || '',
          from: prev != null ? String(prev) : null,
          to: String(priority),
        },
      });
    }
    await refreshTasksOnly();
  }

  const openSubtaskModal = useCallback((parentId) => {
    setSubtaskModalParentId(parentId);
    setEditingTaskId(null);
    editingTaskPreviousAssigneeIdsRef.current = [];
    setSubtaskTitle('');
    setSubtaskDescription('');
    setSubtaskDue('');
    setSubtaskPriority('medium');
    setSubtaskAssigneeIds([]);
    setSubtaskFiles([]);
    setError('');
  }, []);

  const closeSubtaskModal = useCallback(() => {
    setSubtaskModalParentId(null);
    setEditingTaskId(null);
    editingTaskPreviousAssigneeIdsRef.current = [];
    setSubtaskTitle('');
    setSubtaskDescription('');
    setSubtaskDue('');
    setSubtaskPriority('medium');
    setSubtaskAssigneeIds([]);
    setSubtaskFiles([]);
    setSubtaskInviteOpen(false);
    setSubtaskInviteEmail('');
    setSubtaskInviteRole('team_member');
    setSubtaskInviteRoleOptions([]);
    setSubtaskInviteNote('');
    setSubtaskInviteBusy(false);
    setSubtaskDeleteConfirmOpen(false);
  }, []);

  useEffect(() => {
    if (!subtaskInviteOpen) return;
    let cancelled = false;
    fetchErpWorkspaceRoleTypeOptions().then(({ ok, options }) => {
      if (cancelled || !ok || !Array.isArray(options) || options.length === 0) return;
      setSubtaskInviteRoleOptions(options);
      setSubtaskInviteRole((prev) => resolveDefaultWorkspaceRoleInviteId(options, prev));
    });
    return () => {
      cancelled = true;
    };
  }, [subtaskInviteOpen]);

  const sendSubtaskInvite = useCallback(async () => {
    const email = subtaskInviteEmail.trim().toLowerCase();
    setSubtaskInviteNote('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubtaskInviteNote('Enter a valid email.');
      return;
    }
    setSubtaskInviteBusy(true);
    try {
      const payload = {
        projectId: projectId || null,
        invites: [{ email, globalRole: subtaskInviteRole }],
      };
      const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.summary?.sent === 0) {
        setSubtaskInviteNote(data?.results?.[0]?.error || data?.error || 'Invite failed.');
      } else {
        setSubtaskInviteNote(`Invite sent to ${email}. They'll appear here after they accept.`);
        setSubtaskInviteEmail('');
      }
    } catch (e) {
      setSubtaskInviteNote(e?.message || 'Invite failed.');
    } finally {
      setSubtaskInviteBusy(false);
    }
  }, [subtaskInviteEmail, subtaskInviteRole, projectId]);

  const openEditTaskModal = useCallback(
    (taskId) => {
      if (!taskId) return;
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return;
      const parentId = t.parent_task_id || null;
      if (!parentId) return;
      setSubtaskModalParentId(parentId);
      setEditingTaskId(taskId);
      const existingAssignees = Array.isArray(t.assignee_ids)
        ? t.assignee_ids.filter(Boolean)
        : t.assignee_id
          ? [t.assignee_id]
          : [];
      editingTaskPreviousAssigneeIdsRef.current = existingAssignees;
      setSubtaskTitle(t.title || '');
      setSubtaskDescription(t.description || '');
      setSubtaskDue(t.due_date || '');
      setSubtaskPriority(normalizeTaskPriority(t.priority));
      setSubtaskAssigneeIds(existingAssignees);
      setSubtaskFiles([]);
      setError('');
    },
    [tasks],
  );

  /** Read-only task detail popup (shown when a user clicks on a task card). */
  const [detailTaskId, setDetailTaskId] = useState(null);
  const openTaskDetail = useCallback((taskId) => {
    if (!taskId) return;
    setDetailTaskId(taskId);
  }, []);
  const closeTaskDetail = useCallback(() => {
    setDetailTaskId(null);
  }, []);
  const detailTask = useMemo(
    () => (detailTaskId ? tasks.find((t) => t.id === detailTaskId) || null : null),
    [detailTaskId, tasks],
  );
  const onTaskDeletedFromDetail = useCallback(
    async (taskId) => {
      setDetailTaskId(null);
      if (editingTaskId === taskId) {
        closeSubtaskModal();
      }
      await refreshTasksOnly();
    },
    [editingTaskId, closeSubtaskModal, refreshTasksOnly],
  );

  const canDeleteTaskAsWorkspaceLead = isErpManagerRole(profile?.role);

  const confirmDeleteEditingSubtask = useCallback(async () => {
    const taskId = editingTaskId;
    if (!taskId || !projectId || !userId) return;
    setSubtaskSaving(true);
    setError('');
    try {
      const { error: delErr } = await supabase.from('erp_tasks').delete().eq('id', taskId);
      if (delErr) throw new Error(delErr.message);
      void logErpActivity({
        projectId,
        userId,
        action: 'task_deleted',
        meta: { task_id: taskId, title: subtaskTitle.trim(), from: 'project_task_editor' },
      });
      setSubtaskDeleteConfirmOpen(false);
      if (detailTaskId === taskId) setDetailTaskId(null);
      closeSubtaskModal();
      await refreshTasksOnly();
    } catch (e) {
      setError(e?.message || 'Could not delete task.');
    } finally {
      setSubtaskSaving(false);
    }
  }, [
    editingTaskId,
    projectId,
    userId,
    subtaskTitle,
    detailTaskId,
    closeSubtaskModal,
    refreshTasksOnly,
  ]);

  /** Ensure hidden anchor row exists, then open the add-task dialog (any project member, including clients). */
  const onAddSubtaskFromEmptyState = useCallback(async () => {
    if (!userId || !projectId) return;
    setCreatingRootForSubtask(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/tasks/ensure-project-anchor', {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not prepare tasks for this project');
        return;
      }
      const anchorId = data.anchorId;
      if (!anchorId) return;
      await refreshTasksOnly();
      openSubtaskModal(anchorId);
    } catch (e) {
      setError(e?.message || 'Could not prepare tasks for this project');
    } finally {
      setCreatingRootForSubtask(false);
    }
  }, [userId, projectId, refreshTasksOnly, openSubtaskModal]);

  useEffect(() => {
    if (!subtaskModalParentId) return undefined;
    const onKey = (ev) => {
      if (ev.key !== 'Escape' || subtaskSaving) return;
      ev.preventDefault();
      closeSubtaskModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [subtaskModalParentId, subtaskSaving, closeSubtaskModal]);

  useEffect(() => {
    if (!projectId) return;
    try {
      const unified = sessionStorage.getItem(`erpTaskPanelView:${projectId}`);
      if (unified === 'kanban' || unified === 'list' || unified === 'timeline') {
        setTaskPanelView(unified);
        return;
      }
      const v = sessionStorage.getItem(`erpSubtaskView:${projectId}`);
      if (v === 'list' || v === 'kanban') setTaskPanelView(v);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    if (!chatExpanded) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setChatExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [chatExpanded]);

  const setTaskPanelViewPersist = useCallback(
    (view) => {
      setTaskPanelView(view);
      try {
        if (!projectId) return;
        sessionStorage.setItem(`erpTaskPanelView:${projectId}`, view);
        if (view === 'kanban' || view === 'list') {
          sessionStorage.setItem(`erpSubtaskView:${projectId}`, view);
        }
      } catch {
        /* ignore */
      }
    },
    [projectId],
  );

  const closeEditProjectModal = useCallback(() => {
    setEditProjectOpen(false);
    setEditProjectPendingBriefFiles([]);
  }, []);

  useEffect(() => {
    if (!editProjectOpen) return;
    let cancelled = false;
    supabase
      .from('erp_project_type_options')
      .select('id, label')
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          setEditProjectTypeOptions(ERP_PROJECT_TYPES);
          return;
        }
        const mapped = data
          .filter((r) => r?.id && r?.label)
          .map((r) => ({ id: String(r.id), label: String(r.label) }));
        setEditProjectTypeOptions(mapped.length ? mapped : ERP_PROJECT_TYPES);
      })
      .catch(() => {
        if (!cancelled) setEditProjectTypeOptions(ERP_PROJECT_TYPES);
      });
    return () => {
      cancelled = true;
    };
  }, [editProjectOpen]);

  function onSubtaskFilesChosen(e) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (!list.length) return;
    setSubtaskFiles((prev) => [...prev, ...list]);
    e.target.value = '';
  }

  async function createSubtask(e) {
    if (e?.preventDefault) e.preventDefault();
    const parentId = subtaskModalParentId;
    if (!userId || !parentId || !subtaskTitle.trim()) return;
    setSubtaskSaving(true);
    setError('');
    try {
      const dueRaw = subtaskDue.trim();
      const due_date_preview = dueRaw || null;
      if (due_date_preview && !isTaskDueDateNotInPast(due_date_preview)) {
        setError('Due date cannot be in the past.');
        return;
      }
      const uploaded = [];
      for (const file of subtaskFiles) {
        const fd = new FormData();
        fd.append('projectId', projectId);
        fd.append('scope', 'subtask');
        fd.append('file', file, file.name);
        const upRes = await erpAuthorizedFetch('/api/erp/uploads/task-attachment', {
          method: 'POST',
          body: fd,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upData?.ok || !upData?.path) {
          setError(upData?.error || `Upload failed for "${file.name}"`);
          return;
        }
        uploaded.push({
          path: upData.path,
          name: upData.name || file.name,
          mime: upData.mime || file.type || 'application/octet-stream',
        });
      }
      const descTrim = subtaskDescription.trim();
      const due_date = subtaskDue.trim() || null;
      const assignee_ids =
        Array.isArray(subtaskAssigneeIds) && subtaskAssigneeIds.length
          ? [...new Set(subtaskAssigneeIds.filter(Boolean))]
          : [];
      const assignee_id = assignee_ids.length ? assignee_ids[0] : null;

      if (editingTaskId) {
        const prevAssignees = editingTaskPreviousAssigneeIdsRef.current || [];
        const uniquePrev = [...new Set((Array.isArray(prevAssignees) ? prevAssignees : []).filter(Boolean))];
        const uniqueNext = assignee_ids;
        const newlyAssigned = uniqueNext.filter((id) => !uniquePrev.includes(id));

        const attachments = uploaded.length ? uploaded : undefined;
        const updatePayload = {
          title: subtaskTitle.trim(),
          description: descTrim || null,
          assignee_id,
          assignee_ids,
          due_date,
          updated_at: new Date().toISOString(),
          ...(isWorkspaceAdmin ? { priority: normalizeTaskPriority(subtaskPriority) } : {}),
          ...(attachments ? { attachments } : {}),
        };

        const { error: updErr } = await supabase.from('erp_tasks').update(updatePayload).eq('id', editingTaskId);
        if (updErr) {
          setError(updErr.message);
          return;
        }
        closeSubtaskModal();
        await refreshTasksOnly();
        await supabase.from('erp_activity_log').insert({
          project_id: projectId,
          user_id: userId,
          action: 'task_updated',
          meta: { task_id: editingTaskId, parent_task_id: parentId, from: 'project_workspace' },
        });
        if (newlyAssigned.length) {
          erpAuthorizedFetch('/api/erp/notify-task-assignment', {
            method: 'POST',
            body: JSON.stringify({ taskId: editingTaskId, assigneeIds: newlyAssigned, previousAssigneeId: null }),
          }).catch(() => {});
        }
        return;
      }

      const { data: inserted, error: insErr } = await supabase
        .from('erp_tasks')
        .insert({
          project_id: projectId,
          parent_task_id: parentId,
          title: subtaskTitle.trim(),
          description: descTrim || null,
          status: 'open',
          created_by: userId,
          assignee_id,
          assignee_ids,
          due_date,
          tagged_user_ids: [],
          attachments: uploaded,
          ...(isWorkspaceAdmin ? { priority: normalizeTaskPriority(subtaskPriority) } : {}),
        })
        .select('id')
        .maybeSingle();
      if (insErr) {
        setError(insErr.message);
        return;
      }
      closeSubtaskModal();
      await refreshTasksOnly();
      await supabase.from('erp_activity_log').insert({
        project_id: projectId,
        user_id: userId,
        action: 'task_created',
        meta: { title: subtaskTitle.trim(), parent_task_id: parentId, from: 'project_workspace' },
      });
      if (inserted?.id && assignee_ids.length) {
        // Notify any newly assigned member(s) (best-effort).
        erpAuthorizedFetch('/api/erp/notify-task-assignment', {
          method: 'POST',
          body: JSON.stringify({ taskId: inserted.id, assigneeIds: assignee_ids, previousAssigneeId: null }),
        }).catch(() => {});
      }
    } finally {
      setSubtaskSaving(false);
    }
  }

  if (loading && !project) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-11 h-11 border-2 border-[#103D4D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  function renderProjectChatFullPanel(chatOpts = {}) {
    const { variant = 'inline', onExpand, onCollapse } = chatOpts;
    const expandedLayout = variant === 'expanded';
    const expandedChatShellClass =
      'flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden rounded-none border-0 bg-white shadow-none ring-0 ' +
      'backdrop-blur-md dark:bg-gradient-to-b dark:from-slate-950 dark:to-[#040a0c] ' +
      'sm:rounded-2xl sm:border sm:border-cyan-200/40 sm:shadow-[0_16px_48px_-14px_rgba(16,61,77,0.2),0_4px_20px_-8px_rgba(15,23,42,0.08)] sm:ring-1 sm:ring-white/70 ' +
      'dark:sm:bg-gradient-to-br dark:sm:from-slate-900/94 dark:sm:via-[#0d2228]/97 dark:sm:to-[#061014] dark:sm:border-teal-900/45 dark:sm:shadow-[0_20px_56px_-14px_rgba(0,0,0,0.5)] dark:sm:ring-teal-900/40';
    const panelShellClass = expandedLayout
      ? expandedChatShellClass
      : `${PROJECT_CHAT_PANEL_CLASS} ${workspacePanel}`;
    const galleryItems =
      galleryTab === 'media'
        ? galleryMediaItems
        : galleryTab === 'links'
          ? galleryLinkItems
          : galleryFileItems;
    return (
      <section
        aria-label="Project chat"
        className={`${panelShellClass} max-lg:[&_.chat-md]:!text-[11px] max-lg:[&_.chat-md]:leading-snug`}
      >
        <div className="shrink-0 border-b border-fuchsia-200/50 px-3 py-2.5 max-lg:px-2.5 max-lg:py-2 flex flex-row items-center justify-between gap-2 bg-gradient-to-r from-violet-50/95 via-white to-cyan-50/85 dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2834] dark:via-[#0c2128] dark:to-[#061820] min-w-0">
          <div className="min-w-0 flex-1 flex items-center gap-2 max-lg:gap-1.5">
            <span
              className="flex h-9 w-9 max-lg:h-8 max-lg:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-base max-lg:text-sm shadow-md ring-2 ring-white/80 dark:from-teal-600 dark:to-cyan-700 dark:ring-teal-900/60"
              aria-hidden
            >
              💬
            </span>
            <span className="text-[10px] max-lg:text-[9px] font-bold uppercase tracking-widest text-violet-700/90 dark:text-teal-200/95">
              Messages
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {canRemoveProjectMembers ? (
              <button
                type="button"
                onClick={() => {
                  setClearChatTyped('');
                  setClearChatErr('');
                  setClearChatOpen(true);
                }}
                className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 max-lg:px-2 max-lg:py-1 text-[10px] max-lg:text-[9px] font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/75"
                title="Delete all messages in this channel"
              >
                Clear chat
              </button>
            ) : null}
            {onExpand && !expandedLayout ? (
              <button
                type="button"
                onClick={onExpand}
                className="rounded-lg border border-violet-300/80 bg-white/90 px-2.5 py-1.5 max-lg:px-2 max-lg:py-1 text-[10px] max-lg:text-[9px] font-bold uppercase tracking-wide text-violet-800 shadow-sm hover:bg-violet-50 dark:border-teal-700/50 dark:bg-slate-800/90 dark:text-teal-100 dark:hover:bg-slate-800"
              >
                Expand
              </button>
            ) : null}
            {onCollapse ? (
              <button
                type="button"
                onClick={onCollapse}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 max-lg:px-2 max-lg:py-1 text-[10px] max-lg:text-[9px] font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
        {newChannelOpen
          ? createPortal(
              <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-[2px]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-new-channel-title"
              >
                <form
                  onSubmit={handleCreateChannel}
                  className={`w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl dark:border-teal-900/50 dark:bg-gradient-to-b dark:from-[#0f1a22] dark:to-[#060a0e] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]`}
                >
                  <h3 id="erp-new-channel-title" className="text-lg font-bold text-[#103D4D] dark:text-teal-200">
                    New channel
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Side channels don’t notify everyone — only people you @mention (email & in-app, per your account
                    settings).
                  </p>
                  <label htmlFor="erp-new-channel-name" className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Channel name
                  </label>
                  <input
                    id="erp-new-channel-name"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Design review"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/20 dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50 dark:focus:ring-teal-900/30"
                    autoFocus
                  />
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setNewChannelOpen(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={newChannelSaving || !newChannelName.trim()}
                      className="rounded-xl erp-brand-fill px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                      {newChannelSaving ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>,
              document.body,
            )
          : null}
        {deleteChannelTarget
          ? createPortal(
              <div
                className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-[2px]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-delete-channel-title"
              >
                <div
                  className={`w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl dark:border-rose-900/40 dark:bg-gradient-to-b dark:from-[#1a1214] dark:to-[#080608] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)]`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">Danger zone</p>
                  <h3 id="erp-delete-channel-title" className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                    Delete “#{deleteChannelTarget.name}”
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Messages posted in this channel will be removed from the channel list. This cannot be undone.
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteChannelTarget(null)}
                      disabled={channelBusyId === deleteChannelTarget.id}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmDeleteChannel()}
                      disabled={channelBusyId === deleteChannelTarget.id}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                    >
                      {channelBusyId === deleteChannelTarget.id ? 'Deleting…' : 'Delete channel'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
        {attachmentGallery.length > 0 && (
          <div className="border-b border-slate-200/80 bg-slate-50/90 px-4 py-3 max-lg:px-3 max-lg:py-2 shrink-0 dark:border-teal-900/40 dark:bg-gradient-to-r dark:from-slate-900/85 dark:to-[#0a1620]/90">
            <button
              type="button"
              onClick={() => setGalleryOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left rounded-xl px-1 py-0.5 hover:bg-white/60 transition-colors dark:hover:bg-white/5"
            >
              <span className="text-xs max-lg:text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Chat attachments ({attachmentGallery.length + galleryLinkItems.length})
                {!galleryOpen && (
                  <span className="ml-1.5 font-medium normal-case text-slate-500">
                    · {galleryMediaItems.length} media, {galleryFileItems.length} files, {galleryLinkItems.length} links
                  </span>
                )}
              </span>
              <span className="text-slate-500 text-xs tabular-nums shrink-0 dark:text-slate-400">
                {galleryOpen ? 'Hide attachments' : 'Show attachments'}
              </span>
            </button>
            {galleryOpen && (
              <>
                <div className="mt-2 inline-flex w-fit max-w-full gap-1 rounded-xl bg-slate-200/50 p-1 dark:bg-slate-950/60">
                  <button
                    type="button"
                    onClick={() => setGalleryTab('media')}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                      galleryTab === 'media'
                        ? 'bg-white text-[#103D4D] shadow-sm dark:bg-teal-900/80 dark:text-teal-100 dark:shadow-black/30'
                        : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-teal-200'
                    }`}
                  >
                    Media ({galleryMediaItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryTab('files')}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                      galleryTab === 'files'
                        ? 'bg-white text-[#103D4D] shadow-sm dark:bg-teal-900/80 dark:text-teal-100 dark:shadow-black/30'
                        : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-teal-200'
                    }`}
                  >
                    Files ({galleryFileItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryTab('links')}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                      galleryTab === 'links'
                        ? 'bg-white text-[#103D4D] shadow-sm dark:bg-teal-900/80 dark:text-teal-100 dark:shadow-black/30'
                        : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-teal-200'
                    }`}
                  >
                    Links ({galleryLinkItems.length})
                  </button>
                </div>
                <div
                  className={`mt-3 max-h-52 overflow-y-auto pr-1 [scrollbar-width:thin] ${
                    galleryTab === 'links' ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-2'
                  }`}
                >
                  {galleryItems.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 px-1 w-full text-center dark:text-slate-400">
                      {galleryTab === 'media'
                        ? 'No photos or videos in chat yet.'
                        : galleryTab === 'links'
                          ? 'No links shared in chat yet.'
                          : 'No documents or other files in chat yet.'}
                    </p>
                  ) : galleryTab === 'links' ? (
                    galleryItems.map((l) => (
                      <a
                        key={`${l.messageId}-${l.url}`}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => scrollToMessage?.(l.messageId)}
                        className="group flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 shadow-sm hover:border-sky-300 hover:bg-sky-50/60 transition-colors min-w-0 dark:border-teal-900/45 dark:bg-[#0e1822] dark:hover:border-teal-700/50 dark:hover:bg-[#0f2030]/90"
                        title={`${l.senderLabel} · ${new Date(l.created_at).toLocaleString()}\n${l.url}`}
                      >
                        <span className="text-base shrink-0" aria-hidden>
                          🔗
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[11px] font-semibold text-[#103D4D] group-hover:text-sky-700">
                            {l.host}
                          </span>
                          <span className="truncate text-[10px] text-slate-500">{l.url}</span>
                        </span>
                        <span className="shrink-0 text-[9px] text-slate-400">{l.senderLabel}</span>
                      </a>
                    ))
                  ) : (
                    galleryItems.map((a) => (
                      <div
                        key={`${a.messageId}-${a.path}`}
                        className="rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-sm w-[104px] shrink-0 dark:border-teal-900/45 dark:bg-[#0e1822]"
                      >
                        <div className="max-h-[5.5rem] overflow-hidden rounded-lg bg-slate-50/80 flex items-center justify-center dark:bg-slate-950/70">
                          {galleryTab === 'media' ? (
                            a.mime?.startsWith('video/') ? (
                              <button
                                type="button"
                                onClick={() => openFilePreview(a)}
                                className="flex flex-col items-center justify-center gap-0.5 p-2 text-center min-h-[4.5rem] w-full hover:bg-sky-50/80 rounded-lg dark:hover:bg-teal-950/50"
                              >
                                <span className="text-xl" aria-hidden>
                                  ▶
                                </span>
                                <span className="text-[10px] font-semibold text-[#103D4D] leading-tight line-clamp-2 dark:text-teal-200">{a.name}</span>
                              </button>
                            ) : (
                              <MessageImage path={a.path} name={a.name} onClick={() => openFilePreview(a)} />
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => openFilePreview(a)}
                              className="flex flex-col items-center justify-center gap-0.5 p-2 text-center min-h-[4.5rem] w-full hover:bg-sky-50/80 rounded-lg dark:hover:bg-teal-950/50"
                            >
                              <span className="text-xl" aria-hidden>
                                📎
                              </span>
                              <span className="text-[10px] font-semibold text-[#103D4D] leading-tight line-clamp-2 dark:text-teal-200">{a.name}</span>
                            </button>
                          )}
                        </div>
                        <p
                          className="text-[9px] text-slate-500 mt-1 truncate px-0.5 dark:text-slate-500"
                          title={`${a.senderLabel} · ${new Date(a.created_at).toLocaleString()}`}
                        >
                          {a.senderLabel}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <div className="flex flex-1 min-h-0 min-w-0 flex-col">
          <ErpProjectChatMessageList
            ref={chatMessagesScrollRef}
            messages={messages}
            messageById={messageById}
            nameMap={nameMap}
            reactionsByMessageId={reactionsByMessageId}
            userId={userId}
            avatarProfileFor={avatarProfileFor}
            chatGlobalModerator={profile?.role === 'admin'}
            reactionPickerFor={reactionPickerFor}
            setReactionPickerFor={setReactionPickerFor}
            scrollToMessage={scrollToMessage}
            toggleReaction={toggleReaction}
            startReplyToMessage={startReplyToMessage}
            setChatCtxMenu={setChatCtxMenu}
            downloadFile={downloadFile}
            openFilePreview={openFilePreview}
            editingMessageId={chatEditingMessageId}
            editingDraft={chatEditingDraft}
            onEditingDraftChange={setChatEditingDraft}
            onStartEditMessage={startEditProjectChatMessage}
            onCancelEditMessage={cancelProjectChatEdit}
            onSaveEditMessage={() => void saveProjectChatEdit()}
            editMessageBusy={chatEditBusy}
          />
        </div>
        <form
          onSubmit={sendMessage}
          onDrop={onChatDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={onChatPaste}
          className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-2 sm:px-4 sm:pb-3 dark:border-teal-900/45 dark:bg-[#070b11] dark:[background-image:none]"
        >
          <input
            id="erp-project-chat-file"
            ref={chatFileInputRef}
            type="file"
            className="sr-only"
            multiple
            accept={PROJECT_CHAT_FILE_ACCEPT}
            onChange={onChatFilesChosen}
          />
          <div className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.18)] backdrop-blur-sm space-y-3 p-3 max-lg:space-y-2 max-lg:p-2.5 sm:p-3.5 dark:border-teal-900/45 dark:bg-[#101a22] dark:shadow-[0_12px_36px_-20px_rgba(0,0,0,0.55)] dark:[background-image:none] dark:backdrop-blur-none">
            {replyTarget && (
              <div className="flex items-start justify-between gap-2 rounded-2xl border border-[#103D4D]/20 bg-[#E0F7FA]/60 px-3 py-2.5 dark:border-teal-800/50 dark:bg-teal-950/40 dark:backdrop-blur-sm">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#0d3442]/80 dark:text-teal-300/95">Replying to {replyTarget.label}</p>
                  <p className="mt-0.5 text-xs text-slate-700 line-clamp-2 dark:text-slate-300">{replyTarget.snippet}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:hover:bg-white/10 dark:text-slate-400 dark:hover:text-slate-200"
                  aria-label="Cancel reply"
                >
                  ×
                </button>
              </div>
            )}
            {pendingFiles.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {pendingFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-200 dark:shadow-black/30"
                  >
                    <span className="truncate max-w-[180px]">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingAt(i)}
                      className="rounded-lg px-1 py-0.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-start gap-3">
              <label
                htmlFor="erp-project-chat-file"
                className={`flex h-11 w-11 max-lg:h-10 max-lg:w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[#103D4D]/40 hover:text-[#103D4D] dark:border-teal-900/55 dark:bg-slate-800/90 dark:text-teal-200/85 dark:hover:border-teal-500/50 dark:hover:text-teal-100 ${sending ? 'pointer-events-none opacity-45' : ''}`}
                title="Attach files or images"
              >
                <span className="sr-only">Attach files or images</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m18.375 12.739-8.284 8.284a4.5 4.5 0 1 1-6.364-6.364l8.284-8.284m0 0 3.932 3.932M18.375 12.739 14.307 11.17m0 0 3.328-3.328a4.5 4.5 0 0 0-6.364-6.364l-5.656 5.656a4.5 4.5 0 0 0 6.364 6.364l1.89-1.89"
                  />
                </svg>
              </label>

              <div
                className="relative min-w-0 flex-1"
                role="combobox"
                aria-expanded={mentionOpen}
                aria-haspopup="listbox"
                aria-controls="erp-mention-listbox"
              >
                <ErpMarkdownWysComposer
                  key={`${chatDraftStorageKey}-${chatComposerBump}`}
                  ref={chatInputRef}
                  resetKey={`${chatDraftStorageKey}-${chatComposerBump}`}
                  initialMarkdown={body}
                  onMarkdownChange={setBody}
                  onComposerInput={syncMentionFromEditor}
                  onKeyDown={onComposerKeyDown}
                  onPaste={onChatPaste}
                  disabled={sending}
                  placeholder="Write a message…"
                  className="w-full [&_.erp-md-wys]:min-h-[2.75rem] [&_.erp-md-wys]:max-lg:min-h-[2.5rem] [&_.erp-md-wys]:max-h-36 [&_.erp-md-wys]:resize-y [&_.erp-md-wys]:rounded-xl [&_.erp-md-wys]:border-slate-200 [&_.erp-md-wys]:bg-white [&_.erp-md-wys]:px-3 [&_.erp-md-wys]:py-2 [&_.erp-md-wys]:max-lg:px-2.5 [&_.erp-md-wys]:max-lg:py-1.5 [&_.erp-md-wys]:text-xs [&_.erp-md-wys]:max-lg:text-[11px] [&_.erp-md-wys]:shadow-sm [&_.erp-md-wys]:focus:border-[#103D4D]/50 [&_.erp-md-wys]:focus:ring-[#103D4D]/10 dark:[&_.erp-md-wys]:border-teal-800/50 dark:[&_.erp-md-wys]:bg-[#121a22] dark:[&_.erp-md-wys]:text-slate-200 dark:[&_.erp-md-wys]:placeholder:text-slate-500 dark:[&_.erp-md-wys]:focus:border-teal-500/40 dark:[&_.erp-md-wys]:focus:ring-teal-500/20"
                />
                {mentionOpen && (
                  <div
                    ref={mentionPickerRef}
                    id="erp-mention-listbox"
                    role="listbox"
                    className="absolute left-0 right-0 bottom-full z-30 mb-1 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl [scrollbar-width:thin] dark:border-teal-900/50 dark:bg-[#101a22] dark:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)]"
                  >
                    {mentionCandidates.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">No matching project members.</p>
                    ) : (
                      mentionCandidates.map((m, idx) => {
                        const label = nameMap[m.user_id] || m.user_id.slice(0, 8);
                        return (
                          <button
                            key={m.user_id}
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
                              pickMention(m);
                            }}
                          >
                            <ErpAvatarWithOnline
                              presenceUserId={m.user_id}
                              lastActiveAt={lastActiveByUserId[m.user_id]}
                              forceOnline={m.user_id === userId}
                              size="sm"
                            >
                              <ErpUserAvatar profile={avatarProfileFor(m.user_id)} size="sm" alt="" className="h-7 w-7 text-[10px] shadow-none ring-1 ring-slate-200/80" />
                            </ErpAvatarWithOnline>
                            <span className="min-w-0 truncate font-medium">{label}</span>
                            <span className="ml-auto max-w-[48%] shrink-0 text-right text-[9px] font-semibold leading-tight text-slate-600">
                              {memberDelegationLabel(m)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={sending || (!body.trim() && pendingFiles.length === 0)}
                className="h-9 max-lg:h-8 rounded-xl erp-brand-fill px-5 max-lg:px-3 text-xs max-lg:text-[11px] font-semibold text-white shadow-md disabled:opacity-50 transition-colors shrink-0"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>

            <div
              ref={toolbarRef}
              className="relative flex flex-wrap items-center gap-1 gap-x-1.5 max-lg:gap-x-0.5 gap-y-2 max-lg:gap-y-1 border-t border-slate-100/90 pt-2.5 max-lg:pt-2 px-1 dark:border-teal-900/35"
            >
              <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 max-lg:hidden dark:text-slate-500">
                Format
              </span>
              <button
                type="button"
                disabled={sending}
                onClick={() => applyMarkdownWrap('**', '**', 'bold')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 max-lg:px-1.5 text-xs max-lg:text-[10px] font-bold text-slate-800 shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                title="Bold (**text**)"
                aria-label="Bold"
              >
                B
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => applyMarkdownWrap('*', '*', 'italic')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 max-lg:px-1.5 text-xs max-lg:text-[10px] italic text-slate-800 shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                title="Italic (*text*)"
                aria-label="Italic"
              >
                I
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => applyMarkdownWrap('~~', '~~', 'strikethrough')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 max-lg:px-1.5 text-xs max-lg:text-[10px] text-slate-600 line-through shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                title="Strikethrough (~~text~~)"
                aria-label="Strikethrough"
              >
                S
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => applyMarkdownWrap('`', '`', 'code')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 max-lg:px-1.5 font-mono text-[11px] max-lg:text-[10px] text-slate-800 shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                title="Inline code (`code`)"
                aria-label="Inline code"
              >
                {'</>'}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => applyMarkdownWrap('[', '](https://)', 'link')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-1.5 max-lg:px-1 text-xs max-lg:text-[10px] font-semibold text-[#103D4D] shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-teal-700/50 dark:bg-slate-800/90 dark:text-teal-200 dark:hover:bg-slate-800 dark:hover:border-teal-500/50"
                title="Link ([text](url))"
                aria-label="Insert link"
              >
                🔗
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => insertLinePrefix('> ')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 max-lg:px-1.5 text-xs max-lg:text-[10px] text-slate-600 shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                title="Quote line"
                aria-label="Quote"
              >
                &gt;
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => insertLinePrefix('- ')}
                className="inline-flex h-8 max-lg:h-7 min-w-[2rem] max-lg:min-w-[1.625rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-2 max-lg:px-1.5 text-xs max-lg:text-[10px] text-slate-700 shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                title="Bullet list"
                aria-label="Bullet list"
              >
                •
              </button>
              <span className="hidden sm:inline-block h-6 w-px shrink-0 self-center bg-slate-200/90 mx-0.5 dark:bg-teal-900/55" aria-hidden />
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={`chat-h${lvl}`}
                  type="button"
                  disabled={sending}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chatInputRef.current?.applyHeading?.(lvl)}
                  className="inline-flex h-8 max-lg:h-7 min-w-[1.75rem] max-lg:min-w-[1.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-1 max-lg:px-0.5 text-[10px] max-lg:text-[9px] font-bold text-slate-800 shadow-sm hover:bg-slate-50 hover:border-[#103D4D]/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-teal-100 dark:hover:bg-slate-800 dark:hover:border-teal-600/40"
                  title={`Heading ${lvl}`}
                  aria-label={`Heading ${lvl}`}
                >
                  H{lvl}
                </button>
              ))}
              <span className="hidden sm:inline-block h-6 w-px shrink-0 self-center bg-slate-200/90 mx-0.5 dark:bg-teal-900/55" aria-hidden />
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 max-lg:px-2 max-lg:py-1 text-xs max-lg:text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Emoji"
                aria-label="Emoji"
              >
                🙂
              </button>
              <button
                type="button"
                onClick={() => insertIntoComposer('@')}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 max-lg:px-2 max-lg:py-1 text-xs max-lg:text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Mention"
                aria-label="Mention"
              >
                @
              </button>
              {showEmoji && (
                <div className="absolute left-0 bottom-10 z-10 w-[240px] rounded-2xl border border-slate-200 bg-white shadow-xl p-2 dark:border-teal-900/50 dark:bg-[#121a24] dark:shadow-black/60">
                  <p className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Emoji</p>
                  <div className="grid grid-cols-8 gap-1.5 px-1 pb-1">
                    {CHAT_EMOJI_PICKER.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className="h-8 w-8 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/90 dark:hover:bg-slate-800"
                        onClick={() => {
                          insertIntoComposer(e);
                          setShowEmoji(false);
                        }}
                        aria-label={`Insert ${e}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      </section>
    );
  }

  const rollupPri = tasks.length > 0 ? rollupPriorityFromTasks(workTasks.length ? workTasks : tasks) : 'medium';
  const hoursLogged = Math.floor(totalTimeLogged / 3600);
  const minsLogged = Math.floor((totalTimeLogged % 3600) / 60);
  const timeLoggedLabel = totalTimeLogged >= 3600 ? `${hoursLogged}h` : totalTimeLogged >= 60 ? `${minsLogged}m` : `${totalTimeLogged}s`;

  async function handleDeleteProject() {
    if (!project?.name || !canDeleteProject) return;
    setDeleteProjectTyped('');
    setDeleteProjectErr('');
    setDeleteProjectConfirmOpen(true);
  }

  async function handleToggleProjectCompletion() {
    if (!projectId || !canEditProjectDetails || projectCompletionBusy) return;
    const nextColumn = isProjectCompleted ? 'todo' : 'completed';
    setProjectCompletionBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_set_project_board_column', {
        p_project_id: projectId,
        p_column: nextColumn,
      });
      if (rpcErr) throw new Error(rpcErr.message || 'Could not update project status');
      setProject((prev) => (prev ? { ...prev, board_column: nextColumn } : prev));
    } catch (e) {
      setError(e?.message || 'Could not update project status');
    } finally {
      setProjectCompletionBusy(false);
    }
  }

  async function confirmDeleteProjectFromWorkspace() {
    if (!project?.name || !canDeleteProject || projectDeleting) return;
    if (String(deleteProjectTyped || '').trim().toUpperCase() !== 'DELETE') {
      setDeleteProjectErr('Type DELETE to confirm.');
      return;
    }
    setProjectDeleting(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${projectId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete project');
      router.push('/erp/projects');
    } catch (e) {
      setError(e?.message || 'Could not delete project');
    } finally {
      setProjectDeleting(false);
      setDeleteProjectConfirmOpen(false);
    }
  }

  async function executeRemoveMember() {
    const targetUserId = confirmRemoveMemberId;
    if (!canRemoveProjectMembers || !targetUserId || targetUserId === userId) return;
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${projectId}/members/${targetUserId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove member');
      setConfirmRemoveMemberId(null);
      await reloadProjectMembers();
    } catch (e) {
      setError(e?.message || 'Could not remove member');
    }
  }

  function onEditProjectBriefFilesChosen(e) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!list.length || !userId) return;
    const tooBig = list.filter((f) => f.size > PROJECT_BRIEF_MAX_FILE_BYTES);
    if (tooBig.length > 0) {
      setError(
        `Each brief file must be ${Math.round(PROJECT_BRIEF_MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
      );
    }
    const ok = list.filter((f) => f.size <= PROJECT_BRIEF_MAX_FILE_BYTES);
    if (!ok.length) return;
    setEditProjectPendingBriefFiles((prev) => {
      const room = Math.max(0, PROJECT_BRIEF_ATTACH_MAX - editProjectDraftAttachments.length - prev.length);
      if (room <= 0) return prev;
      return [...prev, ...ok.slice(0, room)];
    });
  }

  async function saveProjectDetails(e) {
    e?.preventDefault?.();
    if (!canEditProjectDetails) return;
    const name = editProjectName.trim();
    const description = editProjectDesc;
    const start_date = editProjectStartDate.trim() || null;
    const deadline_date = editProjectDueDate.trim() || null;
    if (!name) {
      setError('Project name is required.');
      return;
    }
    const beforeMeta = normalizeAttachments(project?.description_attachments);
    const beforePaths = new Set(beforeMeta.map((a) => a.path).filter(Boolean));

    if (editProjectDraftAttachments.length + editProjectPendingBriefFiles.length > PROJECT_BRIEF_ATTACH_MAX) {
      setError(`You can attach at most ${PROJECT_BRIEF_ATTACH_MAX} brief files.`);
      return;
    }

    setEditProjectBusy(true);
    setError('');
    const uploadedMeta = [];
    try {
      for (const file of editProjectPendingBriefFiles) {
        const fd = new FormData();
        fd.append('projectId', projectId);
        fd.append('scope', 'brief');
        fd.append('file', file, file.name);
        const upRes = await erpAuthorizedFetch('/api/erp/uploads/task-attachment', {
          method: 'POST',
          body: fd,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upData?.ok || !upData?.path) {
          throw new Error(upData?.error || `Upload failed for "${file.name}"`);
        }
        uploadedMeta.push({
          path: upData.path,
          name: upData.name || file.name,
          mime: upData.mime || file.type || 'application/octet-stream',
        });
      }

      const descriptionAttachments = [...editProjectDraftAttachments, ...uploadedMeta];
      if (descriptionAttachments.length > PROJECT_BRIEF_ATTACH_MAX) {
        throw new Error(`At most ${PROJECT_BRIEF_ATTACH_MAX} brief attachments.`);
      }

      const res = await erpAuthorizedFetch(`/api/erp/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          description,
          start_date,
          deadline_date,
          projectTypeIds:
            Array.isArray(editProjectTypeIds) && editProjectTypeIds.length ? editProjectTypeIds : ['custom'],
          description_attachments: descriptionAttachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update project');
      if (data?.project) {
        setProject(data.project);
        setEditProjectName(data.project?.name ? String(data.project.name) : name);
        setEditProjectDesc(data.project?.description ? String(data.project.description) : description);
        setEditProjectStartDate(data.project?.start_date ? String(data.project.start_date) : start_date || '');
        setEditProjectDueDate(data.project?.deadline_date ? String(data.project.deadline_date) : deadline_date || '');
        setEditProjectTypeIds(projectTypeIdsFromRow(data.project));
        setEditProjectDraftAttachments(normalizeAttachments(data.project.description_attachments));
      }
      const afterPaths = new Set(descriptionAttachments.map((a) => a.path).filter(Boolean));
      const stalePaths = [...beforePaths].filter((p) => !afterPaths.has(p));
      if (stalePaths.length > 0) {
        try {
          const disposeItems = stalePaths.map((path) => {
            const meta = beforeMeta.find((a) => a?.path === path);
            return {
              path,
              display_name: meta?.name || path.split('/').pop(),
              mime: meta?.mime || null,
              source_kind: 'project_brief_attachment',
              source_meta: { project_id: projectId },
            };
          });
          await erpAuthorizedFetch('/api/erp/trash/dispose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: disposeItems }),
          });
        } catch {
          /* best-effort */
        }
      }
      closeEditProjectModal();
    } catch (e2) {
      if (uploadedMeta.length > 0) {
        void supabase.storage
          .from('erp-files')
          .remove(uploadedMeta.map((m) => m.path))
          .catch(() => {});
      }
      setError(e2?.message || 'Could not update project');
    } finally {
      setEditProjectBusy(false);
    }
  }

  async function executeDeleteChatMessage() {
    const messageId = confirmDeleteMessageId;
    if (!messageId) return;
    const target = messages.find((m) => m.id === messageId);
    const ownMessage = Boolean(userId && target?.user_id === userId);
    const superModerator = profile?.role === 'admin';
    if (!ownMessage && !superModerator) return;
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${projectId}/messages/${messageId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete message');
      setConfirmDeleteMessageId(null);
      if (data.message?.id) {
        setMessages((prev) => mergeMessages(prev, [data.message]));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      setReactionsByMessageId((prev) => {
        if (!prev[messageId]) return prev;
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      setChatEditingMessageId((cur) => {
        if (cur === messageId) {
          setChatEditingDraft('');
          return null;
        }
        return cur;
      });
    } catch (e3) {
      setError(e3?.message || 'Could not delete message');
    }
  }

  function startEditProjectChatMessage(m) {
    if (!m?.id || m.user_id !== userId) return;
    if (!canEditChatMessageByAge(m.created_at)) return;
    setChatEditingDraft(m.body ?? '');
    setChatEditingMessageId(m.id);
  }

  function cancelProjectChatEdit() {
    setChatEditingMessageId(null);
    setChatEditingDraft('');
  }

  async function saveProjectChatEdit() {
    if (!chatEditingMessageId || !projectId || chatEditBusy) return;
    setChatEditBusy(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${projectId}/messages/${chatEditingMessageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: chatEditingDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save edit');
      if (data.message?.id) {
        setMessages((prev) => mergeMessages(prev, [data.message]));
      }
      setChatEditingMessageId(null);
      setChatEditingDraft('');
    } catch (e3) {
      setError(e3?.message || 'Could not save edit');
    } finally {
      setChatEditBusy(false);
    }
  }

  async function clearProjectChat() {
    if (!canRemoveProjectMembers || clearChatBusy) return;
    if (String(clearChatTyped || '').trim().toUpperCase() !== 'DELETE') {
      setClearChatErr('Type DELETE to confirm.');
      return;
    }
    setClearChatBusy(true);
    setClearChatErr('');
    setError('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${projectId}/messages/clear`, {
        method: 'POST',
        body: JSON.stringify({ channelId: activeChannelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not clear chat');
      setMessages([]);
      setReplyTarget(null);
      setPendingFiles([]);
      setBody('');
      try {
        chatInputRef.current?.replaceMarkdown?.('');
      } catch {}
      setClearChatOpen(false);
    } catch (e) {
      setClearChatErr(e?.message || 'Could not clear chat');
    } finally {
      setClearChatBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-6 text-[12px] leading-snug text-slate-800 dark:text-slate-200">
      <div className={`relative overflow-hidden ${workspacePanel} p-3 sm:p-4`}>
        <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-[#103D4D]/18 blur-3xl dark:bg-teal-500/12" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-[#B2EBF2]/35 blur-3xl dark:bg-cyan-600/10" />
        {userId && profile?.role !== 'client' ? (
          <ErpProjectTimeLogger
            projectId={projectId}
            userId={userId}
            projectName={project?.name}
            timerTaskId={detailTaskId}
            timerTaskTitle={detailTask?.title ?? ''}
            onTotalChange={setTotalTimeLogged}
            compact
            summaryOnly
            historyOpen={projectTimeHistoryOpen}
            onHistoryOpenChange={setProjectTimeHistoryOpen}
          />
        ) : null}
        <div
          className="relative pt-1"
          title={
            isWorkspaceAdmin ? 'Right-click to set priority for all tasks in this project' : undefined
          }
          onContextMenu={
            isWorkspaceAdmin
              ? (e) => {
                  e.preventDefault();
                  setError('');
                  setProjectBulkMenu({
                    x: e.clientX,
                    y: e.clientY,
                    projectId,
                    projectName: project?.name || 'Project',
                    userId,
                  });
                }
              : undefined
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 min-w-0">{project?.name}</h1>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {userId && profile?.role !== 'client' ? (
                <ErpProjectTimeLogger
                  projectId={projectId}
                  userId={userId}
                  projectName={project?.name}
                  timerTaskId={detailTaskId}
                  timerTaskTitle={detailTask?.title ?? ''}
                  onTotalChange={setTotalTimeLogged}
                  compact
                  controlsOnly
                />
              ) : null}
              <button
                type="button"
                disabled={creatingRootForSubtask}
                onClick={() => {
                  if (canonicalRoot?.id) {
                    openSubtaskModal(canonicalRoot.id);
                  } else {
                    void onAddSubtaskFromEmptyState();
                  }
                }}
                className="rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold text-white shadow-md shadow-teal-900/20 disabled:opacity-60"
              >
                {creatingRootForSubtask ? 'Preparing…' : '+ Add Task'}
              </button>
              {(canEditProjectDetails || canDeleteProject) ? (
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800/90 dark:to-slate-900 dark:text-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-950"
                  aria-label="Project actions"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(projectHeaderMenu)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const w = 220;
                    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
                    const top = Math.min(r.bottom + 6, window.innerHeight - 8);
                    setProjectHeaderMenu((prev) => (prev ? null : { left, top }));
                  }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="12" cy="5" r="1.85" />
                    <circle cx="12" cy="12" r="1.85" />
                    <circle cx="12" cy="19" r="1.85" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isProjectCompleted
                  ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80 dark:bg-violet-950/70 dark:text-violet-200 dark:ring-violet-800/50'
                  : 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80 dark:bg-emerald-950/65 dark:text-emerald-200 dark:ring-emerald-800/45'
              }`}
            >
              {isProjectCompleted ? 'Completed' : 'Active'}
            </span>
            {tasks.length > 0 ? <ReadOnlyPriorityPill priority={rollupPri} /> : null}
            {project?.client_name?.trim() ? (
              <span className="text-[11px] font-semibold text-slate-700">{project.client_name.trim()}</span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-[10px] font-medium capitalize text-slate-500">
              <span className={`h-2 w-2 rounded-full ${leadSourceDotClass(project?.lead_source)}`} aria-hidden />
              {leadSourceLabel(project?.lead_source)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 items-stretch gap-2 lg:grid-cols-4">
            <div
              className={`flex flex-col rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-indigo-50/60 p-2.5 shadow-sm ring-1 ring-sky-100/60 ${ERP_DARK_STAT_SKY} ${ERP_DARK_RING_SUBTLE_KPI}`}
            >
              <p className="text-[9px] font-bold uppercase tracking-wider text-sky-700/90 dark:text-sky-200/90">Progress</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums bg-gradient-to-r from-sky-700 to-indigo-800 bg-clip-text text-transparent dark:bg-none dark:text-sky-100">
                {projectTaskMetrics.pct}%
              </p>
              <div className="mt-auto pt-2 h-2 w-full overflow-hidden rounded-full bg-sky-100/80 dark:bg-slate-800/90">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-500 to-[#103D4D]"
                  style={{ width: `${projectTaskMetrics.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] font-medium text-sky-900/70 dark:text-sky-200/70">
                {projectTaskMetrics.done}/{projectTaskMetrics.total} tasks
              </p>
            </div>
            <div
              className={`flex flex-col rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/50 p-2.5 shadow-sm ring-1 ring-amber-100/70 ${ERP_DARK_STAT_AMBER_HOT} ${ERP_DARK_RING_SUBTLE_KPI}`}
            >
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800/90 dark:text-amber-200/90">Tasks</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-950 dark:text-amber-100">{projectTaskMetrics.total}</p>
              <p className="mt-auto pt-1 text-[10px] font-medium text-amber-900/60 dark:text-amber-200/70">{projectTaskMetrics.done} completed</p>
            </div>
            <button
              type="button"
              disabled={!userId || profile?.role === 'client'}
              onClick={() => setProjectTimeHistoryOpen(true)}
              className={`flex min-h-[5.75rem] w-full flex-col rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50/50 p-2.5 text-left shadow-sm ring-1 ring-teal-100/70 outline-none transition ${ERP_DARK_STAT_EMERALD} ${ERP_DARK_RING_SUBTLE_KPI} ${
                !userId || profile?.role === 'client'
                  ? 'cursor-default opacity-95'
                  : 'cursor-pointer hover:border-teal-300/95 hover:ring-teal-200/70 focus-visible:ring-2 focus-visible:ring-[#103D4D]/40 dark:hover:border-teal-700/60 dark:hover:ring-teal-800/55 disabled:opacity-90'
              }`}
              aria-label={
                !userId || profile?.role === 'client'
                  ? 'Time logged'
                  : 'Time logged — open session history'
              }
            >
              <p className="text-[9px] font-bold uppercase tracking-wider text-teal-800/90 dark:text-emerald-200/90">
                Time logged
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-teal-950 dark:text-emerald-100">{timeLoggedLabel}</p>
              <p className="mt-auto pt-1 text-[10px] font-medium text-teal-800/65 dark:text-emerald-200/65">total tracked</p>
              {userId && profile?.role !== 'client' ? (
                <span className="sr-only">Opens session history and task breakdown.</span>
              ) : null}
            </button>
            <div className="flex flex-col rounded-xl border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-fuchsia-50/40 p-2.5 shadow-sm ring-1 ring-rose-100/60 dark:border-rose-900/35 dark:bg-gradient-to-br dark:from-[#1f1018] dark:via-[#140c14] dark:to-[#090608] dark:ring-rose-900/28">
              <div className="grid grid-cols-2 gap-2 h-full">
                <div className="min-w-0 flex flex-col">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-rose-800/85 dark:text-rose-200/90">Start</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-950 leading-tight dark:text-rose-100">
                    {project?.start_date ? formatTaskDueDate(project.start_date) : '—'}
                  </p>
                </div>
                <div className="min-w-0 flex flex-col border-l border-rose-100 pl-2 dark:border-rose-900/40">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-rose-800/85 dark:text-rose-200/90">Deadline</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-rose-950 leading-tight dark:text-rose-100">
                    {project?.deadline_date ? formatTaskDueDate(project.deadline_date) : '—'}
                  </p>
                  {daysLeftDeadline != null ? (
                    <p
                      className={`mt-auto pt-1 text-[10px] font-semibold ${
                        daysLeftDeadline < 0
                          ? 'text-rose-700 dark:text-rose-300'
                          : daysLeftDeadline <= 7
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-emerald-800 dark:text-emerald-300'
                      }`}
                    >
                      {daysLeftDeadline < 0
                        ? `${Math.abs(daysLeftDeadline)}d overdue`
                        : daysLeftDeadline === 0
                          ? 'Due today'
                          : `${daysLeftDeadline} day${daysLeftDeadline === 1 ? '' : 's'} left`}
                    </p>
                  ) : (
                    <p className="mt-auto pt-1 text-[10px] text-slate-500 dark:text-slate-400">No due date</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`mt-3 rounded-xl border border-indigo-200/50 bg-gradient-to-r from-indigo-50/40 via-white to-cyan-50/30 shadow-sm ring-1 ring-indigo-100/40 ${ERP_DARK_SECTION_VIOLET_PANEL} ${ERP_DARK_RING_SUBTLE_KPI}`}
          >
            <button
              type="button"
              onClick={() => setScopeSectionOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left rounded-xl hover:bg-white/50 transition-colors dark:hover:bg-white/5"
            >
              <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-900/85 dark:text-teal-100/90">Project scope &amp; details</span>
              <span className="text-slate-500 tabular-nums dark:text-slate-400">{scopeSectionOpen ? '▼' : '▶'}</span>
            </button>
            {scopeSectionOpen ? (
              <div className="border-t border-slate-200/80 px-3 py-3 space-y-3 dark:border-teal-900/35">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Project details</p>
                    {canEditProjectDetails ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditProjectDraftAttachments(
                            normalizeAttachments(project?.description_attachments).map((a) => ({
                              path: a.path,
                              name: a.name,
                              mime: a.mime || 'application/octet-stream',
                            })),
                          );
                          setEditProjectPendingBriefFiles([]);
                          setEditProjectOpen(true);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {(() => {
                    const raw = project?.description ? String(project.description) : '';
                    const desc = raw.trim();
                    if (!desc) {
                      return <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">No description yet.</p>;
                    }
                    const showToggle = desc.length > 240 || desc.split('\n').length > 6;
                    return (
                      <>
                        <div
                          className={`mt-1 rounded-lg border border-slate-200/60 bg-white/70 p-2 dark:border-teal-900/45 dark:bg-[#0b1218]/80 ${
                            !projectDescExpanded && showToggle ? 'max-h-28 overflow-hidden' : ''
                          }`}
                        >
                          <ChatMessageHtml
                            text={desc}
                            className="text-[11px] text-slate-700 dark:text-slate-300 [&_p]:m-0 [&_p+_p]:mt-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:text-[10px]"
                          />
                        </div>
                        {showToggle ? (
                          <button
                            type="button"
                            onClick={() => setProjectDescExpanded((v) => !v)}
                            className="mt-2 inline-flex items-center justify-center rounded-xl erp-brand-fill px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-teal-700/40 transition hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
                          >
                            {projectDescExpanded ? 'Read less' : 'Read more'}
                          </button>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
                {briefAttachments.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Brief attachments</p>
                    <div className="flex flex-wrap gap-2">
                      {briefAttachments.map((a) => (
                        <div
                          key={a.path}
                          className={`rounded-lg border border-slate-200/90 bg-white p-1.5 text-[10px] ${ERP_DARK_SOLID_CARD}`}
                        >
                          {a.mime?.startsWith('image/') ? (
                            <MessageImage path={a.path} name={a.name} onClick={() => openFilePreview(a)} />
                          ) : (
                            <button
                              type="button"
                              onClick={() => openFilePreview(a)}
                              className="font-medium text-[#103D4D] underline dark:text-teal-300 dark:hover:text-cyan-200"
                            >
                              {a.name}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-700 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5">{error}</p>}

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-12 xl:gap-6 xl:items-start">
        <div className="order-1 min-h-0 min-w-0 flex flex-col gap-5 xl:order-none xl:col-span-8 xl:col-start-1 xl:row-start-1">
          <section aria-labelledby="project-chat-heading" className="space-y-2">
            <div className="flex items-center gap-2 px-0.5">
              <span className="h-6 w-1 rounded-full erp-brand-fill" aria-hidden />
              <h2
                id="project-chat-heading"
                className="erp-brand-text text-[11px] font-extrabold uppercase tracking-[0.14em]"
              >
                Team chat
              </h2>
            </div>
            {!chatExpanded ? renderProjectChatFullPanel({ onExpand: () => setChatExpanded(true) }) : null}
          </section>
        </div>

        <div className="order-3 min-w-0 xl:order-none xl:col-span-12 xl:col-start-1 xl:row-start-2">
          <section aria-labelledby="project-tasks-heading" className="space-y-2 min-w-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-0.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-6 w-1 rounded-full erp-brand-fill" aria-hidden />
                <h2 id="project-tasks-heading" className="erp-brand-text text-[11px] font-extrabold uppercase tracking-[0.14em]">
                  Tasks &amp; board
                </h2>
              </div>
              <div
                className="flex flex-wrap gap-0.5 rounded-xl border border-teal-200/70 bg-gradient-to-r from-teal-50/95 via-white to-cyan-50/90 p-0.5 shadow-inner ring-1 ring-teal-100/60 dark:border-teal-800/60 dark:bg-gradient-to-r dark:from-slate-900/90 dark:via-teal-950/50 dark:to-cyan-950/40 dark:ring-teal-900/40"
                role="tablist"
                aria-label="Task views"
              >
                {[
                  { id: 'kanban', label: 'Kanban' },
                  { id: 'list', label: 'List' },
                  { id: 'timeline', label: 'Timeline' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={taskPanelView === t.id}
                    onClick={() => setTaskPanelViewPersist(t.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      taskPanelView === t.id
                        ? 'erp-brand-fill text-white shadow-md dark:shadow-teal-900/40'
                        : 'text-teal-900/70 hover:text-teal-950 hover:bg-white/80 dark:text-teal-200/85 dark:hover:text-teal-50 dark:hover:bg-teal-950/45'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <div className={`${workspacePanel} overflow-hidden flex flex-col min-h-[min(48vh,680px)]`}>
                {taskPanelView === 'timeline' ? (
                  <div className="p-4 sm:p-5 flex-1 overflow-y-auto min-h-0 bg-gradient-to-b from-amber-50/50 via-white to-teal-50/30 dark:from-amber-950/40 dark:via-slate-900/85 dark:to-teal-950/35">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      Tasks ordered by due date (no-date tasks at the end).
                    </p>
                    {timelineItems.length === 0 ? (
                      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">No tasks in this project yet.</p>
                    ) : (
                      <ul className="mt-4 space-y-2">
                        {timelineItems.map((t) => (
                          <li
                            key={t.id}
                            className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-amber-200/70 bg-gradient-to-r from-white to-amber-50/40 px-3 py-2.5 text-xs shadow-sm dark:border-amber-900/50 dark:bg-gradient-to-r dark:from-slate-800/80 dark:to-amber-950/30"
                          >
                            <span className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-slate-100 truncate">{t.title}</span>
                            {(() => {
                              if (!t.due_date) {
                                return (
                                  <span className="shrink-0 text-[10px] font-semibold text-slate-400">No due date</span>
                                );
                              }
                              const c = taskDueColorClasses(taskDueStatus(t.due_date));
                              return (
                                <span className={`shrink-0 text-[10px] font-semibold ${c.value}`}>
                                  {formatTaskDueDate(t.due_date)}
                                </span>
                              );
                            })()}
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                String(t.status).toLowerCase() === 'done'
                                  ? 'bg-emerald-200/80 text-emerald-900'
                                  : 'bg-violet-100 text-violet-800'
                              }`}
                            >
                              {String(t.status || 'todo').replace(/_/g, ' ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5 border-b border-teal-100/80 bg-gradient-to-r from-teal-50/60 via-white to-cyan-50/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 dark:border-teal-900/50 dark:bg-[#0c141c] dark:[background-image:none]">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h3 className="text-[10px] font-bold uppercase tracking-wide text-teal-900/85 dark:text-teal-200/90 shrink-0">
                          {taskPanelView === 'kanban' ? 'Kanban' : 'List view'}
                        </h3>
                        {canonicalRoot ? (
                          <button
                            type="button"
                            onClick={() => openSubtaskModal(canonicalRoot.id)}
                            className="rounded-lg border-2 border-teal-600/80 bg-gradient-to-r from-[#B2EBF2]/80 to-cyan-100/80 px-2.5 py-1 text-[11px] font-bold text-[#0d3442] shadow-sm ring-1 ring-teal-300/50 hover:from-[#B2EBF2] hover:to-cyan-100 dark:border-teal-600/50 dark:from-teal-800/70 dark:to-cyan-900/60 dark:text-teal-50 dark:ring-teal-700/40 dark:hover:from-teal-700/90 dark:hover:to-cyan-900/80"
                          >
                            + Task
                          </button>
                        ) : null}
                      </div>
                      {isWorkspaceAdmin && userId ? (
                        <div
                          className="flex shrink-0 rounded-lg border border-teal-200/80 bg-white/80 p-0.5 shadow-sm ring-1 ring-teal-100/60 dark:border-teal-800/60 dark:bg-[#121a22] dark:ring-teal-900/45 dark:[background-image:none]"
                          role="tablist"
                          aria-label="Task scope"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={taskScope === 'mine'}
                            onClick={() => setTaskScope('mine')}
                            className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                              taskScope === 'mine'
                                ? 'erp-brand-fill text-white shadow'
                                : 'text-teal-900/70 hover:text-teal-950 hover:bg-teal-50/60 dark:text-teal-200/80 dark:hover:text-teal-50 dark:hover:bg-teal-950/50'
                            }`}
                            title="Only tasks assigned to me"
                          >
                            My tasks
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={taskScope === 'team'}
                            onClick={() => setTaskScope('team')}
                            className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                              taskScope === 'team'
                                ? 'erp-brand-fill text-white shadow'
                                : 'text-teal-900/70 hover:text-teal-950 hover:bg-teal-50/60 dark:text-teal-200/80 dark:hover:text-teal-50 dark:hover:bg-teal-950/50'
                            }`}
                            title="Every task in this project"
                          >
                            Team tasks
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col space-y-4 bg-gradient-to-b from-slate-50/40 via-violet-50/15 to-teal-50/25 p-4 sm:p-5 dark:bg-[#080d12] dark:[background-image:none]">
          <div className="flex-1 min-h-0">
            {rootTasks.length === 0 ? (
              <div className="text-slate-600 text-xs py-6 px-3 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50/50 dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-slate-900/90 max-w-lg mx-auto dark:text-slate-300">
                <p className="font-medium text-slate-700 dark:text-slate-200">No tasks yet.</p>
                <button
                  type="button"
                  onClick={onAddSubtaskFromEmptyState}
                  disabled={creatingRootForSubtask || !userId}
                  className="mt-4 inline-flex items-center justify-center rounded-lg border-2 border-[#103D4D] bg-[#B2EBF2]/50 px-4 py-2 text-xs font-bold text-[#103D4D] shadow-sm ring-1 ring-[#103D4D]/10 hover:bg-[#B2EBF2]/70 hover:border-[#0d3442] disabled:opacity-50 disabled:pointer-events-none dark:border-teal-500/60 dark:bg-gradient-to-r dark:from-teal-900/70 dark:to-cyan-950/60 dark:text-teal-100 dark:ring-teal-700/30 dark:hover:from-teal-800 dark:hover:to-cyan-900"
                >
                  {creatingRootForSubtask ? 'Preparing…' : '+ Task'}
                </button>
              </div>
            ) : (
              <ErpProjectSubtasksPanel
                projectId={projectId}
                tasks={tasks}
                viewMode={taskPanelView}
                onReload={() => refreshSessionData()}
                isWorkspaceAdmin={isWorkspaceAdmin}
                userId={userId}
                showOpenProjectLink={false}
                plainTitles
                onEditTask={openEditTaskModal}
                onOpenTask={openTaskDetail}
                scope={taskScope}
                avatarProfileFor={avatarProfileFor}
              />
            )}
          </div>

          {detailTask ? (
            <ErpProjectTaskDetailModal
              task={detailTask}
              userId={userId}
              nameMap={nameMap}
              avatarProfileFor={avatarProfileFor}
              canManageProject={canEditProjectDetails}
              canDelete={isWorkspaceAdmin || detailTask.created_by === userId}
              projectId={projectId}
              onClose={closeTaskDetail}
              onEdit={(taskId) => {
                closeTaskDetail();
                openEditTaskModal(taskId);
              }}
              onDeleted={(taskId) => void onTaskDeletedFromDetail(taskId)}
            />
          ) : null}

          {subtaskModalParentId && (
            <ErpBodyPortal>
            <div
              className="fixed inset-0 z-[260] flex items-end justify-center overflow-y-auto px-0 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="subtask-modal-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
                aria-label="Close dialog"
                disabled={subtaskSaving}
                onClick={() => {
                  if (!subtaskSaving) closeSubtaskModal();
                }}
              />
              <div
                className={`relative w-full ${erpModalPanelMaxWidthClass} max-h-[min(92vh,860px)] overflow-y-auto rounded-none border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 sm:rounded-2xl dark:border-teal-900/50 dark:bg-gradient-to-b dark:from-[#0f1a22] dark:to-[#060a0e] dark:ring-teal-900/30 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]`}
                onClick={(e) => e.stopPropagation()}
              >
                <form onSubmit={createSubtask} className="p-5 sm:p-6 space-y-4">
                  <input
                    ref={subtaskFileRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="*/*"
                    onChange={onSubtaskFilesChosen}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 id="subtask-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
                        {editingTaskId ? 'Edit task' : 'Add task'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!subtaskSaving) closeSubtaskModal();
                      }}
                      disabled={subtaskSaving}
                      className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-lg leading-none text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-slate-400">
                      Title
                    </label>
                    <input
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#103D4D]/50 dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-slate-400">
                      Description <span className="font-normal normal-case text-slate-400 dark:text-slate-500">(optional)</span>
                    </label>
                    <ErpWysiwygMarkdownField
                      value={subtaskDescription}
                      onChange={setSubtaskDescription}
                      disabled={subtaskSaving}
                      resetKey={`${editingTaskId || 'new'}-${String(subtaskModalParentId || '')}`}
                      placeholder="Add context, acceptance criteria, links…"
                      editorClassName="min-h-[5rem] !rounded-xl dark:!border-teal-800/50 dark:focus:!border-teal-500/50 dark:!text-slate-100 [&_a]:text-[#103D4D] dark:[&_a]:text-teal-300"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-slate-400">
                        Team members <span className="font-normal normal-case text-slate-400 dark:text-slate-500">(optional)</span>
                      </label>
                      <div className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus-within:border-[#103D4D]/50 dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-100 dark:focus-within:border-teal-600/50">
                        <div className="flex flex-wrap gap-1.5">
                          {subtaskAssigneeIds.length > 0 ? (
                            subtaskAssigneeIds.map((uid) => (
                              <button
                                key={uid}
                                type="button"
                                onClick={() => setSubtaskAssigneeIds((prev) => prev.filter((x) => x !== uid))}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 dark:bg-teal-950/55 dark:text-teal-100 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                title="Remove assignee"
                              >
                                <span className="max-w-[9rem] truncate">
                                  {nameMap[uid] || uid.slice(0, 8)}
                                </span>
                                <span aria-hidden>×</span>
                              </button>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[12px] dark:text-slate-500">Unassigned</span>
                          )}
                        </div>
                        <select
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] font-semibold text-slate-800 outline-none focus:border-[#103D4D]/40 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:focus:border-teal-500/45"
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            setSubtaskAssigneeIds((prev) => (prev.includes(v) ? prev : [...prev, v]));
                          }}
                        >
                          <option value="" disabled hidden>Select member…</option>
                          {members
                            .filter((m) => !subtaskAssigneeIds.includes(m.user_id))
                            .map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {nameMap[m.user_id] || m.user_id.slice(0, 8)} ({memberDelegationLabel(m)})
                              </option>
                            ))}
                        </select>

                        <div className="mt-2 border-t border-slate-100 pt-2 dark:border-teal-900/35">
                          {!subtaskInviteOpen ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSubtaskInviteOpen(true);
                                setSubtaskInviteNote('');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-[#103D4D] hover:bg-cyan-50"
                            >
                              <span aria-hidden>＋</span> Invite new member
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid w-full grid-cols-2 gap-1.5">
                                {(subtaskInviteRoleOptions.length
                                  ? subtaskInviteRoleOptions
                                  : [
                                      { id: 'team_member', label: 'Team member' },
                                      { id: 'team_lead', label: 'Team lead' },
                                      { id: 'client', label: 'Client' },
                                    ]
                                ).map((r) => {
                                  const active = subtaskInviteRole === r.id;
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => setSubtaskInviteRole(r.id)}
                                      className={`w-full min-w-0 rounded-xl border px-2 py-2 text-center text-[10px] font-bold leading-snug transition ${
                                        active
                                          ? 'erp-brand-fill text-white shadow-sm'
                                          : 'border border-slate-200 bg-white text-slate-600 hover:border-[#103D4D]/40 hover:text-[#103D4D]'
                                      }`}
                                    >
                                      <span className="break-words">{r.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="email"
                                  value={subtaskInviteEmail}
                                  onChange={(e) => setSubtaskInviteEmail(e.target.value)}
                                  placeholder="name@company.com"
                                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-[#103D4D]/40"
                                />
                                <button
                                  type="button"
                                  onClick={() => void sendSubtaskInvite()}
                                  disabled={subtaskInviteBusy || !subtaskInviteEmail.trim()}
                                  className="shrink-0 rounded-lg erp-brand-fill px-3 py-1.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
                                >
                                  {subtaskInviteBusy ? 'Sending…' : 'Send'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubtaskInviteOpen(false);
                                    setSubtaskInviteEmail('');
                                    setSubtaskInviteNote('');
                                  }}
                                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                  title="Cancel"
                                >
                                  ×
                                </button>
                              </div>
                              {subtaskInviteNote ? (
                                <p
                                  className={`text-[11px] ${
                                    /sent to/i.test(subtaskInviteNote)
                                      ? 'text-emerald-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {subtaskInviteNote}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-slate-400">
                        Due date <span className="font-normal normal-case text-slate-400 dark:text-slate-500">(optional)</span>
                      </label>
                      <input
                        type="date"
                        min={todayDateInputValue()}
                        value={subtaskDue}
                        onChange={(e) => setSubtaskDue(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#103D4D]/50 dark:border-teal-900/50 dark:bg-[#121f28] dark:text-slate-100 dark:[color-scheme:dark] dark:focus:border-teal-600/50"
                      />
                    </div>
                  </div>

                  {isWorkspaceAdmin ? (
                    <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-slate-400">
                          Priority
                        </label>
                      <div className="flex items-center gap-3">
                        <ErpTaskPriorityPicker
                          size="sm"
                          value={normalizeTaskPriority(subtaskPriority)}
                          onChange={(next) => setSubtaskPriority(next)}
                          ariaLabel="Task priority"
                        />
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Defaults to Medium. Only admins &amp; leads can set this.
                        </p>
                      </div>
                    </div>
                  ) : null}

                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2 dark:text-slate-400">
                        Files / media <span className="font-normal normal-case text-slate-400 dark:text-slate-500">(optional)</span>
                      </label>
                    {subtaskFiles.length > 0 ? (
                      <ul className="flex flex-wrap gap-2 mb-2">
                        {subtaskFiles.map((f, i) => (
                          <li
                            key={`${f.name}-${i}`}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-teal-900/45 dark:bg-[#0f1820] dark:text-slate-200"
                          >
                            <span className="truncate max-w-[200px]">{f.name}</span>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600"
                              onClick={() => setSubtaskFiles((prev) => prev.filter((_, j) => j !== i))}
                              aria-label="Remove file"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => subtaskFileRef.current?.click()}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-teal-800/55 dark:erp-brand-fill dark:text-white dark:shadow-black/25 dark:"
                    >
                      Choose files
                    </button>
                  </div>

                  {editingTaskId ? (
                    <ErpTaskChecklistAndComments
                      taskId={editingTaskId}
                      userId={userId}
                      nameMap={nameMap}
                      avatarProfileFor={avatarProfileFor}
                      canManageProject={canEditProjectDetails}
                    />
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[11px] font-medium text-slate-500 dark:border-teal-800/45 dark:bg-[#0f1820]/80 dark:text-slate-400">
                      Save this task first to add a checklist and comments.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-1 dark:border-teal-900/35">
                    <div>
                      {editingTaskId && canDeleteTaskAsWorkspaceLead ? (
                        <button
                          type="button"
                          onClick={() => setSubtaskDeleteConfirmOpen(true)}
                          disabled={subtaskSaving}
                          className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/55 dark:bg-[#121f28] dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          Delete task
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!subtaskSaving) closeSubtaskModal();
                        }}
                        disabled={subtaskSaving}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={subtaskSaving || !subtaskTitle.trim()}
                        className="rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
                      >
                        {subtaskSaving ? 'Saving…' : editingTaskId ? 'Update task' : 'Save task'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
            <ErpConfirmDialog
              open={subtaskDeleteConfirmOpen}
              title="Delete this task?"
              confirmLabel="Delete"
              tone="danger"
              busy={subtaskSaving}
              onCancel={() => {
                if (!subtaskSaving) setSubtaskDeleteConfirmOpen(false);
              }}
              onConfirm={() => void confirmDeleteEditingSubtask()}
            >
              <p className="text-sm text-slate-600">
                This removes the task and its checklist, comments, and attachments. Project members will no longer see it. This
                cannot be undone.
              </p>
            </ErpConfirmDialog>
            </ErpBodyPortal>
          )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
        <div className="order-2 min-w-0 xl:order-none xl:col-span-4 xl:col-start-9 xl:row-start-1 xl:mt-8">
          <section
            className={`${workspacePanel} ${PROJECT_CHAT_PANEL_CLASS}`}
            aria-label="Project channels sidebar"
          >
            <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
              {canAccessProjectCredentials ? (
                <div
                  className="flex rounded-xl bg-slate-100/90 p-1 mb-4 ring-1 ring-slate-200/60 shrink-0 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-slate-900/95 dark:ring-slate-600/50"
                  role="tablist"
                  aria-label="Project sidebar"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightSidebarTab === 'channels'}
                    onClick={() => setRightSidebarTab('channels')}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                      rightSidebarTab === 'channels'
                        ? 'bg-white text-[#103D4D] shadow-sm dark:bg-gradient-to-br dark:from-teal-800 dark:to-[#103D4D] dark:text-white dark:shadow-md'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-teal-100'
                    }`}
                  >
                    Channels
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightSidebarTab === 'credentials'}
                    onClick={() => setRightSidebarTab('credentials')}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                      rightSidebarTab === 'credentials'
                        ? 'bg-white text-[#103D4D] shadow-sm dark:bg-gradient-to-br dark:from-teal-800 dark:to-[#103D4D] dark:text-white dark:shadow-md'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-teal-100'
                    }`}
                  >
                    Credentials
                  </button>
                </div>
              ) : null}

              {(!canAccessProjectCredentials || rightSidebarTab === 'channels') && (
                <div
                  role="tabpanel"
                  aria-label="Project channels"
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5 [scrollbar-width:thin]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full erp-brand-fill" aria-hidden />
                      Channels
                      <span className="text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
                        {projectChannels.length}
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setNewChannelName('');
                        setNewChannelOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl erp-brand-fill px-3 py-2 text-xs font-bold shadow-sm transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      New
                    </button>
                  </div>
                  {projectChannels.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-[11px] font-medium text-slate-500 dark:border-slate-600 dark:bg-gradient-to-br dark:from-slate-800/50 dark:to-slate-950/70 dark:text-slate-400">
                      No channels yet. Create one to organize focused discussions.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {projectChannels.map((ch) => {
                        const active = activeChannelId === ch.id;
                        const name = ch.is_general ? 'General' : ch.name;
                        const isRenaming = editingChannelId === ch.id;
                        const isBusy = channelBusyId === ch.id;
                        if (isRenaming) {
                          return (
                            <li key={ch.id}>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void submitRenameChannel(ch.id);
                                }}
                                className="flex items-center gap-1.5 rounded-xl border border-[#103D4D]/40 bg-white px-2 py-1.5 shadow-sm ring-1 ring-[#103D4D]/10 dark:border-teal-700/50 dark:bg-[#0c141c] dark:ring-teal-900/30"
                              >
                                <span className="text-lg leading-none text-slate-400" aria-hidden>
                                  #
                                </span>
                                <input
                                  autoFocus
                                  value={editingChannelName}
                                  onChange={(e) => setEditingChannelName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelRenameChannel();
                                    }
                                  }}
                                  maxLength={80}
                                  disabled={isBusy}
                                  className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-[#103D4D]/50 focus:ring-2 focus:ring-[#103D4D]/15"
                                  placeholder="channel-name"
                                />
                                <button
                                  type="submit"
                                  disabled={isBusy || !editingChannelName.trim()}
                                  className="rounded-md erp-brand-fill px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm disabled:opacity-50"
                                >
                                  {isBusy ? '…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelRenameChannel}
                                  disabled={isBusy}
                                  className="rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800"
                                >
                                  Cancel
                                </button>
                              </form>
                            </li>
                          );
                        }
                        return (
                          <li key={ch.id}>
                            <div
                              className={`group flex w-full items-center gap-1 rounded-xl text-left text-sm font-semibold transition ${
                                active
                                  ? 'erp-brand-fill text-white shadow-md shadow-teal-900/20 ring-1 ring-white/20 dark:ring-teal-500/25'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:border-[#103D4D]/35 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-teal-700/40 dark:hover:bg-slate-800/80'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => selectChannel(ch.id)}
                                title={name}
                                aria-current={active ? 'true' : undefined}
                                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
                              >
                                <span
                                  className={`text-lg leading-none ${
                                    active ? 'text-cyan-200' : 'text-slate-400 group-hover:text-[#103D4D]'
                                  }`}
                                  aria-hidden
                                >
                                  #
                                </span>
                                <span className="min-w-0 flex-1 truncate">{name}</span>
                                {ch.is_general ? (
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                      active ? 'bg-white/20 text-cyan-50' : 'bg-slate-100 text-slate-500 dark:bg-slate-800/90 dark:text-slate-400'
                                    }`}
                                  >
                                    Default
                                  </span>
                                ) : null}
                              </button>
                              {isWorkspaceAdmin && !ch.is_general ? (
                                <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      beginRenameChannel(ch);
                                    }}
                                    disabled={isBusy}
                                    title="Rename channel"
                                    aria-label="Rename channel"
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition ${
                                      active
                                        ? 'text-cyan-100 hover:bg-white/15'
                                        : 'text-slate-400 hover:bg-[#103D4D]/10 hover:text-[#103D4D]'
                                    } disabled:opacity-50`}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4.5 1 1-4.5 12.862-12.226z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteChannelTarget({ id: ch.id, name: ch.name || 'channel' });
                                    }}
                                    disabled={isBusy}
                                    title="Delete channel"
                                    aria-label="Delete channel"
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition ${
                                      active
                                        ? 'text-rose-200 hover:bg-white/15'
                                        : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                                    } disabled:opacity-50`}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-9 0h12" />
                                    </svg>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Team members — live in the right sidebar below Channels. */}
                  <div className="mt-5 border-t border-slate-200/80 pt-4 dark:border-teal-900/40">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500" aria-hidden />
                        Team members
                        <span className="text-[10px] font-bold tabular-nums text-slate-400">
                          {sortedProjectMembers.length}
                        </span>
                      </h3>
                      {isWorkspaceAdmin ? (
                        <button
                          type="button"
                          onClick={() => setInviteMembersOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl erp-brand-fill px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3 w-3" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Invite
                        </button>
                      ) : null}
                    </div>
                    {sortedProjectMembers.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-[11px] font-medium text-slate-500 dark:border-teal-800/45 dark:bg-[#0f1820]/90 dark:text-slate-400">
                        No members yet.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {sortedProjectMembers.map((m) => {
                          const nm = nameMap[m.user_id] || m.user_id.slice(0, 8);
                          const canActions = canRemoveProjectMembers && m.user_id !== userId;
                          const roleLabel = memberDelegationLabel(m);
                          return (
                            <li key={m.user_id}>
                              <button
                                type="button"
                                title={`${nm} · ${roleLabel}`}
                                aria-label={`${nm} · ${roleLabel}`}
                                aria-haspopup={canActions ? 'menu' : undefined}
                                aria-expanded={canActions ? memberActionsMenu?.userId === m.user_id : undefined}
                                onClick={
                                  canActions
                                    ? (e) => {
                                        e.stopPropagation();
                                        const r = e.currentTarget.getBoundingClientRect();
                                        const w = 200;
                                        const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
                                        const top = Math.min(r.bottom + 4, window.innerHeight - 8);
                                        setMemberActionsMenu((prev) =>
                                          prev?.userId === m.user_id ? null : { userId: m.user_id, left, top },
                                        );
                                      }
                                    : undefined
                                }
                                className={`group flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 dark:border-teal-900/45 dark:bg-[#101a22] dark:hover:border-teal-700/50 dark:hover:bg-[#152028] ${
                                  canActions
                                    ? 'cursor-pointer hover:border-[#103D4D]/35 hover:bg-slate-50 dark:hover:border-teal-600/45'
                                    : 'cursor-default'
                                }`}
                              >
                                <ErpAvatarWithOnline
                                  presenceUserId={m.user_id}
                                  lastActiveAt={lastActiveByUserId[m.user_id]}
                                  forceOnline={m.user_id === userId}
                                  size="sm"
                                >
                                  <ErpUserAvatar
                                    profile={avatarProfileFor(m.user_id)}
                                    size="sm"
                                    alt=""
                                    className="shadow-sm ring-2 ring-white dark:ring-teal-900/60"
                                  />
                                </ErpAvatarWithOnline>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[12px] font-bold text-slate-800 group-hover:text-[#103D4D] dark:text-slate-100 dark:group-hover:text-teal-200">
                                    {nm}
                                    {m.user_id === userId ? (
                                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        · you
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-teal-300/90">
                                    {roleLabel}
                                  </p>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {canAccessProjectCredentials && rightSidebarTab === 'credentials' ? (
                <div
                  role="tabpanel"
                  aria-label="Project credentials"
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5 [scrollbar-width:thin]"
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 mb-3">
                    <span className="h-1.5 w-1.5 rounded-full erp-brand-fill" aria-hidden />
                    Credentials
                  </h3>
                  <ErpProjectCredentialsPanel projectId={projectId} userId={userId} />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {typeof document !== 'undefined' && chatExpanded
        ? createPortal(
            <div
              className="fixed inset-0 z-[240] flex flex-col bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4"
              role="presentation"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default sm:bg-transparent"
                aria-label="Close expanded chat"
                onClick={() => setChatExpanded(false)}
              />
              <div
                className={
                  'relative z-[241] flex w-full flex-col overflow-hidden rounded-none border-0 bg-white ' +
                  'h-[100dvh] max-h-[100dvh] min-h-0 ' +
                  'dark:bg-gradient-to-b dark:from-[#0c141c] dark:to-[#040608] ' +
                  'sm:h-[min(92dvh,900px)] sm:max-h-[min(92dvh,900px)] sm:max-w-[min(100%,86rem)] sm:flex-none sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-2xl sm:ring-1 sm:ring-white/70 dark:sm:border-teal-900/50 dark:sm:ring-teal-900/35'
                }
              >
                {renderProjectChatFullPanel({
                  variant: 'expanded',
                  onCollapse: () => setChatExpanded(false),
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {isWorkspaceAdmin && (
        <ProjectBulkPriorityContextMenu
          menu={projectBulkMenu}
          onClose={() => setProjectBulkMenu(null)}
          onApplied={() => refreshSessionData()}
          onError={(msg) => setError(msg)}
        />
      )}

      {isWorkspaceAdmin ? (
        <ErpInviteMembersModal
          open={inviteMembersOpen}
          onClose={() => setInviteMembersOpen(false)}
          projectId={projectId}
          projectName={project?.name || ''}
          existingMemberUserIds={members.map((m) => m.user_id)}
          onSuccess={() => void reloadProjectMembers()}
        />
      ) : null}

      {typeof document !== 'undefined' && editProjectOpen
        ? createPortal(
            <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close"
                onClick={() => (editProjectBusy ? null : closeEditProjectModal())}
              />
              <form
                onSubmit={(e) => void saveProjectDetails(e)}
                className={`relative z-[261] w-full ${erpModalPanelMaxWidthClass} max-h-[min(92dvh,720px)] overflow-y-auto rounded-none border border-slate-200 bg-white p-6 shadow-2xl [scrollbar-width:thin] sm:rounded-3xl dark:border-teal-900/50 dark:bg-gradient-to-b dark:from-[#0f1824] dark:to-[#060a0e] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Project</p>
                <h3 className="mt-1 text-lg font-bold text-[#103D4D] dark:text-teal-200">Edit details</h3>
                <label className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-300">Name</label>
                <input
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  maxLength={160}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/20 dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50 dark:focus:ring-teal-900/30"
                />

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Start date</label>
                    <input
                      type="date"
                      value={editProjectStartDate}
                      disabled={editProjectBusy}
                      onChange={(e) => setEditProjectStartDate(e.target.value)}
                      className="erp-date-input mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60 dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-100 dark:focus:border-teal-600/50 dark:focus:ring-teal-900/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Due date</label>
                    <input
                      type="date"
                      value={editProjectDueDate}
                      disabled={editProjectBusy}
                      onChange={(e) => setEditProjectDueDate(e.target.value)}
                      className="erp-date-input mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60 dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-100 dark:focus:border-teal-600/50 dark:focus:ring-teal-900/30"
                    />
                  </div>
                </div>

                <label htmlFor="erp-edit-proj-type" className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Project type
                </label>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Categories used on the projects board (same as when creating a project).
                </p>
                <div id="erp-edit-proj-type" className="mt-1">
                  <ErpCreatableMultiSelect
                    valueIds={editProjectTypeIds}
                    options={editProjectTypeOptions}
                    disabled={editProjectBusy}
                    onChange={(ids) => startTransition(() => setEditProjectTypeIds(ids))}
                    placeholder="Select or type a project type…"
                    canCreate={isErpManagerRole(profile?.role)}
                    createLabel="Add project type"
                    onCreate={async ({ id, label }) => {
                      if (isErpManagerRole(profile?.role)) {
                        const { error: insErr } = await supabase.from('erp_project_type_options').insert({ id, label });
                        if (insErr && !/duplicate/i.test(insErr.message || '')) {
                          throw new Error(insErr.message);
                        }
                      }
                      setEditProjectTypeOptions((prev) => {
                        if (prev.some((o) => o.id === id)) return prev;
                        return [...prev, { id, label }].sort((a, b) => a.label.localeCompare(b.label));
                      });
                    }}
                  />
                </div>

                <label className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
                <div className="mt-1">
                  <ErpWysiwygMarkdownField
                    value={editProjectDesc}
                    onChange={(next) => setEditProjectDesc(String(next || '').slice(0, 8000))}
                    disabled={editProjectBusy}
                    resetKey={`edit-project-${projectId || 'none'}-${editProjectOpen ? 'open' : 'closed'}`}
                    placeholder="Goals, scope, links…"
                    editorClassName="min-h-[8rem] !rounded-xl dark:!border-teal-900/50 dark:!bg-[#0c141c] dark:focus:!border-teal-600/50"
                  />
                </div>
                <div className="mt-4 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-teal-900/45 dark:bg-[#080c12]/95">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Brief attachments</label>
                    <button
                      type="button"
                      disabled={editProjectBusy}
                      onClick={() => editProjectBriefFileRef.current?.click()}
                      className="rounded-lg border border-[#103D4D]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#103D4D] hover:bg-cyan-50 disabled:opacity-50 dark:border-teal-700/45 dark:bg-slate-800/90 dark:text-teal-200 dark:hover:bg-slate-800"
                    >
                      + Add files
                    </button>
                  </div>
                  <input
                    ref={editProjectBriefFileRef}
                    type="file"
                    className="sr-only"
                    multiple
                    accept={PROJECT_BRIEF_FILE_ACCEPT}
                    onChange={onEditProjectBriefFilesChosen}
                  />
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    PDF, images, Office, zip — up to {Math.round(PROJECT_BRIEF_MAX_FILE_BYTES / (1024 * 1024))} MB each,
                    max {PROJECT_BRIEF_ATTACH_MAX} total.
                  </p>
                  {editProjectDraftAttachments.length > 0 || editProjectPendingBriefFiles.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {editProjectDraftAttachments.map((a) => (
                        <li
                          key={a.path}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 dark:border-teal-900/45 dark:bg-[#0e1822] dark:text-slate-200"
                        >
                          <span className="min-w-0 truncate font-medium" title={a.name}>
                            {a.name}
                          </span>
                          <button
                            type="button"
                            disabled={editProjectBusy}
                            onClick={() =>
                              setEditProjectDraftAttachments((prev) => prev.filter((x) => x.path !== a.path))
                            }
                            className="shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                            aria-label={`Remove ${a.name}`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                      {editProjectPendingBriefFiles.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-cyan-300/80 bg-cyan-50/50 px-2 py-1.5 text-[11px] text-slate-800 dark:border-teal-700/50 dark:bg-teal-950/35 dark:text-slate-200"
                        >
                          <span className="min-w-0 truncate font-medium" title={f.name}>
                            {f.name}
                            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(not saved yet)</span>
                          </span>
                          <button
                            type="button"
                            disabled={editProjectBusy}
                            onClick={() => setEditProjectPendingBriefFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="shrink-0 rounded px-1.5 py-0.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                            aria-label={`Remove ${f.name}`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">No brief files attached.</p>
                  )}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={editProjectBusy}
                    onClick={() => closeEditProjectModal()}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editProjectBusy}
                    className="rounded-xl erp-brand-fill px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    {editProjectBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && deleteProjectConfirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-[255] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close"
                onClick={() => (projectDeleting ? null : setDeleteProjectConfirmOpen(false))}
              />
              <div
                className={`relative z-[256] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-3xl`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-delete-project-title"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Danger zone</p>
                <h2 id="erp-delete-project-title" className="mt-1 text-lg font-bold text-slate-900">
                  Delete “{project?.name || 'project'}”
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  This permanently removes the project, tasks, chat, activity, and files in storage. This cannot be undone.
                </p>
                <p className="mt-4 text-sm text-slate-700">
                  Type <span className="font-extrabold text-slate-900">DELETE</span> to confirm.
                </p>
                <input
                  value={deleteProjectTyped}
                  onChange={(e) => {
                    setDeleteProjectTyped(e.target.value);
                    setDeleteProjectErr('');
                  }}
                  placeholder="DELETE"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
                  disabled={projectDeleting}
                  autoFocus
                />
                {deleteProjectErr ? <p className="mt-2 text-sm text-rose-700">{deleteProjectErr}</p> : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteProjectConfirmOpen(false)}
                    disabled={projectDeleting}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDeleteProjectFromWorkspace()}
                    disabled={projectDeleting}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                  >
                    {projectDeleting ? 'Deleting…' : 'Delete project'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && clearChatOpen
        ? createPortal(
            <div className="fixed inset-0 z-[265] flex items-center justify-center bg-slate-900/40 p-0 sm:p-4 backdrop-blur-[2px]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close"
                onClick={() => (clearChatBusy ? null : setClearChatOpen(false))}
              />
              <div
                className={`relative z-[266] w-full ${erpModalPanelMaxWidthClass} rounded-none border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-3xl`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-clear-project-chat-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Danger zone</p>
                <h2 id="erp-clear-project-chat-title" className="mt-1 text-lg font-bold text-slate-900">
                  Clear chat{activeChannelId ? '' : ''} (this channel)
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  This deletes all messages in the current project channel, including attachments. This cannot be undone.
                </p>
                <p className="mt-4 text-sm text-slate-700">
                  Type <span className="font-extrabold text-slate-900">DELETE</span> to confirm.
                </p>
                <input
                  value={clearChatTyped}
                  onChange={(e) => {
                    setClearChatTyped(e.target.value);
                    setClearChatErr('');
                  }}
                  placeholder="DELETE"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
                  disabled={clearChatBusy}
                  autoFocus
                />
                {clearChatErr ? <p className="mt-2 text-sm text-rose-700">{clearChatErr}</p> : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setClearChatOpen(false)}
                    disabled={clearChatBusy}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearProjectChat()}
                    disabled={clearChatBusy}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                  >
                    {clearChatBusy ? 'Clearing…' : 'Clear chat'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && memberActionsMenu && canRemoveProjectMembers
        ? createPortal(
            <div className="fixed inset-0 z-[275]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close menu"
                onClick={() => setMemberActionsMenu(null)}
              />
              <div
                className={`absolute min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
                style={{
                  left: memberActionsMenu.left,
                  top: Math.max(8, Math.min(memberActionsMenu.top, window.innerHeight - 120)),
                }}
                role="menu"
                aria-label="Member actions"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/40"
                  role="menuitem"
                  onClick={() => {
                    const uid = memberActionsMenu.userId;
                    setMemberActionsMenu(null);
                    if (uid) setConfirmRemoveMemberId(uid);
                  }}
                >
                  Remove from project
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && projectHeaderMenu
        ? createPortal(
            <div className="fixed inset-0 z-[265]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close menu"
                onClick={() => setProjectHeaderMenu(null)}
              />
              <div
                className={`absolute min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
                style={{
                  left: projectHeaderMenu.left,
                  top: Math.max(8, Math.min(projectHeaderMenu.top, window.innerHeight - 200)),
                }}
                role="menu"
                aria-label="Project actions"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {canEditProjectDetails ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                    role="menuitem"
                    onClick={() => {
                      setProjectHeaderMenu(null);
                      openEditProjectModal({
                        project,
                        setEditProjectDraftAttachments,
                        setEditProjectPendingBriefFiles,
                        setEditProjectOpen,
                        setEditProjectTypeIds,
                      });
                    }}
                  >
                    Edit project
                  </button>
                ) : null}
                {canEditProjectDetails ? (
                  <button
                    type="button"
                    disabled={projectCompletionBusy}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-white/10 ${
                      isProjectCompleted
                        ? 'text-slate-800 dark:text-slate-100'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                    role="menuitem"
                    onClick={() => {
                      setProjectHeaderMenu(null);
                      void handleToggleProjectCompletion();
                    }}
                  >
                    {isProjectCompleted ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-slate-500 dark:text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M3 12a9 9 0 1015.5-6.5L21 3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M8 12.5l2.8 2.8L16 10" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {projectCompletionBusy
                      ? 'Saving…'
                      : isProjectCompleted
                        ? 'Mark as active'
                        : 'Mark as complete'}
                  </button>
                ) : null}
                {canDeleteProject ? (
                  <button
                    type="button"
                    disabled={projectDeleting}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-200 dark:hover:bg-rose-950/40"
                    role="menuitem"
                    onClick={() => {
                      setProjectHeaderMenu(null);
                      void handleDeleteProject();
                    }}
                  >
                    Delete project
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && chatCtxMenu
        ? createPortal(
            <div className="fixed inset-0 z-[270]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Close menu"
                onClick={() => setChatCtxMenu(null)}
              />
              <div
                className={`absolute min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
                style={{
                  left: Math.max(8, Math.min(chatCtxMenu.x, window.innerWidth - 176)),
                  top: Math.max(8, Math.min(chatCtxMenu.y, window.innerHeight - 140)),
                }}
                role="menu"
                aria-label="Message actions"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {(() => {
                  const ctxMsg = messages.find((x) => x.id === chatCtxMenu.messageId);
                  const tombstone = Boolean(ctxMsg?.deleted_at);
                  const ctxMine = Boolean(ctxMsg && userId && ctxMsg.user_id === userId);
                  const showEdit = !tombstone && ctxMine && ctxMsg && canEditChatMessageByAge(ctxMsg.created_at);
                  const showDelete = Boolean(!tombstone && (ctxMine || profile?.role === 'admin'));
                  return (
                    <>
                      {showEdit ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                          role="menuitem"
                          onClick={() => {
                            setChatCtxMenu(null);
                            if (ctxMsg) startEditProjectChatMessage(ctxMsg);
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
                            const id = chatCtxMenu?.messageId;
                            setChatCtxMenu(null);
                            if (id) setConfirmDeleteMessageId(id);
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
            </div>,
            document.body,
          )
        : null}

      <ErpConfirmDialog
        open={confirmRemoveMemberId != null}
        title="Remove from project?"
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setConfirmRemoveMemberId(null)}
        onConfirm={() => void executeRemoveMember()}
      >
        <p>
          Remove{' '}
          <span className="font-semibold text-slate-800">
            {confirmRemoveMemberId ? nameMap[confirmRemoveMemberId] || confirmRemoveMemberId.slice(0, 8) : ''}
          </span>{' '}
          from this project? They will lose access until added again.
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmDeleteMessageId != null}
        title="Delete message?"
        confirmLabel="Delete message"
        tone="danger"
        onCancel={() => setConfirmDeleteMessageId(null)}
        onConfirm={() => void executeDeleteChatMessage()}
      >
        <p>
          Text will be cleared and replaced with “This message has been deleted”. Attachments are moved to Trash. Delete your
          own messages anytime; Super Admin can delete anyone’s message on this channel.
        </p>
      </ErpConfirmDialog>

      <ErpFilePreviewModal file={filePreview} onClose={closeFilePreview} />
    </div>
  );
}
