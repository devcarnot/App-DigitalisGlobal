'use client';

import dynamic from 'next/dynamic';
import ErpRouteLoadingFallback from '../components/erp/ErpRouteLoadingFallback';

/**
 * Standard lazy route chunk for ERP pages — keeps initial shell small and
 * avoids loading heavy hubs until the user navigates to that route.
 */
export function erpLazy(importFn, options = {}) {
  return dynamic(importFn, {
    ssr: false,
    loading: ErpRouteLoadingFallback,
    ...options,
  });
}
