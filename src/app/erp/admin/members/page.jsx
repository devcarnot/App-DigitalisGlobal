'use client';

import React from 'react';
import Link from 'next/link';
import { isErpWorkspaceRosterEditor } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpMemberWorkload from '../../../../components/admin/ErpMemberWorkload';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpMembersNeedsAttention from '../../../../components/erp/ErpMembersNeedsAttention';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

export default function ErpAdminMembersPage() {
  const { profile } = useErpSession();

  if (!isErpWorkspaceRosterEditor(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="The member workload report is available to workspace admins, team leads, and team members." />
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
