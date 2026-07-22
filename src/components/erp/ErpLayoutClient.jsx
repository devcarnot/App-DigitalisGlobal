'use client';

import React, { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { ErpSessionProvider, useErpSession } from './useErpSession';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpPortalAdminEmail } from '../../lib/erp-portal-admin-emails';
import { ErpProjectTimerProvider } from './ErpProjectTimerContext';
import ErpAuthFaviconLoader from './ErpAuthFaviconLoader';

function ErpWorkspaceBootSplash() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <ErpAuthFaviconLoader size={52} />
    </div>
  );
}

function ErpShellChunkLoading() {
  return <ErpWorkspaceBootSplash />;
}

const ErpShell = dynamic(() => import('./ErpShell'), {
  ssr: false,
  loading: ErpShellChunkLoading,
});

function ErpLayoutClientInner({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, loading, authRecovering, profileProvision, refreshProfile } = useErpSession();
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState(null);
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
    if (loading || authRecovering || isPublic) return;
    if (session) return;
    const t = window.setTimeout(() => {
      router.replace('/erp/login');
    }, 2500);
    return () => window.clearTimeout(t);
  }, [loading, authRecovering, session, isPublic, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (loading || authRecovering) {
    return <ErpWorkspaceBootSplash />;
  }

  if (!session) {
    return <ErpWorkspaceBootSplash />;
  }

  if (!profile) {
    const email = session?.user?.email || '';
    const pendingInvite = profileProvision?.type === 'pending_invite' ? profileProvision.acceptUrl : null;
    const canActivateAdmin = isErpPortalAdminEmail(email);

    async function activateWorkspace() {
      setActivating(true);
      setActivationError(null);
      try {
        const res = await erpAuthorizedFetch('/api/erp/me/ensure-profile', { method: 'POST', body: '{}' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActivationError(j.error || j.message || `Setup failed (${res.status})`);
          return;
        }
        if (refreshProfile) await refreshProfile();
      } finally {
        setActivating(false);
      }
    }

    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden text-slate-800 px-6 text-center bg-[#f8fafc]">
        <div className="relative max-w-md rounded-3xl border border-slate-200/80 bg-white px-8 py-10 shadow-xl shadow-slate-200/60">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl erp-brand-fill text-2xl shadow-lg shadow-teal-900/20">
            <span aria-hidden>◆</span>
          </div>
          <p className="text-lg font-bold text-[#103D4D] mb-2">No ERP profile linked</p>
          {email ? (
            <p className="text-sm text-slate-500 mb-2">
              Signed in as <span className="font-semibold text-slate-700">{email}</span>
            </p>
          ) : null}
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            {activationError ||
              (profileProvision?.type === 'error'
                ? profileProvision.message
                : profileProvision?.message ||
                  (pendingInvite
                    ? 'You have a pending workspace invitation. Complete it to activate your account.'
                    : canActivateAdmin
                      ? 'Your admin email is recognized. Activate your workspace profile below.'
                      : 'Your login worked, but this email has no workspace profile yet. Ask an administrator to send you an ERP invite, or use your invitation link.'))}
          </p>
          {canActivateAdmin ? (
            <button
              type="button"
              onClick={() => void activateWorkspace()}
              disabled={activating}
              className="mb-3 inline-flex w-full items-center justify-center rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
            >
              {activating ? 'Setting up…' : 'Activate workspace (admin)'}
            </button>
          ) : null}
          {pendingInvite ? (
            <a
              href={pendingInvite}
              className="mb-3 inline-flex w-full items-center justify-center rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
            >
              Complete invitation
            </a>
          ) : null}
          <a
            href="/erp/login"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-[#103D4D] hover:bg-slate-50"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  const uid = session?.user?.id;

  return (
    <Suspense fallback={<div className="min-h-0 bg-[color:var(--erp-canvas-light)] dark:bg-[color:var(--erp-canvas-dark)]" />}>
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
