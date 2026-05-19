'use client';

import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

const ATTENDANCE_BC = 'erp-attendance-sync';

/**
 * Subscribe to Postgres changes on a table; debounces refetches.
 * Requires the table to be in the `supabase_realtime` publication.
 */
export function useErpTableRealtime({
  enabled = true,
  channelName,
  table,
  filter,
  events = '*',
  debounceMs = 280,
  onChange,
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !channelName || !table) return undefined;

    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onChangeRef.current?.();
      }, debounceMs);
    };

    const ch = supabase.channel(channelName);
    const opts = { event: events, schema: 'public', table };
    if (filter) opts.filter = filter;
    ch.on('postgres_changes', opts, schedule).subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [enabled, channelName, table, filter, events, debounceMs]);
}

/** Notify other tabs/windows on the same origin (e.g. two browser tabs). */
export function broadcastErpAttendanceChange(userId) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('erp-attendance-changed', { detail: { userId } }));
  } catch {
    /* ignore */
  }
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(ATTENDANCE_BC);
    bc.postMessage({ userId, at: Date.now() });
    bc.close();
  } catch {
    /* ignore */
  }
}

/** Same-origin tab sync when realtime is unavailable or slow. */
export function useErpAttendanceCrossTabSync(userId, onChange) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return undefined;

    const run = (id) => {
      if (id && id !== userId) return;
      onChangeRef.current?.();
    };

    const onCustom = (e) => run(e?.detail?.userId);
    window.addEventListener('erp-attendance-changed', onCustom);

    let bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(ATTENDANCE_BC);
      bc.onmessage = (e) => run(e?.data?.userId);
    }

    return () => {
      window.removeEventListener('erp-attendance-changed', onCustom);
      bc?.close();
    };
  }, [userId]);
}

/** Refetch when the window regains focus (desktop app / background tab). */
export function useRefetchOnVisible(onChange, enabled = true) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    const onVis = () => {
      if (document.visibilityState === 'visible') onChangeRef.current?.();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);
}
