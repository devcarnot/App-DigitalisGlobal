/** After Supabase returns 429 on /auth/v1/*, block refresh attempts. */
let authRefreshBlockedUntil = 0;

export function markAuthRefreshRateLimited(blockMs = 300_000) {
  authRefreshBlockedUntil = Date.now() + blockMs;
}

export function isAuthRefreshRateLimited() {
  return Date.now() < authRefreshBlockedUntil;
}

/**
 * Stop refresh storms: clear local auth storage and notify the app shell.
 * Called when Supabase returns 429 on /auth/v1/token (refresh_token grant).
 */
export function haltAuthRefreshAfterRateLimit(blockMs = 300_000) {
  markAuthRefreshRateLimited(blockMs);
  if (typeof window === 'undefined') return;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.includes('auth')) {
        window.localStorage.removeItem(key);
      }
    }
    window.dispatchEvent(new CustomEvent('erp-auth-rate-limited'));
  } catch {
    /* ignore quota errors */
  }
}

/** Wrap fetch so 429s on token refresh halt further auth network calls. */
export function wrapFetchForSupabaseAuthRateLimit(baseFetch = fetch) {
  const bound = baseFetch.bind(globalThis);
  return async (input, init) => {
    const res = await bound(input, init);
    try {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      if (res.status === 429 && /\/auth\/v1\/token/.test(url)) {
        haltAuthRefreshAfterRateLimit();
      } else if (res.status === 429 && /\/auth\/v1\//.test(url)) {
        markAuthRefreshRateLimited();
      }
    } catch {
      /* ignore */
    }
    return res;
  };
}
