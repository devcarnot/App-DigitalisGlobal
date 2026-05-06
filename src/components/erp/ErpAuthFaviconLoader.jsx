'use client';

import { useCallback, useRef, useState } from 'react';

/** Matches `metadata.icons` in `src/app/layout.jsx`. */
export const ERP_AUTH_LOADER_ICON_DEFAULT = '/icons/pwa-192.png';
const FALLBACK_ICON = '/Digitalis_logo_black.png';

/**
 * Indeterminate loader: app icon with color filling from bottom → top (loops).
 *
 * @param {{ className?: string, size?: number, src?: string }} props
 */
export default function ErpAuthFaviconLoader({ className = '', size = 48, src }) {
  const initial = src || ERP_AUTH_LOADER_ICON_DEFAULT;
  const [imgSrc, setImgSrc] = useState(initial);
  const failedOnce = useRef(false);

  const onImgError = useCallback(() => {
    if (failedOnce.current) return;
    failedOnce.current = true;
    setImgSrc(FALLBACK_ICON);
  }, []);

  const dim = `${size}px`;

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: dim, height: dim }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <span className="sr-only">Loading</span>
      <img
        src={imgSrc}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={onImgError}
        className="pointer-events-none absolute m-auto h-[82%] w-[82%] select-none object-contain opacity-[0.2] saturate-[0.35]"
        aria-hidden
      />
      <img
        src={imgSrc}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={onImgError}
        className="erp-auth-favicon-fill-animation pointer-events-none absolute m-auto h-[82%] w-[82%] select-none object-contain drop-shadow-[0_2px_10px_rgba(16,61,77,0.18)]"
        aria-hidden
      />
    </div>
  );
}
