'use client';

import Link from 'next/link';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpFunctionalTeamSection from '../../../../components/erp/ErpFunctionalTeamSection';
import AdminRecentInvitationsSection from '../../../../components/admin/AdminRecentInvitations';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import ErpPageErrorBoundary from '../../../../components/erp/ErpPageErrorBoundary';

export default function ErpAdminUsersPage() {
  const { profile, loading: sessionLoading } = useErpSession();

  if (sessionLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500" />
      </div>
    );
  }

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Only workspace admins and team leads can manage user teams." />
    );
  }

  return (
    <ErpPageErrorBoundary>
      <div className="space-y-8 max-w-5xl">
      <header className="relative sm:pl-2">
        <div
          className="absolute -left-4 top-1 h-12 w-1.5 rounded-full bg-gradient-to-b from-slate-900 via-violet-700 to-cyan-500 opacity-95 hidden sm:block shadow-md shadow-violet-900/30"
          aria-hidden
        />
        <h1 className="text-3xl font-bold erp-brand-text">
          Users
        </h1>
        <p className="mt-2 text-sm text-teal-900/75 dark:text-slate-300 max-w-2xl">
          Assign functional teams (Developer, Graphic designer, Marketing) for workspace members and team leads. Recent
          invitations appear below; full account list, bulk invites, and removals are on{' '}
          <Link href="/erp/admin/invites" className="font-semibold text-[#103D4D] hover:underline dark:text-teal-300">
            Invites & users
          </Link>
          .
        </p>
      </header>

      <ErpFunctionalTeamSection />

      <AdminRecentInvitationsSection />
      </div>
    </ErpPageErrorBoundary>
  );
}
