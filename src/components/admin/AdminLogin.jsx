'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { notifyLoginAfterSignIn } from '../../lib/notify-login-client';
import { isEmailAllowedForAdminDashboard } from '../../lib/admin-dashboard-access';
import ErpAuthPageShell, {
  ERP_AUTH_LABEL_CLASS,
  ERP_AUTH_PASSWORD_FIELD_CLASS,
  ERP_AUTH_FIELD_CLASS,
  ERP_AUTH_PRIMARY_BUTTON_CLASS,
} from '../erp/ErpAuthPageShell';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** Brief readOnly blocks most browsers from injecting saved credentials on load. */
  const [autofillGate, setAutofillGate] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams?.get('from') || '/admin';
  const reason = searchParams?.get('reason');
  const queryKey = searchParams?.toString() ?? '';

  useEffect(() => {
    if (reason === 'unauthorized') {
      setError('This account is not allowed to access the admin dashboard.');
    }
  }, [reason]);

  const clearFields = useCallback(() => {
    setEmail('');
    setPassword('');
  }, []);

  // Empty fields on each visit; several passes beat late autofill.
  useEffect(() => {
    setAutofillGate(true);
    clearFields();
    const delays = [0, 50, 150, 400, 800];
    const timers = delays.map((ms) => window.setTimeout(clearFields, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [queryKey, clearFields]);

  // Drop cache-bust param so the address bar stays clean; keep from & reason.
  useEffect(() => {
    const sp = new URLSearchParams(queryKey);
    if (!sp.has('_')) return;
    sp.delete('_');
    const q = sp.toString();
    router.replace(q ? `/admin/login?${q}` : '/admin/login');
  }, [queryKey, router]);

  const unlockFields = useCallback(() => {
    setAutofillGate(false);
  }, []);

  if (!supabase) {
    return (
      <ErpAuthPageShell
        eyebrow="Admin"
        title="Configuration required"
        description="Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      >
        <p className="mt-8 text-center text-sm text-red-600">Cannot sign in until the app is configured.</p>
      </ErpAuthPageShell>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({ email, password });
      if (signError) throw signError;
      const signedEmail = data?.user?.email ?? data?.session?.user?.email;
      if (!isEmailAllowedForAdminDashboard(signedEmail)) {
        await supabase.auth.signOut();
        throw new Error('This account is not allowed to access the admin dashboard.');
      }
      if (data?.session?.access_token) {
        notifyLoginAfterSignIn(data.session.access_token, 'admin', data.user?.id);
      }
      setEmail('');
      setPassword('');
      router.replace(from);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErpAuthPageShell
      eyebrow="Admin dashboard"
      title="Admin sign in"
      description="Use your authorised account to open the dashboard."
    >
      <form onSubmit={handleSubmit} className="mt-8 space-y-5" autoComplete="off">
        <div>
          <label className={ERP_AUTH_LABEL_CLASS} htmlFor="admin-signin-email">
            Email
          </label>
          <input
            id="admin-signin-email"
            name="admin-signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={unlockFields}
            readOnly={autofillGate}
            required
            autoComplete="off"
            className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
          />
        </div>
        <div>
          <label className={ERP_AUTH_LABEL_CLASS} htmlFor="admin-signin-password">
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="admin-signin-password"
              name="admin-signin-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={unlockFields}
              readOnly={autofillGate}
              required
              autoComplete="off"
              className={ERP_AUTH_PASSWORD_FIELD_CLASS}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#103D4D]/25"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        ) : null}
        <button type="submit" disabled={loading} className={ERP_AUTH_PRIMARY_BUTTON_CLASS}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </ErpAuthPageShell>
  );
};

export default AdminLogin;
