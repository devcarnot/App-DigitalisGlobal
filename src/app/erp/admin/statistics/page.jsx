'use client';

import React from 'react';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../lib/erp-lazy-route';

const AdminErpStatistics = erpLazy(() => import('../../../../components/admin/AdminErpStatistics'));

export default function ErpAdminStatisticsPage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Statistics are only available to workspace admins and team leads." />
    );
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="Analytics" title="Statistics" accent="violet" />
      <AdminErpStatistics />
    </div>
  );
}
