'use client';

import { useEffect } from 'react';

/**
 * Next.js dev + Fast Refresh can briefly leave stale stylesheet links; the browser fires
 * error events that surface as "Uncaught (in promise) Event". This only suppresses that
 * known noise in development — not production.
 */
export default function DevHmrNoiseFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return undefined;

    const onUnhandledRejection = (e) => {
      const r = e.reason;
      if (r instanceof Event && r.type === 'error') {
        const t = r.target;
        if (t && t.tagName === 'LINK' && (t.rel === 'stylesheet' || t.as === 'style')) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  return null;
}
