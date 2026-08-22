import { getOAuthCallbackRedirectTo } from './auth-redirect';
import { erpAuthorizedFetch } from './erp-client-api';
import { notifyLoginAfterSignIn } from './notify-login-client';
import { supabase } from './supabase';
import { waitForPersistedSupabaseSession } from './supabase-auth-lock';

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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'email profile openid',
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
      skipBrowserRedirect: true,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.url) {
    return {
      ok: false,
      error: 'Google sign-in could not start. Enable Google under Supabase → Authentication → Providers.',
    };
  }

  window.location.assign(data.url);
  return { ok: true };
}

/**
 * Finish OAuth on /erp/auth/callback: exchange PKCE code, restore session, notify login.
 * @returns {Promise<{ ok: true, session: import('@supabase/supabase-js').Session } | { ok: false, error: string }>}
 */
export async function completeOAuthCallback() {
  if (!supabase?.auth) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const oauthErr = readOAuthErrorFromUrl();
  if (oauthErr) return { ok: false, error: oauthErr };

  const code =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null;

  if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, error: error.message };
  } else if (typeof supabase.auth.initialize === 'function') {
    const { error } = await supabase.auth.initialize();
    if (error) return { ok: false, error: error.message || 'Sign-in failed' };
  }

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();

  if (sessErr) return { ok: false, error: sessErr.message };

  const persisted = await waitForPersistedSupabaseSession(session);
  if (!persisted?.access_token) {
    return {
      ok: false,
      error: 'Could not save your sign-in in this browser. Clear site data and try again.',
    };
  }

  try {
    await erpAuthorizedFetch('/api/erp/me/ensure-profile', { method: 'POST', body: '{}' });
  } catch {
    /* No profile yet — ErpLayoutClient shows invite / admin activation */
  }

  notifyLoginAfterSignIn(persisted.access_token, 'erp', persisted.user?.id);
  return { ok: true, session: persisted };
}
