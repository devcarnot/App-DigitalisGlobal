'use client';

import { memo, useEffect, useState } from 'react';
import { erpWorkspaceInitialsSource } from '../../lib/erp-roles';
import { getCachedSignedUrl, readCachedSignedUrl } from '../../lib/erp-signed-url-cache';

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-9 w-9 text-[11px]',
  lg: 'h-10 w-10 text-xs',
  xl: 'h-24 w-24 text-2xl',
};

/**
 * Rounded avatar: signed URL from erp_profiles.avatar_path, else initials.
 *
 * Wrapped in `React.memo` so unchanged avatar rows in long lists (chat,
 * pickers, dashboards) don't re-render every time the parent updates an
 * unrelated piece of state.
 */
function ErpUserAvatar({
  profile,
  email,
  size = 'lg',
  className = '',
  imgClassName = '',
  alt = '',
}) {
  const path = profile?.avatar_path;
  // Prime from the cache so rerendering an already-known avatar doesn't flash
  // back to initials for one frame while the network call resolves.
  const [url, setUrl] = useState(() => (path ? readCachedSignedUrl(path) ?? null : null));

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return undefined;
    }
    let alive = true;
    const cached = readCachedSignedUrl(path);
    if (cached !== undefined) {
      setUrl(cached);
      return undefined;
    }
    getCachedSignedUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  const dim = SIZE_CLASS[size] || SIZE_CLASS.lg;
  const initials = erpWorkspaceInitialsSource(profile, email).slice(0, 2).toUpperCase();

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`${dim} shrink-0 rounded-full object-cover border-2 border-white shadow-md shadow-cyan-900/15 ring-2 ring-cyan-200/60 dark:border-slate-700/90 dark:ring-teal-900/55 dark:shadow-black/35 ${imgClassName} ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#B2EBF2] to-cyan-200 text-[#103D4D] font-bold border-2 border-white shadow-md shadow-cyan-900/15 ring-2 ring-cyan-300/50 dark:border-slate-600 dark:from-slate-800 dark:to-slate-900 dark:text-teal-100 dark:ring-teal-800/50 dark:shadow-black/35 ${dim} ${className}`}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initials}
    </div>
  );
}

export default memo(ErpUserAvatar);
