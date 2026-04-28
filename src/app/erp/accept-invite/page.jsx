'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [valid, setValid] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteHasProject, setInviteHasProject] = useState(null);
  const [inviteProjectName, setInviteProjectName] = useState(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [matchingSession, setMatchingSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    fetch(`/api/erp/invitations/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        setValid(data.valid === true);
        if (typeof data.email === 'string') setInviteEmail(data.email);
        if (data.valid === true) {
          setInviteHasProject(Boolean(data.hasProject));
          setInviteProjectName(typeof data.projectName === 'string' ? data.projectName : null);
        }
        if (!data.valid) setError(data.error || 'Invalid invitation');
      })
      .catch(() => setValid(false));
  }, [token]);

  useEffect(() => {
    if (valid !== true || !inviteEmail) {
      setSessionChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const invited = inviteEmail.trim().toLowerCase();
      const current = session?.user?.email?.trim().toLowerCase();
      setMatchingSession(Boolean(session?.access_token && current && current === invited));
      setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [valid, inviteEmail]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!token) return;

    const nameTrim = fullName.trim();
    const phoneTrim = phone.trim();
    if (nameTrim.length < 2) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }
    if (phoneTrim.length < 7 || phoneTrim.length > 40) {
      setError('Enter a valid phone number (7–40 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        token,
        fullName: nameTrim,
        phone: phoneTrim,
      };

      const headers = { 'Content-Type': 'application/json' };
      if (matchingSession) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Your session expired. Sign in with the invited email, or use the password field below after signing out.');
          return;
        }
        headers.Authorization = `Bearer ${session.access_token}`;
      } else {
        if (!password || password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }
        payload.password = password;
      }

      const res = await fetch('/api/erp/invitations/accept', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not accept invite');
        return;
      }

      if (matchingSession) {
        router.replace('/erp/dashboard?joined=1');
        return;
      }

      const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (signErr) {
        router.replace('/erp/login?invited=1');
        return;
      }
      if (signData.session?.access_token) {
        router.replace('/erp/dashboard');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (valid === null || (valid === true && !sessionChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-2 border-neutral-500 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || valid === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <p className="text-red-600 mb-4">{error || 'Invalid or expired invitation link.'}</p>
        <Link href="/erp/login" className="text-neutral-900 hover:text-black font-medium">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-700 to-neutral-500 bg-clip-text text-transparent">
          Accept invitation
        </h1>
        {inviteHasProject && inviteProjectName && (
          <p className="text-sm text-slate-700 mb-4">
            Project: <span className="font-medium text-neutral-800">{inviteProjectName}</span>
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
            <input
              type="email"
              readOnly
              value={inviteEmail}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-700 outline-none cursor-not-allowed"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-400/20"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={7}
              maxLength={40}
              placeholder="+1 555 123 4567"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-400/20"
              autoComplete="tel"
            />
          </div>
          {!matchingSession ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Password (min 8 characters)</label>
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
          ) : null}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-neutral-700 to-neutral-500 py-3 font-semibold text-white disabled:opacity-50 shadow-md"
          >
            {submitting ? 'Working…' : 'Join workspace'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500 leading-relaxed">
          <Link href="/erp/reset-password" className="font-semibold text-neutral-900 hover:text-black">
            Forgot your password?
          </Link>
          <span className="text-slate-300 mx-2">·</span>
          <Link href="/erp/login" className="font-semibold text-neutral-900 hover:text-black">
            Sign in
          </Link>
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-neutral-900 hover:text-black font-medium">
          ← Main site
        </Link>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-2 border-neutral-500 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
