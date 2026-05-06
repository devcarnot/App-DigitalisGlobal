'use client';

import React, { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { ErpSessionProvider, useErpSession } from './useErpSession';
import { ErpProjectTimerProvider } from './ErpProjectTimerContext';

function ErpShellChunkLoading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-50 via-cyan-50/90 to-violet-100/40 dark:from-slate-950 dark:via-[#081018] dark:to-[#051018]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(56,189,248,0.25),transparent_50%)] dark:opacity-40"
        aria-hidden
      />
      <div className="relative h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-teal-500 shadow-lg shadow-cyan-900/10 dark:border-cyan-800/50" />
    </div>
  );
}

const ErpShell = dynamic(() => import('./ErpShell'), {
  ssr: false,
  loading: ErpShellChunkLoading,
});

function ErpLayoutClientInner({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, loading } = useErpSession();
  const isPublic =
    pathname === '/erp/login' ||
    pathname === '/erp/accept-invite' ||
    pathname === '/erp/reset-password' ||
    pathname === '/erp/auth/callback';

  /** Signed-in users who land on the login screen (desktop default used to be /erp/login, bookmarks) → workspace */
  useEffect(() => {
    if (loading) return;
    if (pathname === '/erp/login' && session) {
      router.replace('/erp/dashboard');
    }
  }, [loading, pathname, session, router]);

  useEffect(() => {
    if (loading || isPublic) return;
    if (!session) {
      router.replace('/erp/login');
    }
  }, [loading, session, isPublic, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-br from-slate-50 via-cyan-50/90 to-violet-100/40 dark:from-slate-950 dark:via-[#081018] dark:to-[#051018]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(56,189,248,0.25),transparent_50%)] dark:opacity-40"
          aria-hidden
        />
        <div className="relative h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-teal-500 shadow-lg shadow-cyan-900/10 dark:border-cyan-800/50" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (!profile) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden text-slate-800 px-6 text-center">
        <div
          className="absolute inset-0 bg-gradient-to-br from-slate-50 via-cyan-50/80 to-violet-100/50"
          aria-hidden
        />
        <div className="relative max-w-md rounded-3xl border border-cyan-200/50 bg-white/80 backdrop-blur-md px-8 py-10 shadow-xl shadow-cyan-900/10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#103D4D] to-teal-600 text-2xl shadow-lg shadow-teal-900/20">
            <span aria-hidden>◆</span>
          </div>
          <p className="text-lg font-bold text-[#103D4D] mb-2">No ERP profile linked</p>
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            Your account has no workspace profile. Ask an administrator to invite you, or contact support.
          </p>
          <a
            href="/erp/login"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-[#0d3442] hover:to-teal-800"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  const uid = session?.user?.id;

  return (
    <Suspense fallback={<div className="min-h-[50vh] flex-1 bg-gradient-to-br from-slate-50 via-cyan-50/80 to-violet-100/40" />}>
      <ErpProjectTimerProvider userId={uid}>
        <ErpShell>{children}</ErpShell>
      </ErpProjectTimerProvider>
    </Suspense>
  );
}

export default function ErpLayoutClient({ children }) {
  return (
    <ErpSessionProvider>
      <ErpLayoutClientInner>{children}</ErpLayoutClientInner>
    </ErpSessionProvider>
  );
}
