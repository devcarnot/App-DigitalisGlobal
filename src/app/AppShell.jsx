'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DevHmrNoiseFilter from '../components/DevHmrNoiseFilter';
import ScrollToTop from './ScrollToTop';
import WindowFileDropGuard from '../components/WindowFileDropGuard';

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

/**
 * If Site URL pointed recovery emails at "/" (marketing home), PKCE sends `?code=`
 * or legacy sends `#type=recovery`. Forward to `/erp/reset-password` where Supabase
 * completes the exchange and our UI runs.
 */
function RecoveryLandingRedirect() {
  const pathname = usePathname() || '';
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMarketingHome = pathname === '/' || pathname === '';
    if (!isMarketingHome) return;

    const { search, hash } = window.location;
    const qs = search.startsWith('?') ? search.slice(1) : search;
    const sp = new URLSearchParams(qs);

    if (sp.has('code')) {
      router.replace(`/erp/reset-password${search}${hash}`);
      return;
    }
    if (hash && hash.length > 2) {
      const hp = new URLSearchParams(hash.slice(1));
      if (hp.get('type') === 'recovery') {
        router.replace(`/erp/reset-password${search}${hash}`);
      }
    }
  }, [pathname, router]);

  return null;
}

export default function AppShell({ children }) {
  return (
    <>
      {process.env.NODE_ENV === 'development' ? <DevHmrNoiseFilter /> : null}
      <RecoveryLandingRedirect />
      <SupabaseAuthHashErrors />
      <ScrollToTop />
      <WindowFileDropGuard />
      {children}
    </>
  );
}
