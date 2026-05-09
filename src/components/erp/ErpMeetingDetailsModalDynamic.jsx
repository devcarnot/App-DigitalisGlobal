'use client';

import dynamic from 'next/dynamic';

/** Code-split the Meeting Details popup so the meetings list / project
 *  meetings section don't pay its cost up-front. */
export default dynamic(() => import('./ErpMeetingDetailsModal'), {
  ssr: false,
  loading: () => null,
});
