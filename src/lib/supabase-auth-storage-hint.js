/** Best-effort: Supabase persists session under `sb-…-auth-token` (shape varies slightly by SDK). */
export function hasLikelySupabaseAuthInLocalStorage() {
  if (typeof window === 'undefined') return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith('sb-')) continue;
      if (k.includes('auth-token')) return true;
    }
  } catch {
    /* ignore quota / opaque origins */
  }
  return false;
}
