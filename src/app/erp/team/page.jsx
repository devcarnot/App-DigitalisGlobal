'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useErpSession } from '../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../components/erp/ErpAccessDeniedCard';
import { erpCanAccessMyTeam, isErpGlobalAdmin } from '../../../lib/erp-roles';
import { erpLazy } from '../../../lib/erp-lazy-route';

const ErpAttendanceTeam = erpLazy(() => import('../../../components/erp/ErpAttendanceTeam'));

export default function ErpMyTeamPage() {
  const router = useRouter();
  const { profile, loading, erpCan, session } = useErpSession();

  useEffect(() => {
    if (loading || !profile) return;
    if (isErpGlobalAdmin(profile.role)) {
      router.replace('/erp/admin/members');
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  if (!erpCanAccessMyTeam(profile, erpCan)) {
    return (
      <ErpAccessDeniedCard message="My team is available to Team Managers with assigned teams (or when attendance admin is enabled in Users & Roles)." />
    );
  }

  if (isErpGlobalAdmin(profile?.role)) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  return <ErpAttendanceTeam managerEmail={session?.user?.email} />;
}
