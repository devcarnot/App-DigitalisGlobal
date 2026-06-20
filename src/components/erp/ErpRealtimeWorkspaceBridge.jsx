'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ERP_WORKSPACE_SYNC } from '../../lib/erp-workspace-sync-events';

const DEBOUNCE_MS = 650;

/** Routes where project/task realtime should trigger dashboard metric reload. */
const DASHBOARD_RELOAD_PREFIXES = ['/erp'];

function shouldReloadDashboard(pathname) {
  if (!pathname) return false;
  if (pathname === '/erp') return true;
  return DASHBOARD_RELOAD_PREFIXES.some(
    (p) => p !== '/erp' && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

/**
 * Subscribes to project/task/membership changes and dispatches a debounced
 * `erp-workspace-sync` event (and `erp-dashboard-reload` on dashboard routes).
 */
export default function ErpRealtimeWorkspaceBridge({ userId, enabled = true }) {
  const pathname = usePathname();
  const pendingScopesRef = useRef(new Set());
  const timerRef = useRef(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!enabled || !userId) return undefined;

    const flush = () => {
      timerRef.current = null;
      const scopes = [...pendingScopesRef.current];
      pendingScopesRef.current.clear();
      if (scopes.length === 0 || typeof window === 'undefined') return;

      window.dispatchEvent(new CustomEvent(ERP_WORKSPACE_SYNC, { detail: { scopes } }));
      if (
        (scopes.includes('projects') || scopes.includes('tasks')) &&
        shouldReloadDashboard(pathnameRef.current)
      ) {
        window.dispatchEvent(new Event('erp-dashboard-reload'));
      }
    };

    const schedule = (scopes) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      for (const s of scopes) pendingScopesRef.current.add(s);
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, DEBOUNCE_MS);
    };

    const channelName = `erp-workspace-sync-${userId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'erp_projects' }, () =>
        schedule(['projects']),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'erp_project_members',
          filter: `user_id=eq.${userId}`,
        },
        () => schedule(['projects']),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'erp_tasks' }, () =>
        schedule(['tasks']),
      )
      .subscribe();

    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingScopesRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  return null;
}
