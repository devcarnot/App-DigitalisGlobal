'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { completeOAuthCallback } from '../../../../lib/auth-oauth-client';
import { waitForPersistedSupabaseSession } from '../../../../lib/supabase-auth-lock';

/**
 * Landing page after OAuth (e.g. Google). Exchanges the PKCE code and restores the session.
 */
export default function ErpAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await completeOAuthCallback();
      if (cancelled) return;
      if (result.ok) {
        router.replace('/erp/dashboard');
        return;
      }

      const recovered = await waitForPersistedSupabaseSession(null, { attempts: 10, baseDelayMs: 150 });
      if (cancelled) return;
      if (recovered?.access_token) {
        router.replace('/erp/dashboard');
        return;
      }

      router.replace(`/erp/login?error=${encodeURIComponent(result.error || 'Sign-in failed')}`);
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
