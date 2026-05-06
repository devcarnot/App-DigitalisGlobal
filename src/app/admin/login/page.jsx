'use client';

import { Suspense } from 'react';
import AdminLogin from '@/components/admin/AdminLogin';
import ErpAuthPageShell from '@/components/erp/ErpAuthPageShell';
import ErpAuthFaviconLoader from '@/components/erp/ErpAuthFaviconLoader';

function AdminLoginFallback() {
  return (
    <ErpAuthPageShell eyebrow="Admin dashboard">
      <div className="mt-12 flex justify-center pb-4">
        <ErpAuthFaviconLoader size={52} />
      </div>
    </ErpAuthPageShell>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AdminLoginFallback />}>
      <AdminLogin />
    </Suspense>
  );
}
