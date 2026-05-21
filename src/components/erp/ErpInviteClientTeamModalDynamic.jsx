'use client';

import dynamic from 'next/dynamic';

export default dynamic(() => import('./ErpInviteClientTeamModal'), {
  ssr: false,
  loading: () => null,
});
