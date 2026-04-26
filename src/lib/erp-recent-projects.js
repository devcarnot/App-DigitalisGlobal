// Per-device "recently opened" project tracker, backed by localStorage.
//
// We intentionally avoid a new DB table: the list is tiny, only meaningful
// to the current device, and the ERP already accumulates enough server state.
// One map per user id: { [projectId: string]: timestamp-in-ms }.

const STORAGE_PREFIX = 'erp-recent-projects:';
const MAX_ENTRIES = 50;

function storageKey(userId) {
  if (!userId) return null;
  return `${STORAGE_PREFIX}${userId}`;
}

function safeReadMap(userId) {
  if (typeof window === 'undefined') return {};
  const key = storageKey(userId);
  if (!key) return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Drop any non-number values just in case the storage got corrupted.
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function safeWriteMap(userId, map) {
  if (typeof window === 'undefined') return;
  const key = storageKey(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage full / disabled — nothing we can do, just drop silently.
  }
}

/**
 * Read the {projectId → timestamp} map for a user. Returns an empty object
 * when no history or running server-side.
 */
export function readRecentProjects(userId) {
  return safeReadMap(userId);
}

/**
 * Record that the user just opened the given project. The list is capped at
 * MAX_ENTRIES newest entries so localStorage doesn't grow forever.
 */
export function recordProjectVisit(userId, projectId) {
  if (!userId || !projectId || typeof window === 'undefined') return;
  const map = safeReadMap(userId);
  map[projectId] = Date.now();
  const entries = Object.entries(map);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b[1] - a[1]);
    const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    safeWriteMap(userId, trimmed);
  } else {
    safeWriteMap(userId, map);
  }
}

/**
 * Subscribe to cross-tab updates of the recent-projects map. `cb` is invoked
 * with the new map whenever another tab writes to localStorage. Returns an
 * unsubscribe function.
 */
export function subscribeRecentProjects(userId, cb) {
  if (typeof window === 'undefined' || !userId || typeof cb !== 'function') {
    return () => {};
  }
  const key = storageKey(userId);
  if (!key) return () => {};
  const handler = (event) => {
    if (event.key !== key) return;
    cb(safeReadMap(userId));
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
