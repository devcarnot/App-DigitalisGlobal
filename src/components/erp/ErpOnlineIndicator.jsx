'use client';

import { useContext } from 'react';
import { isErpUserOnline } from '../../lib/erp-presence';
import { ErpPresenceContext } from './ErpPresenceContext';

const SIZE_DOT = {
  sm: 'h-2 w-2 ring-[1.5px]',
  md: 'h-2.5 w-2.5 ring-2',
  lg: 'h-3 w-3 ring-[3px]',
};

/**
 * Wraps an avatar; shows a green dot from Realtime presence when connected, else last_active_at, or forceOnline.
 */
export function ErpAvatarWithOnline({ children, lastActiveAt, forceOnline, size = 'md', presenceUserId = null }) {
  const { onlineUserIds, presenceConnected } = useContext(ErpPresenceContext);
  let online = Boolean(forceOnline);
  if (!online) {
    if (presenceUserId) {
      if (presenceConnected) online = onlineUserIds.has(presenceUserId);
      else online = isErpUserOnline(lastActiveAt);
    } else {
      online = isErpUserOnline(lastActiveAt);
    }
  }
  const dot = SIZE_DOT[size] || SIZE_DOT.md;
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {online ? (
        <span
          className={`pointer-events-none absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-500 ring-white shadow-sm ${dot}`}
          title="Online"
          aria-label="Online"
        />
      ) : null}
    </span>
  );
}
