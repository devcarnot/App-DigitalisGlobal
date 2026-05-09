import { supabase } from './supabase';

/**
 * Process-wide cache for signed Supabase Storage URLs.
 *
 * Avatars, message attachments, project files etc. all sit in the
 * `erp-files` bucket and are surfaced via short-lived signed URLs. Without a
 * cache, the same `path` may produce dozens of redundant `createSignedUrl`
 * round-trips (e.g. one per avatar across the chat list, member picker,
 * sidebar, etc.). This helper de-duplicates both *cached* hits and
 * *in-flight* requests, so 30 simultaneous mounts result in a single network
 * call.
 *
 * - Default TTL is 50 minutes; signed URLs expire at 60 minutes.
 * - Negative cache for missing paths is 60 seconds — short enough that a
 *   freshly uploaded file becomes visible quickly without hammering the API.
 */

const DEFAULT_TTL_MS = 50 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000;

const cache = new Map(); // key -> { url, expiresAt }
const inflight = new Map(); // key -> Promise<string|null>

function cacheKey(bucket, path) {
  return `${bucket}::${path}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.url;
}

/**
 * Returns a signed URL for `path` in `bucket`, using the in-memory cache
 * when available. Returns `null` if the underlying API errors (so callers
 * can fall back to initials/placeholder UI).
 */
export async function getCachedSignedUrl(path, { bucket = 'erp-files', expiresIn = 3600 } = {}) {
  if (!path) return null;
  const key = cacheKey(bucket, path);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) {
        cache.set(key, { url: null, expiresAt: Date.now() + NEGATIVE_TTL_MS });
        return null;
      }
      cache.set(key, {
        url: data.signedUrl,
        expiresAt: Date.now() + DEFAULT_TTL_MS,
      });
      return data.signedUrl;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Synchronous lookup used to prime React state without a flicker. */
export function readCachedSignedUrl(path, { bucket = 'erp-files' } = {}) {
  if (!path) return undefined;
  return readCache(cacheKey(bucket, path));
}
