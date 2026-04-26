'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

function resetRedirectTo() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/erp/reset-password`;
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkReady, setLinkReady] = useState(false);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'link_expired') {
      setError(
        'That reset link has expired or was already used. Password reset links are one-time and time-limited — request a new one below.',
      );
    } else if (reason === 'auth_error') {
      setError('We could not complete the reset from that link. Try requesting a new password reset email.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined' || !supabase?.auth) return undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPhase('recover');
        setLinkReady(true);
      }
    });

    const raw = window.location.hash?.slice(1) || '';
    if (raw) {
      const hp = new URLSearchParams(raw);
      if (hp.get('error')) {
        const errCode = hp.get('error_code') || '';
        const desc = hp.get('error_description');
        window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
        if (errCode === 'otp_expired') {
          setError(
            'That reset link has expired or was already used. Request a new link below (and use it within about an hour).',
          );
        } else if (desc) {
          setError(decodeURIComponent(String(desc).replace(/\+/g, ' ')));
        } else {
          setError('That sign-in or reset link is invalid. Request a new password reset below.');
        }
        setPhase('request');
        return () => subscription.unsubscribe();
      }
      if (hp.get('type') === 'recovery') {
        setPhase('recover');
        setLinkReady(true);
      }
    }

    const qs = window.location.search || '';
    if (qs.includes('code=')) {
      setPhase('recover');
      setLinkReady(false);
    }

    let cancelled = false;
    const failOpen = window.setTimeout(() => {
      if (!cancelled) setLinkReady(true);
    }, 6000);

    (async () => {
      await supabase.auth.getSession();
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 50));
      await supabase.auth.getSession();
      if (cancelled) return;
      if (qs.includes('code=')) {
        setLinkReady(true);
      }
      const h = window.location.hash?.slice(1) || '';
      if (h) {
        const p = new URLSearchParams(h);
        if (p.get('type') === 'recovery' && p.get('access_token')) {
          setPhase('recover');
          setLinkReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(failOpen);
      subscription.unsubscribe();
    };
  }, []);

  async function sendResetLink(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    if (!supabase) {
      setError('Sign-in is not configured.');
      return;
    }
    setLoading(true);
    try {
      const redirectTo = resetRedirectTo();
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: redirectTo || undefined,
      });
      if (err) throw err;
      setPhase('sent');
      setInfo(
        'If that email is registered, you’ll get a message with a reset link shortly. Check Spam or Promotions if you don’t see it.',
      );
    } catch (err) {
      setError(err.message || 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  }

  async function saveNewPassword(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      await supabase.auth.signOut();
      setPhase('done');
      setInfo('Your password was updated. You can sign in with your new password.');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (err) {
      setError(err.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'done') {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50">
        <p className="text-slate-700 text-sm mb-6">{info}</p>
        <Link
          href="/erp/login"
          className="block w-full text-center rounded-xl bg-gradient-to-r from-neutral-700 to-neutral-500 py-3 font-semibold text-white shadow-md"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (phase === 'sent') {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50">
        <h1 className="text-xl font-bold text-slate-900 mb-3">Check your email</h1>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">{info}</p>
        <Link href="/erp/login" className="text-sm font-semibold text-neutral-900 hover:text-black">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  if (phase === 'recover' && !linkReady) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50 text-center">
        <div className="w-10 h-10 border-2 border-neutral-500 border-t-neutral-900 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600 text-sm">Confirming your reset link…</p>
      </div>
    );
  }

  if (phase === 'recover') {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-700 to-neutral-500 bg-clip-text text-transparent mb-1">
          Set new password
        </h1>
        <p className="text-slate-600 text-sm mb-6">Choose a new password for your Digitalis Global workspace account.</p>
        <form onSubmit={saveNewPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">New password (min 8 characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-400/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-400/20"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-neutral-700 to-neutral-500 py-3 font-semibold text-white disabled:opacity-50 shadow-md"
          >
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
        <Link href="/erp/login" className="mt-6 block text-center text-sm text-neutral-900 hover:text-black font-medium">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50">
      <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-700 to-neutral-500 bg-clip-text text-transparent mb-1">
        Reset password
      </h1>
      <p className="text-slate-600 text-sm mb-6">
        Enter the email you use for the workspace. We will send you a link to choose a new password.
      </p>
      <form onSubmit={sendResetLink} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-400/20"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-neutral-700 to-neutral-500 py-3 font-semibold text-white disabled:opacity-50 shadow-md"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <Link href="/erp/login" className="mt-6 block text-center text-sm text-neutral-900 hover:text-black font-medium">
        ← Back to sign in
      </Link>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Suspense
        fallback={
          <div className="w-10 h-10 border-2 border-neutral-500 border-t-neutral-900 rounded-full animate-spin" />
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
