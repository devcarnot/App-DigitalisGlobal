'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpWorkspaceInitialsSource } from '../../lib/erp-roles';

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-9 w-9 text-[11px]',
  lg: 'h-10 w-10 text-xs',
  xl: 'h-24 w-24 text-2xl',
};

/**
 * Rounded avatar: signed URL from erp_profiles.avatar_path, else initials.
 */
export default function ErpUserAvatar({
  profile,
  email,
  size = 'lg',
  className = '',
  imgClassName = '',
  alt = '',
}) {
  const [url, setUrl] = useState(null);
  const path = profile?.avatar_path;

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let alive = true;
    supabase.storage
      .from('erp-files')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (!error && data?.signedUrl) setUrl(data.signedUrl);
        else setUrl(null);
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
        className={`${dim} shrink-0 rounded-full object-cover border-2 border-white shadow-md shadow-cyan-900/15 ring-2 ring-cyan-200/60 ${imgClassName} ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#B2EBF2] to-cyan-200 text-[#103D4D] font-bold border-2 border-white shadow-md shadow-cyan-900/15 ring-2 ring-cyan-300/50 ${dim} ${className}`}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initials}
    </div>
  );
}
