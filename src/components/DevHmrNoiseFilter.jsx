'use client';

import { useEffect } from 'react';

/**
 * Next.js dev + Fast Refresh can briefly leave stale stylesheet links; the browser fires
 * error events that surface as "Uncaught (in promise) Event". Chrome extensions also spam
 * "message channel closed before a response was received" — unrelated to app code — which
 * we hide in development only so the console stays usable.
 */
export default function DevHmrNoiseFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return undefined;

    const onUnhandledRejection = (e) => {
      const r = e.reason;
      const extChannelNoise =
        (r instanceof Error &&
          typeof r.message === 'string' &&
          r.message.includes('message channel closed before a response was received')) ||
        (typeof r === 'string' && r.includes('message channel closed before a response was received'));
      if (extChannelNoise) {
        e.preventDefault();
        return;
      }
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
