'use client';

import React, { useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, supabaseConfigured } from '../../../lib/supabase';
import { getPasswordResetRedirectTo } from '../../../lib/auth-redirect';
import { startGoogleOAuthSignIn } from '../../../lib/auth-oauth-client';
import { notifyLoginAfterSignIn } from '../../../lib/notify-login-client';
import { waitForPersistedSupabaseSession, isAccessTokenExpired } from '../../../lib/supabase-auth-lock';
import { clearLocalSupabaseAuthStorage } from '../../../lib/supabase-auth-fetch';
import ErpAuthPageShell, {
  ERP_AUTH_FIELD_CLASS,
  ERP_AUTH_LABEL_CLASS,
  ERP_AUTH_LINK_CLASS,
  ERP_AUTH_PASSWORD_FIELD_CLASS,
  ERP_AUTH_PRIMARY_BUTTON_CLASS,
} from '../../../components/erp/ErpAuthPageShell';

export default function ErpLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useLayoutEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token && isAccessTokenExpired(session.access_token, 0)) {
        clearLocalSupabaseAuthStorage();
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) {
        session = await waitForPersistedSupabaseSession(null, { attempts: 8, baseDelayMs: 120 });
      }
      if (session?.access_token && !isAccessTokenExpired(session.access_token, 0)) {
        router.replace('/erp/dashboard');
        return;
      }

      try {
        const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const err = q?.get('error');
        if (!err) return;
        const decoded = decodeURIComponent(err.replace(/\+/g, ' '));
        if (/pkce|code verifier/i.test(decoded)) {
          const recovered = await waitForPersistedSupabaseSession(null, { attempts: 10, baseDelayMs: 150 });
          if (recovered?.access_token && !isAccessTokenExpired(recovered.access_token, 0)) {
            router.replace('/erp/dashboard');
            return;
          }
          setError('Google sign-in could not be completed. Please try again.');
          return;
        }
        setError(decoded);
      } catch {
        /* ignore malformed query */
      }
    })();
  }, [router]);

  async function handleGoogleSignIn() {
    setError('');
    setGoogleSubmitting(true);
    try {
      const result = await startGoogleOAuthSignIn();
      if (!result.ok) setError(result.error);
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      clearLocalSupabaseAuthStorage();
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        if (/429|rate|too many/i.test(String(err.message || ''))) {
          setError('Too many sign-in attempts right now. Wait 1 to 2 minutes, then try again.');
        } else {
          setError(err.message);
        }
        return;
      }
      const persisted = await waitForPersistedSupabaseSession(data?.session);
      if (!persisted?.access_token) {
        setError(
          'Sign-in worked but the session could not be saved in this browser. Clear site data for Digitalis and try again, or use another browser.',
        );
        return;
      }
      notifyLoginAfterSignIn(persisted.access_token, 'erp', persisted.user?.id);
      router.replace('/erp/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    setResetMsg('');
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email above, then click “Forgot password?”.');
      return;
    }
    if (!supabase) return;
    setResetSending(true);
    try {
      const redirectTo = getPasswordResetRedirectTo();
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: redirectTo || undefined,
      });
      if (err) throw err;
      setResetMsg('If an account exists for that email, we sent a reset link. Check spam or promotions if you do not see it.');
    } catch (err) {
      setError(err.message || 'Could not send reset email.');
    } finally {
      setResetSending(false);
    }
  }

  if (!supabaseConfigured) {
    return (
      <ErpAuthPageShell
        eyebrow="Workspace sign-in"
        title="Sign-in unavailable"
        description="This deployment is missing Supabase configuration. Contact your administrator."
      >
        <p className="mt-6 text-sm text-red-600">
          NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set on the server.
        </p>
      </ErpAuthPageShell>
    );
  }

  return (
    <ErpAuthPageShell
      eyebrow="Workspace sign-in"
      title="Sign in to workspace"
      description="Projects, tasks, and team chat in one secure place."
      footer={
        <p className="mt-8 text-center text-sm text-slate-600">
          Need a manual reset instead?{' '}
          <Link href="/erp/reset-password" className={ERP_AUTH_LINK_CLASS}>
            Reset password
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} method="post" autoComplete="on" className="mt-8 space-y-5">
        <div>
          <label htmlFor="erp-login-email" className={ERP_AUTH_LABEL_CLASS}>
            Email
          </label>
          <input
            id="erp-login-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="erp-login-password" className={ERP_AUTH_LABEL_CLASS}>
              Password
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetSending}
              className={`text-xs ${ERP_AUTH_LINK_CLASS} disabled:no-underline disabled:opacity-50`}
            >
              {resetSending ? 'Sending…' : 'Forgot password?'}
            </button>
          </div>
          <div className="relative">
            <input
              id="erp-login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={ERP_AUTH_PASSWORD_FIELD_CLASS}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#103D4D]/25"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {resetMsg ? (
          <p className="rounded-xl border border-emerald-200/90 bg-emerald-50 px-3.5 py-2.5 text-sm leading-snug text-emerald-900">
            {resetMsg}
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={submitting || googleSubmitting} className={ERP_AUTH_PRIMARY_BUTTON_CLASS}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="relative pt-4">
          <div className="absolute inset-x-0 top-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={googleSubmitting || submitting}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {googleSubmitting ? 'Redirecting…' : 'Continue with Google'}
        </button>
      </form>
    </ErpAuthPageShell>
  );
}
