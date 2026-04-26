'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { notifyLoginAfterSignIn } from '../../../lib/notify-login-client';

export default function ErpLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        return;
      }
      if (data?.session?.access_token) {
        notifyLoginAfterSignIn(data.session.access_token, 'erp');
      }
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
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: origin ? `${origin}/erp/reset-password` : undefined,
      });
      if (err) throw err;
      setResetMsg('If an account exists for that email, we sent a reset link. Check spam or promotions if you do not see it.');
    } catch (err) {
      setError(err.message || 'Could not send reset email.');
    } finally {
      setResetSending(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-slate-50">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_100%_70%_at_50%_-20%,rgba(88,156,213,0.12),transparent_50%)]" />
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/50">
        <img
          src="/Digitalis_logo_black.png"
          alt="Digitalis"
          className="h-10 w-auto object-contain object-left mb-2"
        />
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-[#589CD5]/60 focus:ring-2 focus:ring-[#589CD5]/15"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-xs font-medium text-slate-600">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetSending}
                className="text-xs font-semibold text-[#589CD5] hover:text-[#3d7fb8] disabled:opacity-50"
              >
                {resetSending ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-12 py-3 text-slate-900 outline-none focus:border-[#589CD5]/60 focus:ring-2 focus:ring-[#589CD5]/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#589CD5]/25"
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
          {resetMsg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3 py-2">{resetMsg}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-[#589CD5] to-[#52C4C9] py-3 font-semibold text-white shadow-md hover:opacity-95 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href="/erp/reset-password" className="font-semibold text-[#589CD5] hover:text-[#3d7fb8]">
            Reset password
          </Link>
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-[#589CD5] hover:text-[#3d7fb8] font-medium">
          ← Back to website
        </Link>
      </div>
    </div>
  );
}
