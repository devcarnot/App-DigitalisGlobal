'use client';

import { useEffect, useRef } from 'react';
import { pushErpErrorToast } from './erp-app-toast';

/**
 * Mirror inline error state into a pinned toast whenever `message` becomes non-empty.
 * Dedupes identical consecutive messages (same message re-rendered won't spam).
 */
export function useErpErrorToast(message, { title = 'Something went wrong', enabled = true } = {}) {
  const lastToastMessageRef = useRef('');

  useEffect(() => {
    const msg = String(message || '').trim();
    if (!msg) {
      lastToastMessageRef.current = '';
      return;
    }
    if (!enabled || lastToastMessageRef.current === msg) return;
    lastToastMessageRef.current = msg;
    pushErpErrorToast({ title, body: msg });
  }, [message, title, enabled]);
}
