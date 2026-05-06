'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notifyLoginAfterSignIn } from '../../../../lib/notify-login-client';
import { supabase } from '../../../../lib/supabase';

/**
 * Landing page after OAuth (e.g. Google). Supabase Auth restores the PKCE/session from URL here.
 */
export default function ErpAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase?.auth?.initialize || !supabase?.auth?.getSession) return;
      const { error: initErr } = await supabase.auth.initialize();
      if (cancelled) return;
      if (initErr) {
        router.replace(`/erp/login?error=${encodeURIComponent(initErr.message || 'Sign-in failed')}`);
        return;
      }
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessErr) {
        router.replace(`/erp/login?error=${encodeURIComponent(sessErr.message)}`);
        return;
      }
      if (session?.access_token) {
        notifyLoginAfterSignIn(session.access_token, 'erp', session.user?.id);
        router.replace('/erp/dashboard');
      } else {
        router.replace(
          `/erp/login?error=${encodeURIComponent('Could not complete sign-in. Try again.')}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 text-center">
      <p className="text-sm font-semibold text-slate-700">Completing sign-in…</p>
      <p className="mt-2 text-xs text-slate-500">If this takes too long, close this window and try signing in again.</p>
    </div>
  );
}
