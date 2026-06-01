'use client';

import { useEffect, useState } from 'react';

/**
 * Returns pixels the virtual keyboard (or browser chrome) consumes from the bottom
 * of the layout viewport. Use on fixed/sticky mobile composer docks.
 */
export function useMobileKeyboardInset(enabled = true) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const update = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset((prev) => (prev === next ? prev : next));
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled]);

  return inset;
}
