/**
 * Session-scoped in-memory cache for ERP list surfaces.
 * Survives Next.js client navigations so returning to a page can show stale data
 * immediately while a background fetch revalidates (same idea as project chat channels).
 */

/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const memory = new Map();

/** @template T */
export function readErpDataCache(key) {
  return memory.get(key)?.data ?? null;
}

export function hasErpDataCache(key) {
  return memory.has(key);
}

/** @template T */
export function writeErpDataCache(key, data) {
  memory.set(key, { data, fetchedAt: Date.now() });
}

export function invalidateErpDataCache(key) {
  memory.delete(key);
}

export function invalidateErpDataCachePrefix(prefix) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

/** @template T @param {string | null | undefined} key @param {(cached: unknown) => T} picker @param {T} fallback */
export function pickErpCache(key, picker, fallback) {
  if (!key) return fallback;
  const cached = readErpDataCache(key);
  if (cached == null) return fallback;
  try {
    return picker(cached);
  } catch {
    return fallback;
  }
}

/** @param {string | null | undefined} key */
export function erpCacheInitialLoading(key) {
  return Boolean(key) && !hasErpDataCache(key);
}

/** Coerce unknown cached values to a safe array (prevents `.map` / `.filter` crashes). */
export function ensureErpCacheArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

/**
 * Read a list field from cache, always returning an array.
 * @template T
 */
export function pickErpCacheArray(key, field, fallback = []) {
  return pickErpCache(
    key,
    (cached) => {
      const c = cached && typeof cached === 'object' ? cached : {};
      return ensureErpCacheArray(c[field], fallback);
    },
    fallback,
  );
}

/**
 * Hydrate UI from cache when revisiting a page; otherwise show loading.
 * @param {string | null | undefined} key
 * @param {(cached: unknown) => void} applyCached
 * @param {(loading: boolean) => void} setLoading
 */
export function beginErpCachedLoad(key, applyCached, setLoading) {
  if (!key) {
    setLoading(true);
    return;
  }
  if (hasErpDataCache(key)) {
    applyCached(readErpDataCache(key));
    setLoading(false);
  } else {
    setLoading(true);
  }
}
