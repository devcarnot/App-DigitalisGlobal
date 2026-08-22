'use client';

import React from 'react';
import Link from 'next/link';
import { isErpWorkspaceRosterEditor } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../lib/erp-lazy-route';

const ErpMemberWorkload = erpLazy(() => import('../../../../components/admin/ErpMemberWorkload'));
const ErpMembersNeedsAttention = erpLazy(() => import('../../../../components/erp/ErpMembersNeedsAttention'));

export default function ErpAdminMembersPage() {
  const { profile } = useErpSession();

  if (!isErpWorkspaceRosterEditor(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="The member workload report is available to workspace admins, team leads, and team members." />
    );
  }

  return (
    <div className="space-y-3">
      <ErpAdminPageHero compact eyebrow="Team health" title="Members" accent="teal" />
      <ErpMembersNeedsAttention />
      <ErpMemberWorkload />
    </div>
  );
}
