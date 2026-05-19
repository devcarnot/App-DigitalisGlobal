'use client';

import { useEffect } from 'react';
import { initErpPageZoom } from '../lib/erp-page-zoom';

/** Enables Ctrl/Cmd + wheel and keyboard zoom in the web/PWA shell. */
export default function ErpZoomSupport() {
  useEffect(() => initErpPageZoom(), []);
  return null;
}
