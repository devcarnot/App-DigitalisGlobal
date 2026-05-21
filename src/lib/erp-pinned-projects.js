// Per-user pinned projects on the projects grid (device-local, like recent visits).

const STORAGE_PREFIX = 'erp-pinned-projects:';
const MAX_PINNED = 30;

function storageKey(userId) {
  if (!userId) return null;
  return `${STORAGE_PREFIX}${userId}`;
}

function safeReadList(userId) {
  if (typeof window === 'undefined') return [];
  const key = storageKey(userId);
  if (!key) return [];
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

function safeWriteList(userId, list) {
  if (typeof window === 'undefined') return;
  const key = storageKey(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_PINNED)));
  } catch {
    /* ignore */
  }
}

/** @returns {string[]} project ids in pin order (first = top) */
export function readPinnedProjects(userId) {
  return safeReadList(userId);
}

export function isProjectPinned(userId, projectId, pinnedList) {
  const list = pinnedList ?? readPinnedProjects(userId);
  return list.includes(projectId);
}

/** Pin to top; returns new list. */
export function pinProject(userId, projectId) {
  if (!userId || !projectId) return readPinnedProjects(userId);
  const list = safeReadList(userId).filter((id) => id !== projectId);
  list.unshift(projectId);
  safeWriteList(userId, list);
  return list.slice(0, MAX_PINNED);
}

/** @returns {string[]} new list */
export function unpinProject(userId, projectId) {
  if (!userId || !projectId) return readPinnedProjects(userId);
  const list = safeReadList(userId).filter((id) => id !== projectId);
  safeWriteList(userId, list);
  return list;
}

export function togglePinProject(userId, projectId) {
  if (!userId || !projectId) return readPinnedProjects(userId);
  const list = safeReadList(userId);
  if (list.includes(projectId)) return unpinProject(userId, projectId);
  return pinProject(userId, projectId);
}

export function subscribePinnedProjects(userId, cb) {
  if (typeof window === 'undefined' || !userId || typeof cb !== 'function') {
    return () => {};
  }
  const key = storageKey(userId);
  if (!key) return () => {};
  const handler = (event) => {
    if (event.key !== key) return;
    cb(safeReadList(userId));
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
