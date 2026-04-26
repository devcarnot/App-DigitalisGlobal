'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { isEmailAllowedForAdminDashboard } from '../../lib/admin-dashboard-access';

/**
 * Protects /admin route: redirect to /admin/login if not authenticated.
 */
const AdminGuard = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pendingUnauthorizedRedirect = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading || !supabase) return;
    if (!session) {
      if (pendingUnauthorizedRedirect.current) {
        router.replace(`/admin/login?reason=unauthorized&_=${Date.now()}`);
        pendingUnauthorizedRedirect.current = false;
      } else {
        router.replace('/admin/login');
      }
      return;
    }
    if (!isEmailAllowedForAdminDashboard(session.user?.email)) {
      pendingUnauthorizedRedirect.current = true;
      void supabase.auth.signOut();
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (!isEmailAllowedForAdminDashboard(session.user?.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">Signing out…</p>
      </div>
    );
  }

  return children;
};

export default AdminGuard;
