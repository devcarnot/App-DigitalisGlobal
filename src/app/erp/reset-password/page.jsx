'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { getPasswordResetRedirectTo } from '../../../lib/auth-redirect';
import ErpAuthPageShell, {
  ERP_AUTH_FIELD_CLASS,
  ERP_AUTH_LABEL_CLASS,
  ERP_AUTH_LINK_CLASS,
  ERP_AUTH_PRIMARY_BUTTON_CLASS,
} from '../../../components/erp/ErpAuthPageShell';
import ErpAuthFaviconLoader from '../../../components/erp/ErpAuthFaviconLoader';

function ResetPasswordFallback() {
  return (
    <ErpAuthPageShell eyebrow="Workspace">
      <div className="mt-12 flex justify-center pb-4">
        <ErpAuthFaviconLoader size={52} />
      </div>
    </ErpAuthPageShell>
  );
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
      const redirectTo = getPasswordResetRedirectTo();
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

  const signInFooter = (
    <p className="mt-8 text-center text-sm text-slate-600">
      <Link href="/erp/login" className={ERP_AUTH_LINK_CLASS}>
        Sign in
      </Link>
    </p>
  );

  if (phase === 'done') {
    return (
      <ErpAuthPageShell
        eyebrow="Workspace"
        title="You're all set"
        description={info}
        footer={
          <Link href="/erp/login" className={`mt-8 block text-center ${ERP_AUTH_PRIMARY_BUTTON_CLASS}`}>
            Go to sign in
          </Link>
        }
      />
    );
  }

  if (phase === 'sent') {
    return (
      <ErpAuthPageShell eyebrow="Workspace" title="Check your email" description={info} footer={signInFooter} />
    );
  }

  if (phase === 'recover' && !linkReady) {
    return (
      <ErpAuthPageShell eyebrow="Workspace" title="Confirming your link" description="Almost there — verifying your reset link.">
        <div className="mt-10 flex justify-center">
          <ErpAuthFaviconLoader size={52} />
        </div>
      </ErpAuthPageShell>
    );
  }

  if (phase === 'recover') {
    return (
      <ErpAuthPageShell
        eyebrow="Workspace"
        title="Set new password"
        description="Choose a new password for your Digitalis Global workspace account."
        footer={signInFooter}
      >
        <form onSubmit={saveNewPassword} className="mt-8 space-y-5">
          <div>
            <label htmlFor="reset-pw-new" className={ERP_AUTH_LABEL_CLASS}>
              New password (min 8 characters)
            </label>
            <input
              id="reset-pw-new"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
            />
          </div>
          <div>
            <label htmlFor="reset-pw-confirm" className={ERP_AUTH_LABEL_CLASS}>
              Confirm password
            </label>
            <input
              id="reset-pw-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={loading} className={ERP_AUTH_PRIMARY_BUTTON_CLASS}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </ErpAuthPageShell>
    );
  }

  return (
    <ErpAuthPageShell
      eyebrow="Workspace"
      title="Reset password"
      description="Enter the email you use for the workspace. We’ll send you a link to choose a new password."
      footer={signInFooter}
    >
      <form onSubmit={sendResetLink} className="mt-8 space-y-5">
        <div>
          <label htmlFor="reset-pw-email" className={ERP_AUTH_LABEL_CLASS}>
            Email
          </label>
          <input
            id="reset-pw-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={loading} className={ERP_AUTH_PRIMARY_BUTTON_CLASS}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </ErpAuthPageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
