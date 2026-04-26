'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DevHmrNoiseFilter from '../components/DevHmrNoiseFilter';
import ScrollToTop from './ScrollToTop';

function SupabaseAuthHashErrors() {
  const router = useRouter();
  const pathname = usePathname() || '/';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash;
    if (!raw || raw.length < 2) return;
    const params = new URLSearchParams(raw.slice(1));
    if (!params.get('error')) return;
    const err = params.get('error');
    const code = params.get('error_code') || '';
    if (err !== 'access_denied' && err !== 'server_error') return;
    const search = window.location.search || '';
    window.history.replaceState(null, '', `${pathname}${search}`);
    const dest = new URLSearchParams();
    dest.set('reason', code === 'otp_expired' ? 'link_expired' : 'auth_error');
    router.replace(`/erp/reset-password?${dest.toString()}`);
  }, [pathname, router]);

  return null;
}

export default function AppShell({ children }) {
  return (
    <>
      {process.env.NODE_ENV === 'development' ? <DevHmrNoiseFilter /> : null}
      <SupabaseAuthHashErrors />
      <ScrollToTop />
      {children}
    </>
  );
}
