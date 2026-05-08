'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadProjectTasksForTimerPick, timerPickNeedsUserChoice } from '../../lib/erp-project-timer-task-pick';
import { useErpProjectTimer } from './ErpProjectTimerContext';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';
import ErpProjectTimerTaskPickModal from './ErpProjectTimerTaskPickModal';

const HISTORY_PAGE_SIZE = 400;

/** @param {number} totalSeconds */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec > 0 ? `${sec}s` : ''}`.trim();
  return `${sec}s`;
}

/**
 * @param {{ created_at: string, duration_seconds: number, note?: string|null, task_id?: string|null, task?: { id?: string, title?: string }|null }[]} rows sorted newest-first
 */
function groupLogsByLocalDay(rows) {
  /** @type {{ dayKey: string, label: string, dayTotal: number, items: typeof rows }[]} */
  const groups = [];
  for (const r of rows) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const sec = Number(r.duration_seconds) || 0;
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) {
      last.dayTotal += sec;
      last.items.push(r);
    } else {
      groups.push({ dayKey, label, dayTotal: sec, items: [r] });
    }
  }
  for (const g of groups) {
    g.items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return groups;
}

function taskJoin(row) {
  const raw = Array.isArray(row.task) ? row.task[0] : row.task;
  return typeof raw === 'object' && raw !== null ? raw : null;
}

function sessionTaskLabel(row) {
  const jo = taskJoin(row);
  const t = jo?.title?.trim?.() ? jo.title.trim() : null;
  if (t) return t;
  if (row.task_id) return '(Task)';
  return 'General · no task';
}

function summarizeTasksFromRows(rows) {
  const map = new Map();
  let general = 0;
  for (const r of rows) {
    const sec = Number(r.duration_seconds) || 0;
    if (!sec) continue;
    const tid = typeof r.task_id === 'string' && r.task_id.trim() ? r.task_id.trim() : null;
    const jo = taskJoin(r);
    const titleFromJoin = jo?.title?.trim?.() ? jo.title.trim() : tid ? '(Untitled task)' : null;
    if (!tid) {
      general += sec;
      continue;
    }
    const prev = map.get(tid) || { key: tid, label: titleFromJoin || '(Task)', seconds: 0 };
    prev.seconds += sec;
    prev.label = titleFromJoin || prev.label;
    map.set(tid, prev);
  }
  /** @type {{ key: string, label: string, seconds: number }[]} */
  const list = [...map.values()];
  if (general > 0) list.push({ key: '__general', label: 'General (no task)', seconds: general });
  return list.sort((a, b) => b.seconds - a.seconds);
}

function IconHistory({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

function IconPlayFilled({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.25v13.5L18.92 12 8 5.25z" />
    </svg>
  );
}

function IconPauseFilled({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 5.25h4v13.5H7V5.25zm6 0h4v13.5h-4V5.25z" />
    </svg>
  );
}

function IconSpark({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.091z"
      />
    </svg>
  );
}

/**
 * Project timer + session history. Pass `timerTaskId` / `timerTaskTitle` when a task detail is open to attribute logged time to that task.
 *
 * Compact variants (mutually exclusive):
 * - `controlsOnly`: Start/Stop + live elapsed — for header toolbar (no history popup here).
 * - `summaryOnly`: no visible chrome — parent opens session history via `historyOpen` + `onHistoryOpenChange`.
 *
 * Pass `historyOpen` + `onHistoryOpenChange` together to control the session-history modal from the parent.
 */
export default function ErpProjectTimeLogger({
  projectId,
  userId,
  projectName,
  timerTaskId = null,
  timerTaskTitle = null,
  onTotalChange,
  compact = false,
  controlsOnly = false,
  summaryOnly = false,
  historyOpen: historyOpenProp,
  onHistoryOpenChange,
}) {
  const { active, liveElapsedSec, startTimer, stopTimer } = useErpProjectTimer();
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [historyOpenUncontrolled, setHistoryOpenUncontrolled] = useState(false);
  const historyIsControlled =
    typeof historyOpenProp === 'boolean' && typeof onHistoryOpenChange === 'function';
  const historyOpen = historyIsControlled ? historyOpenProp : historyOpenUncontrolled;
  const setHistoryOpen = useCallback(
    /** @param {boolean | ((prev: boolean) => boolean)} next */
    (next) => {
      if (historyIsControlled) {
        const resolved = typeof next === 'function' ? next(historyOpenProp) : next;
        onHistoryOpenChange?.(resolved);
      } else {
        setHistoryOpenUncontrolled((prev) => (typeof next === 'function' ? next(prev) : next));
      }
    },
    [historyIsControlled, historyOpenProp, onHistoryOpenChange],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const historyOldestRef = useRef(/** @type {string|null} */ (null));
  const historyTitleId = useId();

  const [taskPickOpen, setTaskPickOpen] = useState(false);
  const [taskPickLoading, setTaskPickLoading] = useState(false);
  const [taskPickTasks, setTaskPickTasks] = useState(/** @type {{ id: string, title: string }[]} */ ([]));
  const [taskPickFetchError, setTaskPickFetchError] = useState(/** @type {string | null} */ (null));

  const trimmedTaskId = typeof timerTaskId === 'string' && timerTaskId.trim() ? timerTaskId.trim() : null;
  const trimmedTaskTitle =
    typeof timerTaskTitle === 'string' && timerTaskTitle.trim() ? timerTaskTitle.trim().slice(0, 280) : '';

  const loadTotal = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from('erp_project_time_logs')
      .select('duration_seconds')
      .eq('project_id', projectId);
    if (error) {
      setTotalSeconds(0);
      return;
    }
    const sum = (data || []).reduce((a, r) => a + (Number(r.duration_seconds) || 0), 0);
    setTotalSeconds(sum);
    onTotalChange?.(sum);
  }, [projectId, onTotalChange]);

  const loadHistory = useCallback(
    async ({ reset }) => {
      if (!projectId || !userId) return;
      if (reset) {
        historyOldestRef.current = null;
        setHistoryRows([]);
        setHistoryHasMore(true);
      }
      const append = !reset && historyOldestRef.current !== null;
      try {
        if (append) setHistoryLoadingMore(true);
        else setHistoryLoading(true);

        let q = supabase
          .from('erp_project_time_logs')
          .select(
            `
            id,
            duration_seconds,
            created_at,
            note,
            task_id,
            task:erp_tasks (
              id,
              title
            )
          `,
          )
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(HISTORY_PAGE_SIZE);

        if (append && historyOldestRef.current) {
          q = q.lt('created_at', historyOldestRef.current);
        }

        const { data, error } = await q;

        if (error) {
          if (reset) setHistoryRows([]);
          setHistoryHasMore(false);
          return;
        }

        const incoming = data || [];

        const nextHasMore = incoming.length >= HISTORY_PAGE_SIZE;

        historyOldestRef.current =
          incoming.length > 0 ? incoming[incoming.length - 1]?.created_at || historyOldestRef.current : historyOldestRef.current;

        if (incoming.length === 0) setHistoryHasMore(false);
        else setHistoryHasMore(nextHasMore);

        setHistoryRows((prev) => {
          if (reset) return incoming;
          const ids = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const r of incoming) {
            if (!ids.has(r.id)) merged.push(r);
          }
          return merged;
        });
      } finally {
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
      }
    },
    [projectId, userId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadTotal();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTotal]);

  useEffect(() => {
    const onReload = (e) => {
      const pid = e?.detail?.projectId;
      if (pid && pid === projectId) void loadTotal();
      if (pid && pid === projectId && historyOpen) void loadHistory({ reset: true });
    };
    window.addEventListener('erp-project-time-reload', onReload);
    return () => window.removeEventListener('erp-project-time-reload', onReload);
  }, [projectId, loadTotal, historyOpen, loadHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    void loadHistory({ reset: true });
  }, [historyOpen, loadHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setHistoryOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyOpen]);

  const historyGroups = useMemo(() => groupLogsByLocalDay(historyRows), [historyRows]);
  const taskBreakdown = useMemo(() => summarizeTasksFromRows(historyRows), [historyRows]);
  const sessionsLoaded = historyRows.length;
  const loadedSumSeconds = useMemo(
    () => historyRows.reduce((a, r) => a + (Number(r.duration_seconds) || 0), 0),
    [historyRows],
  );

  const oldestDayLabel =
    historyGroups.length > 0 ? historyGroups[historyGroups.length - 1]?.label || '' : '';
  const newestDayLabel = historyGroups.length > 0 ? historyGroups[0]?.label || '' : '';

  const runningHere = Boolean(active?.projectId === projectId);

  const liveElapsed = runningHere ? liveElapsedSec : 0;

  const start = async () => {
    if (!userId || runningHere || !projectId || saving) return;
    setSaving(true);
    setTaskPickFetchError(null);
    try {
      if (trimmedTaskId) {
        const attach =
          trimmedTaskId && trimmedTaskId.length > 0
            ? { taskId: trimmedTaskId, taskTitle: trimmedTaskTitle }
            : undefined;
        await startTimer(projectId, projectName, attach);
        return;
      }

      const { tasks, error } = await loadProjectTasksForTimerPick(supabase, projectId);

      if (error) {
        setTaskPickTasks([]);
        setTaskPickFetchError(error);
        setTaskPickOpen(true);
        return;
      }

      if (timerPickNeedsUserChoice({ tasks })) {
        setTaskPickTasks(tasks);
        setTaskPickOpen(true);
        return;
      }

      if (tasks.length === 1) {
        const t0 = tasks[0];
        const ttl = typeof t0.title === 'string' && t0.title.trim() ? t0.title.trim().slice(0, 280) : '';
        await startTimer(projectId, projectName, { taskId: t0.id, taskTitle: ttl || '(Untitled task)' });
        return;
      }

      await startTimer(projectId, projectName, undefined);
    } finally {
      setSaving(false);
    }
  };

  const confirmTimerTaskPick = (choice) => {
    const attach = choice.taskId ? { taskId: choice.taskId, taskTitle: choice.taskTitle } : undefined;
    setTaskPickOpen(false);
    setSaving(true);
    void (async () => {
      try {
        await startTimer(projectId, projectName, attach);
      } finally {
        setSaving(false);
      }
    })();
  };

  const cancelTimerTaskPick = () => {
    setTaskPickOpen(false);
    setTaskPickFetchError(null);
  };

  /** Preload tasks when opening the picker after a failed fetch (retry). */
  const openTaskPickRetry = async () => {
    if (!projectId) return;
    setTaskPickLoading(true);
    setTaskPickFetchError(null);
    try {
      const { tasks, error } = await loadProjectTasksForTimerPick(supabase, projectId);
      if (error) {
        setTaskPickFetchError(error);
        setTaskPickTasks([]);
        return;
      }
      if (timerPickNeedsUserChoice({ tasks })) {
        setTaskPickTasks(tasks);
      } else {
        setTaskPickOpen(false);
        setSaving(true);
        try {
          if (tasks.length === 1) {
            const t0 = tasks[0];
            const ttl = typeof t0.title === 'string' && t0.title.trim() ? t0.title.trim().slice(0, 280) : '';
            await startTimer(projectId, projectName, { taskId: t0.id, taskTitle: ttl || '(Untitled task)' });
          } else {
            await startTimer(projectId, projectName, undefined);
          }
        } finally {
          setSaving(false);
        }
      }
    } finally {
      setTaskPickLoading(false);
    }
  };

  const stop = async () => {
    if (!userId || !projectId || !runningHere || saving) return;
    setSaving(true);
    try {
      await stopTimer();
      await loadTotal();
      if (historyOpen) await loadHistory({ reset: true });
    } finally {
      setSaving(false);
    }
  };

  const displayTotal = totalSeconds + liveElapsed;

  const otherRunning =
    active && active.projectId !== projectId ? active.projectName?.trim() || 'Another project' : null;

  const historyModal =
    historyOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[260] flex items-end justify-center px-0 py-3 sm:items-center sm:p-4" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3px] dark:bg-black/70"
              aria-label="Close"
              onClick={() => setHistoryOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={historyTitleId}
              className={`relative z-[1] flex max-h-[min(92vh,40rem)] w-full ${erpModalPanelMaxWidthClass} flex-col overflow-hidden rounded-none border border-teal-200/80 bg-white shadow-[0_24px_72px_-14px_rgba(16,61,77,0.45)] sm:max-h-[min(90vh,720px)] sm:max-w-xl sm:rounded-[1.25rem] dark:border-teal-800/50 dark:bg-[#0c151c] dark:shadow-[0_24px_80px_-16px_rgba(0,0,0,0.65)]`}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-teal-100/95 bg-gradient-to-r from-teal-50 via-cyan-50/50 to-white px-5 py-4 dark:border-teal-900/40 dark:from-[#0e1c24] dark:via-[#0a141c] dark:to-[#081018]">
                <div className="min-w-0 flex gap-3">
                  <div className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl erp-brand-fill text-white shadow-md shadow-teal-900/25">
                    <IconHistory className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p id={historyTitleId} className="text-base font-bold tracking-tight text-[#103D4D] dark:text-teal-100">
                      Session history
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/90 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-900 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100">
                        <IconSpark className="h-3.5 w-3.5 opacity-80" aria-hidden />
                        All-time {formatDuration(Math.max(0, totalSeconds))}
                        {runningHere && liveElapsedSec > 0 ? ` + ${formatDuration(liveElapsedSec)} live` : ''}
                      </span>
                      {sessionsLoaded > 0 ? (
                        <span className="inline-flex rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-600/50 dark:bg-slate-900/50 dark:text-slate-200">
                          {sessionsLoaded} session{sessionsLoaded === 1 ? '' : 's'} loaded
                        </span>
                      ) : null}
                      {newestDayLabel && oldestDayLabel ? (
                        <span
                          className="inline-flex max-w-full truncate rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-200"
                          title={`${newestDayLabel} → ${oldestDayLabel}`}
                        >
                          {historyHasMore ? `${newestDayLabel} → …` : `${newestDayLabel} → ${oldestDayLabel}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="shrink-0 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2832]"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin] sm:px-5">
                {!historyLoading && taskBreakdown.length > 0 ? (
                  <section className="mb-5">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      By task (loaded sessions)
                      {historyHasMore ? (
                        <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                          — extend with “Load older”
                        </span>
                      ) : null}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {taskBreakdown.map((t) => (
                        <div
                          key={t.key}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white px-3 py-2.5 shadow-sm dark:border-teal-900/35 dark:from-[#101b24] dark:to-[#0d1820]"
                        >
                          <span className="min-w-0 truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100" title={t.label}>
                            {t.label}
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-[#103D4D] dark:text-teal-300">{formatDuration(t.seconds)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {historyLoading ? (
                  <p className="py-14 text-center text-sm font-medium text-slate-500 dark:text-slate-400">Loading sessions…</p>
                ) : historyGroups.length === 0 ? (
                  <p className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">No sessions logged yet.</p>
                ) : (
                  <ul className="space-y-6">
                    {historyGroups.map((g) => (
                      <li key={g.dayKey}>
                        <div className="sticky top-0 z-[1] mb-2 flex items-center justify-between gap-2 rounded-xl border border-teal-200/70 bg-gradient-to-r from-teal-100/80 to-cyan-50/60 px-3 py-2 shadow-sm dark:border-teal-900/40 dark:from-teal-950/65 dark:to-[#0c1820] dark:shadow-black/30">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-950 dark:text-teal-100">{g.label}</p>
                          <p className="text-sm font-bold tabular-nums text-[#103D4D] dark:text-teal-200">{formatDuration(g.dayTotal)}</p>
                        </div>
                        <ul className="space-y-2">
                          {g.items.map((row) => {
                            const t = new Date(row.created_at);
                            const timeLabel = Number.isNaN(t.getTime())
                              ? ''
                              : t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                            const note = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null;
                            const taskLbl = sessionTaskLabel(row);
                            return (
                              <li
                                key={row.id}
                                className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-teal-900/30 dark:bg-[#101a22]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{timeLabel}</span>
                                    <span
                                      className={`max-w-[min(100%,280px)] truncate rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                        row.task_id
                                          ? 'bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200'
                                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300'
                                      }`}
                                      title={taskLbl}
                                    >
                                      {taskLbl}
                                    </span>
                                  </div>
                                  <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-teal-100">{formatDuration(row.duration_seconds)}</span>
                                </div>
                                {note ? (
                                  <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{note}</p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                {historyHasMore && !historyLoading ? (
                  <div className="mt-6 flex justify-center border-t border-slate-200/80 pt-5 dark:border-teal-900/35">
                    <button
                      type="button"
                      disabled={historyLoadingMore}
                      onClick={() => void loadHistory({ reset: false })}
                      className="rounded-xl border border-teal-200/90 bg-teal-50 px-5 py-2.5 text-sm font-bold text-[#103D4D] shadow-sm hover:bg-teal-100 disabled:opacity-50 dark:border-teal-700/55 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-900/55"
                    >
                      {historyLoadingMore ? 'Loading…' : 'Load older sessions'}
                    </button>
                  </div>
                ) : null}

                {!historyHasMore && sessionsLoaded > 0 && !historyLoading ? (
                  <p className="mt-4 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">End of history — every session loaded.</p>
                ) : null}

                {sessionsLoaded > 0 && loadedSumSeconds > 0 && !historyLoading ? (
                  <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">
                    Loaded slice total:{' '}
                    <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-400">{formatDuration(loadedSumSeconds)}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const taskPickModal = (
    <ErpProjectTimerTaskPickModal
      open={taskPickOpen}
      loading={taskPickLoading}
      fetchError={taskPickFetchError}
      tasks={taskPickTasks}
      projectName={projectName}
      onPick={(choice) => confirmTimerTaskPick(choice)}
      onCancel={() => cancelTimerTaskPick()}
      onRetry={() => void openTaskPickRetry()}
    />
  );

  /** Header toolbar: timer only */
  const effectiveControlsOnly = Boolean(compact && controlsOnly);
  /** Modals-only: parent owns opening session history */
  const effectiveSummaryOnly = Boolean(compact && summaryOnly && !effectiveControlsOnly);

  const compactControlsRow = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!runningHere ? (
        <button
          type="button"
          onClick={() => void start()}
          disabled={!userId || loading || saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200/90 erp-brand-fill px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-md shadow-teal-900/20 disabled:opacity-40 dark:border-teal-800/55"
          aria-label="Start timer"
        >
          <IconPlayFilled className="h-3.5 w-3.5 shrink-0 opacity-95" />
          {saving ? '…' : 'Start'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void stop()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70"
          aria-label={saving ? 'Saving' : 'Stop timer and save session'}
        >
          <IconPauseFilled className="h-3.5 w-3.5 shrink-0" />
          {saving ? '…' : 'Pause'}
        </button>
      )}
      {runningHere ? (
        <span className="text-[11px] font-bold tabular-nums text-teal-800 dark:text-teal-200">
          {formatDuration(liveElapsedSec || 0)}
        </span>
      ) : null}
    </div>
  );

  if (effectiveSummaryOnly) {
    return (
      <>
        {historyModal}
        {taskPickModal}
      </>
    );
  }

  if (effectiveControlsOnly) {
    return (
      <>
        {compactControlsRow}
        {taskPickModal}
      </>
    );
  }

  if (compact) {
    return (
      <>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {!runningHere ? (
              <button
                type="button"
                onClick={() => void start()}
                disabled={!userId || loading || saving}
                className="inline-flex items-center gap-1 rounded-lg erp-brand-fill px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm disabled:opacity-40"
                aria-label="Start timer"
              >
                <IconPlayFilled className="h-3 w-3 shrink-0 opacity-95" />
                {saving ? '…' : 'Start'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-40"
                aria-label="Stop timer"
              >
                <IconPauseFilled className="h-3 w-3 shrink-0" />
                {saving ? '…' : 'Stop'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              disabled={!userId || loading}
              title="Session history"
              aria-label="Open session history"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-[#103D4D] disabled:pointer-events-none disabled:opacity-40 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-300 dark:hover:border-teal-600 dark:hover:bg-teal-950/55"
            >
              <IconHistory className="h-3 w-3" />
            </button>
            {runningHere ? (
              <span className="text-[10px] font-bold tabular-nums text-rose-700 dark:text-rose-300">{formatDuration(liveElapsedSec || 0)}</span>
            ) : null}
          </div>
        </div>
        {historyModal}
        {taskPickModal}
      </>
    );
  }

  return (
    <>
      <div className="relative rounded-xl border border-slate-200/90 bg-white px-3 pb-9 pt-2 shadow-sm dark:border-teal-900/35 dark:bg-[#101924] dark:shadow-black/25">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          disabled={!userId || loading}
          title="Session history"
          aria-label="Open session history"
          className="absolute bottom-2 right-2 z-[1] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-[#103D4D] disabled:pointer-events-none disabled:opacity-40 dark:border-teal-800/50 dark:bg-[#161f29] dark:text-slate-300 dark:hover:bg-teal-950/40"
        >
          <IconHistory className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Timer</p>
            <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">{loading ? '…' : formatDuration(displayTotal)}</p>
            {runningHere || otherRunning ? (
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {runningHere ? 'Running…' : `Running on ${otherRunning}`}
              </p>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            {!runningHere ? (
              <button
                type="button"
                onClick={() => void start()}
                disabled={!userId || loading || saving}
                className="inline-flex items-center gap-1 rounded-lg erp-brand-fill px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm disabled:opacity-40"
              >
                <IconPlayFilled className="h-3 w-3 shrink-0 opacity-95" />
                {saving ? '…' : 'Start'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70"
              >
                <IconPauseFilled className="h-3 w-3 shrink-0" />
                {saving ? '…' : 'Stop & log'}
              </button>
            )}
          </div>
        </div>
      </div>
      {historyModal}
      {taskPickModal}
    </>
  );
}