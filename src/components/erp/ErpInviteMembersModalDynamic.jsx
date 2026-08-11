'use client';

import dynamic from 'next/dynamic';

/** Code-split the Invite Members modal: a power-user action that doesn't
 *  need to be in the project workspace's initial JS. */
export default dynamic(() => import('./ErpInviteMembersModal'), {
  ssr: false,
  loading: () => null,
});
