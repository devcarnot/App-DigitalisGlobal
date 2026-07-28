// Per-user pinned DM/group conversations and project channels (device-local).

const DM_STORAGE_PREFIX = 'erp-pinned-dm-conversations:';
const CHANNEL_STORAGE_PREFIX = 'erp-pinned-project-channels:';
const MAX_PINNED = 30;

function dmStorageKey(userId) {
  if (!userId) return null;
  return `${DM_STORAGE_PREFIX}${userId}`;
}

function channelStorageKey(userId, projectId) {
  if (!userId || !projectId) return null;
  return `${CHANNEL_STORAGE_PREFIX}${userId}:${projectId}`;
}

function safeReadList(key) {
  if (typeof window === 'undefined' || !key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function safeWriteList(key, list) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_PINNED)));
  } catch {
    /* ignore */
  }
}

function subscribeList(key, userId, readFn, cb) {
  if (typeof window === 'undefined' || !userId || typeof cb !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    if (event.key !== key) return;
    cb(readFn(userId));
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/** @returns {string[]} conversation keys (`dm-…` / `group-…`) in pin order */
export function readPinnedDmConversations(userId) {
  return safeReadList(dmStorageKey(userId));
}

export function isDmConversationPinned(userId, conversationKey, pinnedList) {
  const list = pinnedList ?? readPinnedDmConversations(userId);
  return list.includes(conversationKey);
}

export function pinDmConversation(userId, conversationKey) {
  if (!userId || !conversationKey) return readPinnedDmConversations(userId);
  const key = dmStorageKey(userId);
  const list = safeReadList(key).filter((id) => id !== conversationKey);
  list.unshift(conversationKey);
  safeWriteList(key, list);
  return list.slice(0, MAX_PINNED);
}

export function unpinDmConversation(userId, conversationKey) {
  if (!userId || !conversationKey) return readPinnedDmConversations(userId);
  const key = dmStorageKey(userId);
  const list = safeReadList(key).filter((id) => id !== conversationKey);
  safeWriteList(key, list);
  return list;
}

export function togglePinDmConversation(userId, conversationKey) {
  if (!userId || !conversationKey) return readPinnedDmConversations(userId);
  const list = safeReadList(dmStorageKey(userId));
  if (list.includes(conversationKey)) return unpinDmConversation(userId, conversationKey);
  return pinDmConversation(userId, conversationKey);
}

export function subscribePinnedDmConversations(userId, cb) {
  const key = dmStorageKey(userId);
  if (!key) return () => {};
  return subscribeList(key, userId, readPinnedDmConversations, cb);
}

/** @returns {string[]} channel ids in pin order for one project */
export function readPinnedProjectChannels(userId, projectId) {
  return safeReadList(channelStorageKey(userId, projectId));
}

export function isProjectChannelPinned(userId, projectId, channelId, pinnedList) {
  const list = pinnedList ?? readPinnedProjectChannels(userId, projectId);
  return list.includes(channelId);
}

export function pinProjectChannel(userId, projectId, channelId) {
  if (!userId || !projectId || !channelId) return readPinnedProjectChannels(userId, projectId);
  const key = channelStorageKey(userId, projectId);
  const list = safeReadList(key).filter((id) => id !== channelId);
  list.unshift(channelId);
  safeWriteList(key, list);
  return list.slice(0, MAX_PINNED);
}

export function unpinProjectChannel(userId, projectId, channelId) {
  if (!userId || !projectId || !channelId) return readPinnedProjectChannels(userId, projectId);
  const key = channelStorageKey(userId, projectId);
  const list = safeReadList(key).filter((id) => id !== channelId);
  safeWriteList(key, list);
  return list;
}

export function togglePinProjectChannel(userId, projectId, channelId) {
  if (!userId || !projectId || !channelId) return readPinnedProjectChannels(userId, projectId);
  const list = safeReadList(channelStorageKey(userId, projectId));
  if (list.includes(channelId)) return unpinProjectChannel(userId, projectId, channelId);
  return pinProjectChannel(userId, projectId, channelId);
}

export function subscribePinnedProjectChannels(userId, projectId, cb) {
  const key = channelStorageKey(userId, projectId);
  if (!key) return () => {};
  return subscribeList(key, userId, () => readPinnedProjectChannels(userId, projectId), cb);
}

/** Pin order first, then `lastAt` descending. */
export function sortDmConversations(rows, pinnedKeys) {
  const pinIndex = new Map(pinnedKeys.map((k, i) => [k, i]));
  return [...rows].sort((a, b) => {
    const ap = pinIndex.has(a.key) ? pinIndex.get(a.key) : Number.POSITIVE_INFINITY;
    const bp = pinIndex.has(b.key) ? pinIndex.get(b.key) : Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return new Date(b.lastAt) - new Date(a.lastAt);
  });
}

/** General first, then pinned channels, then server sort order. */
export function sortProjectChannels(channels, pinnedIds) {
  const pinIndex = new Map(pinnedIds.map((id, i) => [id, i]));
  return [...channels].sort((a, b) => {
    if (a.is_general && !b.is_general) return -1;
    if (b.is_general && !a.is_general) return 1;
    const ap = pinIndex.has(a.id) ? pinIndex.get(a.id) : Number.POSITIVE_INFINITY;
    const bp = pinIndex.has(b.id) ? pinIndex.get(b.id) : Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}
