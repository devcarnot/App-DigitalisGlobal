'use client';

import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { useErpSession } from '../../../../components/erp/useErpSession';
import ErpAdminPageHero from '../../../../components/erp/ErpAdminPageHero';
import ErpAdminTrash from '../../../../components/erp/ErpAdminTrash';
import ErpAccessDeniedCard from '../../../../components/erp/ErpAccessDeniedCard';

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
