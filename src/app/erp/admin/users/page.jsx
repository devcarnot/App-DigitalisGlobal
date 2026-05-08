'use client';

import Link from 'next/link';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpFunctionalTeamSection from '../../../../components/erp/ErpFunctionalTeamSection';
import AdminRecentInvitationsSection from '../../../../components/admin/AdminRecentInvitations';

export default function ErpAdminUsersPage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-teal-900/80 space-y-4">
        <p className="font-medium">Only workspace admins and team leads can manage user teams.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="relative sm:pl-2">
        <div
          className="absolute -left-4 top-1 h-12 w-1.5 rounded-full bg-gradient-to-b from-slate-900 via-violet-700 to-cyan-500 opacity-95 hidden sm:block shadow-md shadow-violet-900/30"
          aria-hidden
        />
        <h1 className="text-3xl font-bold erp-brand-text">
          Users
        </h1>
        <p className="mt-2 text-sm text-teal-900/75 max-w-2xl">
          Assign functional teams (Developer, Graphic designer, Marketing) for workspace members and team leads. Recent
          invitations appear below; full account list, bulk invites, and removals are on{' '}
          <Link href="/erp/admin/invites" className="font-semibold text-[#103D4D] hover:underline">
            Invites & users
          </Link>
          .
        </p>
      </header>

      <ErpFunctionalTeamSection />

      <AdminRecentInvitationsSection />
    </div>
  );
}
