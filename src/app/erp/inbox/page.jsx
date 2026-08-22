'use client';

import { erpLazy } from '../../../lib/erp-lazy-route';

const ErpInbox = erpLazy(() => import('../../../components/erp/ErpInbox'));

export default function ErpInboxPage() {
  return (
    <div className="mx-auto w-full max-w-none space-y-4 max-lg:space-y-0 px-0 sm:px-1">
      <ErpInbox />
    </div>
  );
}
