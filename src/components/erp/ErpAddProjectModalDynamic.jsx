'use client';

import dynamic from 'next/dynamic';

/** Code-split: keeps dashboard / projects grid initial JS smaller until “Add project” is needed. */
export default dynamic(() => import('./ErpAddProjectModal'), {
  ssr: false,
  loading: () => null,
});
