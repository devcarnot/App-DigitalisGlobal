'use client';

import { Suspense } from 'react';
import AdminGuard from '@/components/admin/AdminGuard';
import AdminDashboard from '@/components/admin/AdminDashboard';

/**
 * /admin — the gated admin dashboard. `AdminLogin` redirects here after a
 * successful sign-in (default `from` query value is `/admin`), so this route
 * must exist for the post-login flow to land cleanly.
 *
 * Both components are client components; the Suspense boundary keeps the
 * client-only `useSearchParams` etc. inside `AdminDashboard` happy under the
 * App Router.
 */
function AdminLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <p className="text-slate-500">Loading…</p>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminGuard>
        <AdminDashboard />
      </AdminGuard>
    </Suspense>
  );
}
