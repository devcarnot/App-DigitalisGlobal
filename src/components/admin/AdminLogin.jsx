'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { notifyLoginAfterSignIn } from '../../lib/notify-login-client';
import { isEmailAllowedForAdminDashboard } from '../../lib/admin-dashboard-access';

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-200">
          <p className="text-red-600">Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local</p>
        </div>
      </div>
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-slate-100 to-sky-50 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-300/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          {/* Header strip - Digitalis gradient */}
          <div className="h-2 bg-gradient-to-r from-[#589CD5] to-[#52C4C9]" />

          <div className="p-8 sm:p-10">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <img
                src="/Digitalis_logo_black.png"
                alt="Digitalis Global"
                className="h-12 sm:h-14 w-auto object-contain"
              />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 text-center mb-1">
              Admin sign in
            </h1>
            <p className="text-slate-500 text-sm text-center mb-8">
              Use your account to access the dashboard.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="admin-signin-email">
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
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 bg-slate-50/50 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="admin-signin-password">
                  Password
                </label>
                <div className="relative">
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
                    className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 bg-slate-50/50 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-[#589CD5] to-[#52C4C9] hover:opacity-95 shadow-lg shadow-[#589CD5]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
