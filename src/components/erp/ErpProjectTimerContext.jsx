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

const STORAGE_KEY_PRIMARY = 'erp:project_timer_v2';
/** @deprecated compat read */
const STORAGE_KEY_LEGACY = 'erp:project_timer_v1';

/** @typedef {{ projectId: string, startedAtMs: number, projectName?: string, taskId?: string|null, taskTitle?: string }} ActiveTimerSession */

const ErpProjectTimerContext = createContext(null);

function readStoredSession(userId) {
  if (!userId) return null;
  try {
    const raw =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(STORAGE_KEY_PRIMARY) || sessionStorage.getItem(STORAGE_KEY_LEGACY)
        : '';
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o.userId !== userId || !o.projectId || typeof o.startedAtMs !== 'number') return null;
    return {
      projectId: String(o.projectId),
      startedAtMs: o.startedAtMs,
      projectName: typeof o.projectName === 'string' ? o.projectName : '',
      taskId: typeof o.taskId === 'string' && o.taskId.trim() ? o.taskId.trim() : null,
      taskTitle: typeof o.taskTitle === 'string' ? o.taskTitle : '',
    };
  } catch {
    return null;
  }
}

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
    const next = readStoredSession(userId);
    if (next) {
      setActive(next);
      activeRef.current = next;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !active) {
      try {
        sessionStorage.removeItem(STORAGE_KEY_PRIMARY);
        sessionStorage.removeItem(STORAGE_KEY_LEGACY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      sessionStorage.setItem(
        STORAGE_KEY_PRIMARY,
        JSON.stringify({
          userId,
          projectId: active.projectId,
          startedAtMs: active.startedAtMs,
          projectName: active.projectName || '',
          taskId: active.taskId || null,
          taskTitle: active.taskTitle || '',
        }),
      );
      sessionStorage.removeItem(STORAGE_KEY_LEGACY);
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

  const flushActiveToDb = useCallback(
    async (stopOverride) => {
      const cur = activeRef.current;
      if (!userId || !cur) return { ok: true, elapsed: 0 };
      const elapsed = Math.floor((Date.now() - cur.startedAtMs) / 1000);
      const pid = cur.projectId;

      /** `stopOverride.taskId === undefined` → use session attribution; explicit `null` = project-only segment */
      const taskIdResolved =
        stopOverride && Object.prototype.hasOwnProperty.call(stopOverride, 'taskId')
          ? stopOverride.taskId
          : cur.taskId || null;

      setActive(null);
      activeRef.current = null;

      if (elapsed < 1) {
        dispatchReload(pid);
        return { ok: true, elapsed: 0 };
      }

      const row = {
        project_id: pid,
        user_id: userId,
        duration_seconds: elapsed,
        ...(taskIdResolved ? { task_id: taskIdResolved } : { task_id: null }),
      };
      const { error } = await supabase.from('erp_project_time_logs').insert(row);

      if (!error) dispatchReload(pid);
      return { ok: !error, error, elapsed };
    },
    [userId],
  );

  const startTimer = useCallback(
    async (projectId, projectName, taskAttach) => {
      if (!userId || !projectId) return;
      await flushActiveToDb(undefined);
      const tid =
        typeof taskAttach?.taskId === 'string' && taskAttach.taskId.trim()
          ? taskAttach.taskId.trim()
          : null;
      const ttl =
        typeof taskAttach?.taskTitle === 'string' && tid ? taskAttach.taskTitle.trim().slice(0, 280) : '';
      const next = {
        projectId: String(projectId),
        startedAtMs: Date.now(),
        projectName: projectName || '',
        taskId: tid,
        taskTitle: ttl || '',
      };
      setActive(next);
      activeRef.current = next;
    },
    [userId, flushActiveToDb],
  );

  const stopTimer = useCallback(
    async (override) => {
      return flushActiveToDb(override);
    },
    [flushActiveToDb],
  );

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
