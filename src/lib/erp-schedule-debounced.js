'use client';

/**
 * Coalesce bursty callbacks (realtime events, resize, etc.) into one run.
 * Skips scheduling while the document tab is hidden.
 */
export function scheduleDebounced(ref, fn, delayMs = 450) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (ref.current) clearTimeout(ref.current);
  ref.current = setTimeout(() => {
    ref.current = null;
    fn();
  }, delayMs);
}
