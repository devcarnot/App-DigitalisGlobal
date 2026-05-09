'use client';

import dynamic from 'next/dynamic';

/** Code-split the Schedule Meeting modal: it pulls in timezone helpers,
 *  the markdown editor, and a fairly large form, none of which are needed
 *  until the user clicks "Schedule meeting". */
export default dynamic(() => import('./ErpScheduleMeetingModal'), {
  ssr: false,
  loading: () => null,
});
