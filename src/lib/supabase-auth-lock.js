import { supabase } from './supabase';
import {
  isAuthRefreshRateLimited,
  markAuthRefreshRateLimited,
} from './supabase-auth-fetch';

/** Minimum gap between explicit refresh attempts (auto-refresh still handled by SDK). */
const MIN_MANUAL_REFRESH_GAP_MS = 30_000;
let lastManualRefreshAt = 0;

/** Serialize auth token resolution so parallel ERP boot requests do not race. */
let authLockTail = Promise.resolve();

export function withSupabaseAuthLock(fn) {
  const run = authLockTail.then(() => fn());
  authLockTail = run.catch(() => {});
  return run;
}

export { isAuthRefreshRateLimited, markAuthRefreshRateLimited };

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

/**
 * Read bearer token from local session only — never calls refreshSession/getUser.
 * Supabase `autoRefreshToken` owns refresh; duplicate manual refresh caused 429 loops.
 */
export async function resolveSupabaseAccessToken() {
  if (!supabase?.auth) return null;

  return withSupabaseAuthLock(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  });
}

/**
 * Clear stale local auth on login screens so expired refresh tokens stop spamming Supabase.
 */
export async function clearExpiredLocalSupabaseSession() {
  if (!supabase?.auth) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return false;
  if (!isAccessTokenExpired(session.access_token, 0)) return false;
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* ignore */
  }
  return true;
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

/**
 * One throttled manual refresh — only used after a 401 when auto-refresh may not have caught up.
 */
export async function refreshSupabaseSessionThrottled() {
  if (!supabase?.auth) return null;
  if (isAuthRefreshRateLimited()) return null;

  const now = Date.now();
  if (now - lastManualRefreshAt < MIN_MANUAL_REFRESH_GAP_MS) {
    return null;
  }
  lastManualRefreshAt = now;

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    if (/429|rate|too many/i.test(String(error.message || ''))) {
      markAuthRefreshRateLimited();
    }
    return null;
  }
  return data?.session?.access_token ?? null;
}

/** After 401, wait briefly for SDK auto-refresh then re-read local session. */
export async function rereadSupabaseAccessTokenAfter401() {
  await sleep(900);
  const token = await resolveSupabaseAccessToken();
  if (token && !isAccessTokenExpired(token, 15)) return token;
  return refreshSupabaseSessionThrottled();
}
