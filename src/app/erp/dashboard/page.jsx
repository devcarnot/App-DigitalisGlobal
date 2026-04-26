'use client';

import ErpDashboardHome from '../../../components/erp/ErpDashboardHome';

/**
 * Import the dashboard directly (no next/dynamic) so the header actions and modals
 * always ship with this route’s bundle. Lazy chunks can stay cached after deploy and
 * still point at old code that navigated away instead of opening modals.
 */
export default function ErpDashboardPage() {
  return <ErpDashboardHome />;
}
