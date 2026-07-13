import { Suspense } from 'react';
import ErpRemindersHub from '../../../components/erp/ErpRemindersHub';

export const dynamic = 'force-dynamic';

export default function ErpRemindersPage() {
  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-0 sm:px-1">
      <Suspense fallback={null}>
        <ErpRemindersHub />
      </Suspense>
    </div>
  );
}
