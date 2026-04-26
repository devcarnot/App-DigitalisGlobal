'use client';

import { useEffect } from 'react';

/**
 * Registers the root service worker in production, and on localhost in dev so Install
 * can be tested. Skips SW on non-local dev to avoid caching/HMR issues.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (process.env.NODE_ENV !== 'production' && !isLocal) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
