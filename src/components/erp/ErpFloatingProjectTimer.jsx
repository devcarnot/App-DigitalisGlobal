'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { formatSessionClock, formatTotalTrackedSeconds } from '../../lib/erp-project-time-format';
import { useErpProjectTimer } from './ErpProjectTimerContext';
import { useErpSession } from './useErpSession';

const POS_KEY = 'erp:floating_timer_pos_v1';
const DEFAULT_PANEL_W = 180;
const DEFAULT_PANEL_H = 44;

function clampPosition(left, top, panelW, panelH) {
  const pad = 8;
  const w = typeof window !== 'undefined' ? window.innerWidth : 400;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const pw = panelW || DEFAULT_PANEL_W;
  const ph = panelH || DEFAULT_PANEL_H;
  return {
    left: Math.min(Math.max(pad, left), w - pw - pad),
    top: Math.min(Math.max(pad, top), h - ph - pad),
  };
}

function IconPlay({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 001.53.85l10-6.5a1 1 0 000-1.7l-10-6.5A1 1 0 008 5.5z" />
    </svg>
  );
}

function IconPause({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
    </svg>
  );
}

function IconGrip({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

function IconClose({ className = 'h-3 w-3' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconClock({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 2" />
    </svg>
  );
}

export default function ErpFloatingProjectTimer() {
  const pathname = usePathname();
  const { profile, session } = useErpSession();
  const uid = session?.user?.id;
  const { active, liveElapsedSec, startTimer, stopTimer } = useErpProjectTimer();
  const [busy, setBusy] = useState(false);

  const pathMatch = pathname?.match(/^\/erp\/projects\/([^/]+)/);
  const pathProjectId = pathMatch?.[1] ?? null;

  const [pos, setPos] = useState(null);
  const [placed, setPlaced] = useState(false);
  /** While true, position uses dragPosRef + direct DOM updates (no setState per frame). */
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef(null);
  const dragPosRef = useRef({ left: 0, top: 0 });
  const dragListenersCleanupRef = useRef(null);

  const [projectName, setProjectName] = useState('');
  const [loggedBaseSeconds, setLoggedBaseSeconds] = useState(0);
  const [totalsLoading, setTotalsLoading] = useState(false);
  /** When set, equals the project id the user dismissed the widget for (sticky until the project id changes or a new session starts). */
  const [dismissedProjectId, setDismissedProjectId] = useState(null);
  /** Last project the user actively used the timer for. Latches when a session
   *  starts and never resets on pause/stop, so the widget stays visible after
   *  Pause with a Play button for one-click resume. The user can fully hide it
   *  via the X close button (which switches to the compact dismissed pill). */
  const [engagedProjectId, setEngagedProjectId] = useState(null);

  useEffect(() => {
    if (active?.projectId) {
      setEngagedProjectId(active.projectId);
    }
  }, [active?.projectId, active?.startedAtMs]);

  /** Prefer the active session, then the project on the URL, then the last
   *  engaged project — so the widget keeps showing for the engaged project even
   *  after the user pauses and navigates elsewhere. */
  const displayProjectId = active?.projectId || pathProjectId || engagedProjectId;
  const sessionRunningOnDisplay = Boolean(active && active.projectId === displayProjectId);

  const totalDisplaySeconds = useMemo(() => {
    const base = loggedBaseSeconds;
    return sessionRunningOnDisplay ? base + liveElapsedSec : base;
  }, [loggedBaseSeconds, sessionRunningOnDisplay, liveElapsedSec]);

  const loadTotalsAndName = useCallback(async () => {
    if (!displayProjectId) return;
    setTotalsLoading(true);
    try {
      const [totalsRes, projRes] = await Promise.all([
        supabase.rpc('erp_project_time_totals', { p_project_ids: [displayProjectId] }),
        supabase.from('erp_projects').select('name').eq('id', displayProjectId).maybeSingle(),
      ]);
      let sum = 0;
      const totRows = totalsRes?.data;
      const totErr = totalsRes?.error;
      if (!totErr && Array.isArray(totRows)) {
        sum = totRows.length ? Number(totRows[0]?.total_seconds) || 0 : 0;
      } else {
        const { data: logRows } = await supabase
          .from('erp_project_time_logs')
          .select('duration_seconds')
          .eq('project_id', displayProjectId);
        sum = (logRows || []).reduce((a, r) => a + (Number(r.duration_seconds) || 0), 0);
      }
      setLoggedBaseSeconds(sum);
      const nm =
        (sessionRunningOnDisplay && active?.projectName?.trim()) ||
        projRes?.data?.name?.trim() ||
        '';
      setProjectName(nm || 'Project');
    } finally {
      setTotalsLoading(false);
    }
  }, [displayProjectId, sessionRunningOnDisplay, active?.projectName]);

  useEffect(() => {
    void loadTotalsAndName();
  }, [loadTotalsAndName]);

  /** Starting a new session re-shows the widget even if it was dismissed on this project. */
  useEffect(() => {
    if (active?.startedAtMs) setDismissedProjectId(null);
  }, [active?.startedAtMs]);

  /** Switching projects resets the dismiss state (so it only sticks on the project the user closed it on). */
  useEffect(() => {
    setDismissedProjectId((prev) => (prev && prev !== displayProjectId ? null : prev));
  }, [displayProjectId]);

  useEffect(() => {
    const onReload = (e) => {
      const pid = e?.detail?.projectId;
      if (pid && pid === displayProjectId) void loadTotalsAndName();
    };
    window.addEventListener('erp-project-time-reload', onReload);
    return () => window.removeEventListener('erp-project-time-reload', onReload);
  }, [displayProjectId, loadTotalsAndName]);

  /** Initial position + restore from localStorage */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.left === 'number' && typeof p.top === 'number') {
          setPos(clampPosition(p.left, p.top, DEFAULT_PANEL_W, DEFAULT_PANEL_H));
          setPlaced(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isSm = w >= 640;
    if (isSm) {
      setPos(clampPosition(w - DEFAULT_PANEL_W - 24, Math.max(72, h - DEFAULT_PANEL_H - 96), DEFAULT_PANEL_W, DEFAULT_PANEL_H));
    } else {
      setPos(clampPosition(w - DEFAULT_PANEL_W - 12, Math.max(64, h - DEFAULT_PANEL_H - 80), DEFAULT_PANEL_W, DEFAULT_PANEL_H));
    }
    setPlaced(true);
  }, []);

  useEffect(() => {
    if (!placed || typeof window === 'undefined') return;
    const onResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const el = panelRef.current;
        const r = el?.getBoundingClientRect();
        return clampPosition(prev.left, prev.top, r?.width ?? DEFAULT_PANEL_W, r?.height ?? DEFAULT_PANEL_H);
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [placed]);

  useEffect(() => {
    return () => {
      dragListenersCleanupRef.current?.();
      dragListenersCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (pos && !dragging) {
      dragPosRef.current = pos;
    }
  }, [pos, dragging]);

  const persistPos = useCallback((left, top) => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
    } catch {
      /* ignore */
    }
  }, []);

  /** Window-level move/up; move uses DOM writes only — avoid setState every frame (lag). */
  const onDragHandlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      const panel = panelRef.current;
      if (!panel) return;

      dragListenersCleanupRef.current?.();

      const rect = panel.getBoundingClientRect();
      const dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
        pw: rect.width,
        ph: rect.height,
      };

      dragPosRef.current = { left: rect.left, top: rect.top };
      setDragging(true);

      try {
        e.preventDefault();
      } catch {
        /* ignore */
      }

      const applyVisual = (next) => {
        dragPosRef.current = next;
        const el = panelRef.current;
        if (!el) return;
        el.style.left = `${next.left}px`;
        el.style.top = `${next.top}px`;
      };

      const move = (ev) => {
        const dx = ev.clientX - dragState.startX;
        const dy = ev.clientY - dragState.startY;
        const next = clampPosition(
          dragState.origLeft + dx,
          dragState.origTop + dy,
          dragState.pw,
          dragState.ph,
        );
        applyVisual(next);
        try {
          ev.preventDefault();
        } catch {
          /* ignore */
        }
      };

      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        dragListenersCleanupRef.current = null;

        const finalPos = dragPosRef.current;
        setPos(finalPos);
        persistPos(finalPos.left, finalPos.top);
        setDragging(false);
      };

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      dragListenersCleanupRef.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
    },
    [persistPos],
  );

  if (profile?.role === 'client') return null;
  if (!displayProjectId || !uid) return null;
  // Show the widget when the timer is actively running OR when the user has
  // engaged with the timer for the displayed project (so Pause keeps the
  // widget visible with a Play button for quick resume). It stays hidden on
  // pages where the user has never started a session.
  const isEngagedHere = engagedProjectId === displayProjectId;
  if (!sessionRunningOnDisplay && !isEngagedHere) return null;

  const label = projectName?.trim() || 'Project';
  const showRunningChrome = sessionRunningOnDisplay;

  const timeText = showRunningChrome
    ? formatSessionClock(liveElapsedSec)
    : formatTotalTrackedSeconds(totalDisplaySeconds);

  /* Dismissed → render a compact always-on-top pill next to the header notification
     area. Click restores the full floating timer. */
  if (dismissedProjectId && dismissedProjectId === displayProjectId) {
    return (
      <button
        type="button"
        onClick={() => setDismissedProjectId(null)}
        aria-label={`Show timer · ${label}`}
        title={showRunningChrome ? `Timer running · ${label}` : `Timer · ${label}`}
        className={`fixed right-3 top-16 z-[210] inline-flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-full border bg-white/95 py-1 pl-1.5 pr-2.5 shadow-[0_10px_28px_-10px_rgba(16,61,77,0.45),0_0_0_1px_rgba(178,235,242,0.4)] backdrop-blur-md transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 dark:bg-gradient-to-br dark:from-[#0f2230] dark:to-[#0a1420] dark:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55),0_0_0_1px_rgba(45,212,191,0.15)] sm:right-4 sm:top-20 ${
          showRunningChrome
            ? 'border-teal-300/90 ring-1 ring-teal-400/30 dark:border-teal-600/60 dark:ring-teal-500/25'
            : 'border-teal-200/90 dark:border-teal-800/55'
        }`}
      >
        <span
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full shadow-sm ${
            showRunningChrome
              ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white'
              : 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white'
          }`}
          aria-hidden
        >
          <IconClock className="h-3.5 w-3.5" />
        </span>
        <span
          className={`font-mono text-[clamp(11px,2.75vw,12px)] font-bold tabular-nums leading-none ${
            showRunningChrome ? 'text-teal-950 dark:text-white' : 'text-slate-800 dark:text-slate-100'
          }`}
        >
          {totalsLoading ? '…' : timeText}
          {showRunningChrome ? (
            <span
              className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-1px] animate-pulse rounded-full bg-rose-500 align-middle"
              aria-hidden
            />
          ) : null}
        </span>
      </button>
    );
  }

  if (!placed || !pos) return null;

  const layoutLeft = dragging ? dragPosRef.current.left : pos.left;
  const layoutTop = dragging ? dragPosRef.current.top : pos.top;

  const onTogglePlayPause = () => {
    if (busy) return;
    setBusy(true);
    if (showRunningChrome) {
      void stopTimer().finally(() => setBusy(false));
    } else {
      void Promise.resolve(startTimer(displayProjectId, label)).finally(() => setBusy(false));
    }
  };

  const titleTooltip = showRunningChrome
    ? `Pause & log · ${label}`
    : `Start timer · ${label}`;

  return (
    <div
      ref={panelRef}
      className={`fixed z-[200] touch-none ${dragging ? 'will-change-[left,top]' : ''}`}
      style={{
        left: layoutLeft,
        top: layoutTop,
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`group flex max-w-[calc(100vw-1rem)] flex-nowrap items-center gap-1 rounded-full border bg-[rgb(255_255_255/0.98)] py-1 pl-1 pr-2 shadow-[0_10px_28px_-10px_rgba(16,61,77,0.45),0_0_0_1px_rgba(178,235,242,0.4)] select-none sm:gap-1.5 sm:py-1 sm:pr-2.5 dark:border-teal-600/55 dark:bg-gradient-to-br dark:from-[#0f2230] dark:to-[#0a1420] dark:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55),0_0_0_1px_rgba(45,212,191,0.18)] ${
          showRunningChrome
            ? 'border-teal-300/90 ring-1 ring-teal-400/30 dark:border-teal-500/55 dark:ring-teal-500/20'
            : 'border-teal-200/90 dark:border-teal-800/60'
        } ${dragging ? '' : 'backdrop-blur-md'}`}
        title={titleTooltip}
      >
        <button
          type="button"
          onPointerDown={onDragHandlePointerDown}
          className="flex h-6 w-5 flex-none cursor-grab items-center justify-center rounded-full text-teal-700/60 hover:text-teal-800 active:cursor-grabbing touch-none dark:text-teal-300/95 dark:hover:text-teal-50"
          aria-label="Drag timer"
          title="Drag"
        >
          <IconGrip className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onTogglePlayPause}
          disabled={busy || totalsLoading}
          aria-label={showRunningChrome ? 'Pause timer' : 'Start timer'}
          title={titleTooltip}
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-55 ${
            showRunningChrome
              ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white hover:from-rose-600 hover:to-rose-700'
              : 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white hover:from-teal-600 hover:to-cyan-700'
          }`}
        >
          {showRunningChrome ? (
            <IconPause className="h-3.5 w-3.5" />
          ) : (
            <IconPlay className="h-3.5 w-3.5" />
          )}
        </button>
        <span
          className={`flex min-w-0 max-w-[min(52vw,14rem)] flex-col items-center justify-center gap-0.5 shrink-0 text-center leading-none sm:max-w-[16rem] ${
            showRunningChrome ? 'text-slate-950 dark:text-white' : 'text-slate-800 dark:text-slate-100'
          }`}
        >
          <span className="font-mono text-[clamp(12px,3.5vw,14px)] font-bold tabular-nums">
            {totalsLoading ? '…' : timeText}
            {showRunningChrome ? (
              <span
                className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-1px] animate-pulse rounded-full bg-rose-500 align-middle"
                aria-hidden
              />
            ) : null}
          </span>
          {showRunningChrome && active?.taskTitle?.trim() ? (
            <span
              className="w-full truncate text-[10px] font-semibold leading-tight text-teal-800 dark:text-teal-200"
              title={active.taskTitle}
            >
              {active.taskTitle}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setDismissedProjectId(displayProjectId)}
          className="ml-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 dark:text-slate-300 dark:hover:bg-rose-950/65 dark:hover:text-rose-200 dark:focus-visible:ring-rose-500/35"
          aria-label={showRunningChrome ? 'Hide timer (keeps running in background)' : 'Hide timer'}
          title={showRunningChrome ? 'Hide (timer keeps running)' : 'Hide timer'}
        >
          <IconClose className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
