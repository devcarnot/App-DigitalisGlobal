'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — Users & Roles now lives under Administration. */
export default function ErpAdminRolesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/erp/admin/administration?tab=roles');
  }, [router]);

  return null;
}
