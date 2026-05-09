'use client';

import dynamic from 'next/dynamic';

/** Code-split the Add Task modal: keeps `My tasks`, project workspace,
 *  and dashboards lighter until the user actually presses "Add task". */
export default dynamic(() => import('./ErpAddMainTaskModal'), {
  ssr: false,
  loading: () => null,
});
