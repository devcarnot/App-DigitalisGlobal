import { supabase } from './supabase';

/** Serialize auth token reads so parallel ERP boot requests do not race. */
let authLockTail = Promise.resolve();

export function withSupabaseAuthLock(fn) {
  const run = authLockTail.then(() => fn());
  authLockTail = run.catch(() => {});
  return run;
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(token, skewSeconds = 30) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() / 1000 >= payload.exp - skewSeconds;
}

/** Read bearer token from the local session: never calls refreshSession/getUser. */
export async function resolveSupabaseAccessToken() {
  if (!supabase?.auth) return null;

  return withSupabaseAuthLock(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** After 401, wait for Supabase auto-refresh then re-read the local session once. */
export async function rereadSupabaseAccessTokenAfter401() {
  await sleep(1200);
  return resolveSupabaseAccessToken();
}
