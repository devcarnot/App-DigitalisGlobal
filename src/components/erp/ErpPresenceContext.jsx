'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isErpUserOnline } from '../../lib/erp-presence';

/** Shared Realtime Presence channel for the ERP workspace (all signed-in ERP users). */
export const ERP_WORKSPACE_PRESENCE_CHANNEL = 'erp-workspace-presence';

const defaultValue = {
  onlineUserIds: /** @type {ReadonlySet<string>} */ (new Set()),
  presenceConnected: false,
};

const ErpPresenceContext = createContext(defaultValue);

function userIdsFromPresenceState(state) {
  const ids = new Set();
  if (!state || typeof state !== 'object') return ids;
  for (const key of Object.keys(state)) {
    const metas = state[key];
    if (Array.isArray(metas) && metas.length > 0 && key) ids.add(key);
  }
  return ids;
}

/**
 * Subscribes the current user to workspace presence so other clients see them immediately
 * (no reliance on the 45s last_active_at heartbeat for UI).
 */
export function ErpPresenceProvider({ userId, children }) {
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [presenceConnected, setPresenceConnected] = useState(false);

  useEffect(() => {
    if (!userId || typeof supabase?.channel !== 'function') {
      setOnlineUserIds(new Set());
      setPresenceConnected(false);
      return;
    }

    const channel = supabase.channel(ERP_WORKSPACE_PRESENCE_CHANNEL, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    const sync = () => {
      setOnlineUserIds(userIdsFromPresenceState(channel.presenceState()));
    };

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync);

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setPresenceConnected(true);
        try {
          await channel.track({ online_at: new Date().toISOString() });
        } catch (e) {
          console.warn('ERP presence track failed', e);
        }
        sync();
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setPresenceConnected(false);
      }
    });

    return () => {
      setPresenceConnected(false);
      setOnlineUserIds(new Set());
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const value = useMemo(
    () => ({
      onlineUserIds,
      presenceConnected,
    }),
    [onlineUserIds, presenceConnected],
  );

  return <ErpPresenceContext.Provider value={value}>{children}</ErpPresenceContext.Provider>;
}

export function useErpPresenceOnline(userId, lastActiveAt) {
  const { onlineUserIds, presenceConnected } = useContext(ErpPresenceContext);
  if (!userId) return false;
  if (presenceConnected) return onlineUserIds.has(userId);
  return isErpUserOnline(lastActiveAt);
}

export { ErpPresenceContext };
