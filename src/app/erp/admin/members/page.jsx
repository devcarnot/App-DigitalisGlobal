'use client';

import React from 'react';
import Link from 'next/link';
import { isErpWorkspaceRosterEditor } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpMemberWorkload from '../../../../components/admin/ErpMemberWorkload';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpMembersNeedsAttention from '../../../../components/erp/ErpMembersNeedsAttention';

export default function ErpAdminMembersPage() {
  const { profile } = useErpSession();

  if (!isErpWorkspaceRosterEditor(profile?.role)) {
    return (
      <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg text-teal-900/80 space-y-4">
        <p className="text-base font-medium">The member workload report is available to workspace admins, team leads, and team members.</p>
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
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="Team health" title="Members" accent="teal" />
      <ErpMembersNeedsAttention />
      <ErpMemberWorkload />
    </div>
  );
}
