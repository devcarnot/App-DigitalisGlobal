import { supabase } from './supabase';
import { erpAuthorizedFetch } from './erp-client-api';

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
const apiInflight = new Map(); // path -> Promise<string|null>

export function normalizeErpStoragePath(path) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) return '';
  return normalized;
}

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
  const safePath = normalizeErpStoragePath(path);
  if (!safePath) return null;
  const key = cacheKey(bucket, safePath);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(safePath, expiresIn);
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
  const safePath = normalizeErpStoragePath(path);
  if (!safePath) return undefined;
  return readCache(cacheKey(bucket, safePath));
}

/** Store a server-signed URL in the in-memory cache (e.g. after /api/erp/files/signed-url). */
export function primeCachedSignedUrl(path, url, { bucket = 'erp-files' } = {}) {
  const safePath = normalizeErpStoragePath(path);
  if (!safePath || !url) return;
  cache.set(cacheKey(bucket, safePath), {
    url,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

/**
 * Resolve a signed URL for ERP storage paths.
 * Chat/DM attachments should use `preferApi: true` so signing goes through the
 * server (service role) instead of client storage policies that often 400.
 */
export async function getErpFileSignedUrl(path, { bucket = 'erp-files', expiresIn = 3600, preferApi = false } = {}) {
  const safePath = normalizeErpStoragePath(path);
  if (!safePath) return null;

  const cached = readCachedSignedUrl(safePath, { bucket });
  if (cached !== undefined) return cached;

  if (preferApi) {
    const fromApi = await fetchErpFileSignedUrlViaApi(safePath, { bucket });
    if (fromApi) return fromApi;
  }

  const fromClient = await getCachedSignedUrl(safePath, { bucket, expiresIn });
  if (fromClient) return fromClient;

  if (!preferApi) {
    return fetchErpFileSignedUrlViaApi(safePath, { bucket });
  }

  return null;
}

async function fetchErpFileSignedUrlViaApi(path, { bucket = 'erp-files' } = {}) {
  const pending = apiInflight.get(path);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await erpAuthorizedFetch('/api/erp/files/signed-url', {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.signedUrl) {
        primeCachedSignedUrl(path, data.signedUrl, { bucket });
        return data.signedUrl;
      }
    } catch {
      /* ignore */
    }
    cache.set(cacheKey(bucket, path), { url: null, expiresAt: Date.now() + NEGATIVE_TTL_MS });
    return null;
  })();

  apiInflight.set(path, promise);
  try {
    return await promise;
  } finally {
    apiInflight.delete(path);
  }
}
