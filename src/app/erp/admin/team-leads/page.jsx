'use client';

import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpPageErrorBoundary from '../../../../components/erp/ErpPageErrorBoundary';
import ErpTeamLeadsAdmin from '../../../../components/admin/ErpTeamLeadsAdmin';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';

export default function ErpAdminTeamLeadsPage() {
  const { profile, loading } = useErpSession();

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D]" />
      </div>
    );
  }

  if (!isErpGlobalAdmin(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Team leads management is available to Super Admin only." />
    );
  }

  return (
    <ErpPageErrorBoundary>
      <div className="flex w-full min-w-0 flex-col gap-2">
        <ErpAdminPageHero
          compact
          eyebrow="HR · Team structure"
          title="Team leads & members"
          accent="teal"
          description="Drag members into teams or use Add team for new groups."
        />
        <ErpTeamLeadsAdmin />
      </div>
    </ErpPageErrorBoundary>
  );
}
