'use client';

import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';
import { erpLazy } from '../../../../lib/erp-lazy-route';

const ErpAdminTrash = erpLazy(() => import('../../../../components/erp/ErpAdminTrash'));

export default function ErpAdminTrashPage() {
  const { profile } = useErpSession();

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <ErpAccessDeniedCard message="Trash is only available to workspace admins and team leads." />
    );
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero eyebrow="Workspace" title="Trash" accent="violet" />
      <ErpAdminTrash />
    </div>
  );
}
