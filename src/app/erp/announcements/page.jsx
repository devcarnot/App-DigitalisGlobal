import { Suspense } from 'react';
import ErpAnnouncementsHub from '../../../components/erp/ErpAnnouncementsHub';

export const dynamic = 'force-dynamic';

export default function ErpAnnouncementsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-0 sm:px-1">
      <Suspense fallback={null}>
        <ErpAnnouncementsHub />
      </Suspense>
    </div>
  );
}
