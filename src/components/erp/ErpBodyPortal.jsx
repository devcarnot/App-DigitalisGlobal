'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children on document.body so position:fixed overlays use the viewport,
 * not a transformed / overflow ancestor inside the ERP shell.
 */
export default function ErpBodyPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
