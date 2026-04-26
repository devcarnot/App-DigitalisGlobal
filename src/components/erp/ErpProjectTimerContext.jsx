'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../../lib/supabase';

const STORAGE_KEY = 'erp:project_timer_v1';

/** @typedef {{ projectId: string, startedAtMs: number, projectName?: string }} ActiveTimerSession */

const ErpProjectTimerContext = createContext(null);

export function ErpProjectTimerProvider({ userId, children }) {
  /** @type {[ActiveTimerSession | null, React.Dispatch<React.SetStateAction<ActiveTimerSession | null>>]} */
  const [active, setActive] = useState(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const bump = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      setActive(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o.userId !== userId || !o.projectId || typeof o.startedAtMs !== 'number') return;
      const next = {
        projectId: String(o.projectId),
        startedAtMs: o.startedAtMs,
        projectName: typeof o.projectName === 'string' ? o.projectName : '',
      };
      setActive(next);
      activeRef.current = next;
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !active) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          userId,
          projectId: active.projectId,
          startedAtMs: active.startedAtMs,
          projectName: active.projectName || '',
        }),
      );
    } catch {
      /* ignore */
    }
  }, [active, userId]);

  /** Background tabs throttle timers; bump on visibility/focus; elapsed stays correct via wall clock. */
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      bump();
    }, 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', bump);
    };
  }, [active, bump]);

  const liveElapsedSec = useMemo(() => {
    if (!active) return 0;
    return Math.floor((Date.now() - active.startedAtMs) / 1000);
  }, [active, tick]);

  const flushActiveToDb = useCallback(async () => {
    const cur = activeRef.current;
    if (!userId || !cur) return { ok: true, elapsed: 0 };
    const elapsed = Math.floor((Date.now() - cur.startedAtMs) / 1000);
    const pid = cur.projectId;
    setActive(null);
    activeRef.current = null;
    if (elapsed < 1) {
      dispatchReload(pid);
      return { ok: true, elapsed: 0 };
    }
    const { error } = await supabase.from('erp_project_time_logs').insert({
      project_id: pid,
      user_id: userId,
      duration_seconds: elapsed,
    });
    if (!error) dispatchReload(pid);
    return { ok: !error, error, elapsed };
  }, [userId]);

  const startTimer = useCallback(
    async (projectId, projectName) => {
      if (!userId || !projectId) return;
      await flushActiveToDb();
      const next = {
        projectId: String(projectId),
        startedAtMs: Date.now(),
        projectName: projectName || '',
      };
      setActive(next);
      activeRef.current = next;
    },
    [userId, flushActiveToDb],
  );

  const stopTimer = useCallback(async () => {
    return flushActiveToDb();
  }, [flushActiveToDb]);

  const value = useMemo(
    () => ({
      active,
      liveElapsedSec,
      startTimer,
      stopTimer,
    }),
    [active, liveElapsedSec, startTimer, stopTimer],
  );

  return <ErpProjectTimerContext.Provider value={value}>{children}</ErpProjectTimerContext.Provider>;
}

function dispatchReload(projectId) {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    window.dispatchEvent(new CustomEvent('erp-project-time-reload', { detail: { projectId } }));
  } catch {
    /* ignore */
  }
}

export function useErpProjectTimer() {
  const ctx = useContext(ErpProjectTimerContext);
  if (!ctx) {
    throw new Error('useErpProjectTimer must be used within ErpProjectTimerProvider');
  }
  return ctx;
}
