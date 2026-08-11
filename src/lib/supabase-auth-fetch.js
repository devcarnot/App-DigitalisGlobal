/** After Supabase returns 429 on /auth/v1/*, skip extra refresh attempts for a while. */
let authRefreshBlockedUntil = 0;

export function markAuthRefreshRateLimited(blockMs = 120_000) {
  authRefreshBlockedUntil = Date.now() + blockMs;
}

export function isAuthRefreshRateLimited() {
  return Date.now() < authRefreshBlockedUntil;
}

/** Remove Supabase auth keys from localStorage (no network: safe before sign-in). */
export function clearLocalSupabaseAuthStorage() {
  if (typeof window === 'undefined') return;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.includes('auth')) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}
