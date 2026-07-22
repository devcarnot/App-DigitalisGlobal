import { supabase } from './supabase';

/** Serialize auth token resolution so parallel ERP boot requests do not race refreshSession(). */
let authLockTail = Promise.resolve();

export function withSupabaseAuthLock(fn) {
  const run = authLockTail.then(() => fn());
  authLockTail = run.catch(() => {});
  return run;
}

/**
 * Resolve a bearer token for API calls. Prefer local session; refresh once when missing.
 * Wrapped in a lock to avoid refresh-token rotation races after sign-in.
 */
export async function resolveSupabaseAccessToken() {
  if (!supabase?.auth) return null;

  return withSupabaseAuthLock(async () => {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }

    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshed?.session?.access_token) {
      return refreshed.session.access_token;
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return null;
    }

    ({
      data: { session },
    } = await supabase.auth.getSession());
    return session?.access_token ?? null;
  });
}

/** Poll briefly after password sign-in until the session is readable from storage. */
export async function waitForPersistedSupabaseSession(seedSession, { attempts = 10, baseDelayMs = 80 } = {}) {
  if (seedSession?.access_token) return seedSession;
  if (!supabase?.auth) return null;

  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return session;
  }
  return null;
}
