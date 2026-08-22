import { getOAuthCallbackRedirectTo } from './auth-redirect';
import { erpAuthorizedFetch } from './erp-client-api';
import { notifyLoginAfterSignIn } from './notify-login-client';
import { isDigitalisDesktop } from './digitalis-desktop';
import { supabase } from './supabase';
import { waitForPersistedSupabaseSession } from './supabase-auth-lock';

/** Prevent duplicate PKCE exchange when React Strict Mode remounts the callback page. */
let oauthCallbackPromise = null;

function oauthWaitTimeoutMs() {
  return isDigitalisDesktop() ? 15000 : 8000;
}

function oauthPersistWaitOptions() {
  return isDigitalisDesktop() ? { attempts: 20, baseDelayMs: 150 } : undefined;
}

function readOAuthErrorFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    params.get('error_description') ||
    params.get('error') ||
    hashParams.get('error_description') ||
    hashParams.get('error') ||
    ''
  );
}

/**
 * Start Google OAuth (PKCE). Redirects the browser to Google when successful.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function startGoogleOAuthSignIn() {
  if (!supabase?.auth?.signInWithOAuth) {
    return {
      ok: false,
      error:
        'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.',
    };
  }

  const redirectTo = getOAuthCallbackRedirectTo();
  if (!redirectTo) {
    return {
      ok: false,
      error: 'This deployment is missing NEXT_PUBLIC_SITE_URL. OAuth cannot redirect back here.',
    };
  }

  const desktop = isDigitalisDesktop();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'email profile openid',
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
      ...(desktop ? { skipBrowserRedirect: true } : {}),
    },
  });

  if (error) return { ok: false, error: error.message };
  if (desktop) {
    if (!data?.url) {
      return {
        ok: false,
        error: 'Google sign-in could not start. Enable Google under Supabase → Authentication → Providers.',
      };
    }
    window.location.assign(data.url);
    return { ok: true };
  }
  // Browser redirects to Google automatically.
  return { ok: true };
}

function stripOAuthParamsFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, next);
  } catch {
    /* ignore */
  }
}

function isPkceVerifierError(message) {
  return /pkce|code verifier/i.test(String(message || ''));
}

/** Wait for Supabase auto URL detection (detectSessionInUrl) to finish the PKCE exchange. */
async function waitForOAuthSignedInSession({ timeoutMs = 8000 } = {}) {
  if (!supabase?.auth) return null;

  const existing = (await supabase.auth.getSession()).data.session;
  if (existing?.access_token) return existing;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session) => {
      if (settled) return;
      settled = true;
      subscription?.unsubscribe();
      clearTimeout(timer);
      resolve(session?.access_token ? session : null);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.access_token) {
        finish(session);
      }
    });

    const timer = setTimeout(async () => {
      const persisted = await waitForPersistedSupabaseSession(null, { attempts: 12, baseDelayMs: 120 });
      finish(persisted);
    }, timeoutMs);
  });
}

async function resolveOAuthSessionFromCallback() {
  const code =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null;

  if (!code) {
    return (await supabase.auth.getSession()).data.session;
  }

  // detectSessionInUrl handles the exchange during initialize — never call exchangeCodeForSession manually.
  if (typeof supabase.auth.initialize === 'function') {
    const { error } = await supabase.auth.initialize();
    if (error && !isPkceVerifierError(error.message)) {
      throw error;
    }
  }

  const session = await waitForOAuthSignedInSession({ timeoutMs: oauthWaitTimeoutMs() });
  if (session?.access_token) return session;

  return (await supabase.auth.getSession()).data.session;
}

/**
 * Finish OAuth on /erp/auth/callback: exchange PKCE code, restore session, notify login.
 * @returns {Promise<{ ok: true, session: import('@supabase/supabase-js').Session } | { ok: false, error: string }>}
 */
export async function completeOAuthCallback() {
  if (oauthCallbackPromise) return oauthCallbackPromise;

  oauthCallbackPromise = (async () => {
    if (!supabase?.auth) {
      return { ok: false, error: 'Supabase is not configured.' };
    }

    const oauthErr = readOAuthErrorFromUrl();
    if (oauthErr) return { ok: false, error: oauthErr };

    try {
      const session = await resolveOAuthSessionFromCallback();
      if (!session?.access_token) {
        return { ok: false, error: 'Could not complete sign-in. Try again.' };
      }

      const persisted = await waitForPersistedSupabaseSession(session, oauthPersistWaitOptions());
      if (!persisted?.access_token) {
        return {
          ok: false,
          error: 'Could not save your sign-in in this browser. Clear site data and try again.',
        };
      }

      stripOAuthParamsFromUrl();

      try {
        await erpAuthorizedFetch('/api/erp/me/ensure-profile', { method: 'POST', body: '{}' });
      } catch {
        /* No profile yet — ErpLayoutClient shows invite / admin activation */
      }

      notifyLoginAfterSignIn(persisted.access_token, 'erp', persisted.user?.id);
      return { ok: true, session: persisted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || 'Sign-in failed');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token || isPkceVerifierError(message)) {
        const recovered =
          session?.access_token ||
          (await waitForOAuthSignedInSession({ timeoutMs: isDigitalisDesktop() ? 5000 : 2000 })) ||
          (await waitForPersistedSupabaseSession(null, oauthPersistWaitOptions()));
        if (recovered?.access_token) {
          stripOAuthParamsFromUrl();
          notifyLoginAfterSignIn(recovered.access_token, 'erp', recovered.user?.id);
          return { ok: true, session: recovered };
        }
      }
      return { ok: false, error: isPkceVerifierError(message) ? 'Could not complete sign-in. Try again.' : message };
    }
  })();

  return oauthCallbackPromise;
}
