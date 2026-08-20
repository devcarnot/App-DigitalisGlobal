'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — My team and team attendance are one screen now. */
export default function ErpTeamAttendanceRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/erp/team');
  }, [router]);

  return (
    <div className="flex min-h-[12rem] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
    </div>
  );
}
