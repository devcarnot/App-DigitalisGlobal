/** After Supabase returns 429 on /auth/v1/*, block manual refresh attempts. */
let authRefreshBlockedUntil = 0;

export function markAuthRefreshRateLimited(blockMs = 120_000) {
  authRefreshBlockedUntil = Date.now() + blockMs;
}

export function isAuthRefreshRateLimited() {
  return Date.now() < authRefreshBlockedUntil;
}

/** Wrap fetch so 429s on Supabase auth endpoints trigger client-side backoff. */
export function wrapFetchForSupabaseAuthRateLimit(baseFetch = fetch) {
  const bound = baseFetch.bind(globalThis);
  return async (input, init) => {
    const res = await bound(input, init);
    try {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      if (res.status === 429 && /\/auth\/v1\//.test(url)) {
        markAuthRefreshRateLimited();
      }
    } catch {
      /* ignore */
    }
    return res;
  };
}
