'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpProjectTimer } from './ErpProjectTimerContext';

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** @param {{ created_at: string, duration_seconds: number, note?: string|null }[]} rows sorted newest first */
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

function IconHistory({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

export default function ErpProjectTimeLogger({
  projectId,
  userId,
  projectName,
  onTotalChange,
  /**
   * When true, renders a minimal inline Start/Stop button + history icon only
   * (no wrapper card, no duplicate timer/total labels). Use inside existing KPI
   * cards that already show the logged time.
   */
  compact = false,
}) {
  const { active, liveElapsedSec, startTimer, stopTimer } = useErpProjectTimer();
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const historyTitleId = useId();

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

  const loadHistory = useCallback(async () => {
    if (!projectId || !userId) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('erp_project_time_logs')
        .select('id, duration_seconds, created_at, note')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(400);
      if (error) {
        setHistoryRows([]);
        return;
      }
      setHistoryRows(data || []);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId, userId]);

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
      if (pid && pid === projectId && historyOpen) void loadHistory();
    };
    window.addEventListener('erp-project-time-reload', onReload);
    return () => window.removeEventListener('erp-project-time-reload', onReload);
  }, [projectId, loadTotal, historyOpen, loadHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    void loadHistory();
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

  const runningHere = Boolean(active?.projectId === projectId);

  const liveElapsed = runningHere ? liveElapsedSec : 0;

  const start = async () => {
    if (!userId || runningHere) return;
    setSaving(true);
    try {
      await startTimer(projectId, projectName);
    } finally {
      setSaving(false);
    }
  };

  const stop = async () => {
    if (!userId || !projectId || !runningHere || saving) return;
    setSaving(true);
    try {
      await stopTimer();
      await loadTotal();
      if (historyOpen) await loadHistory();
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
          <div className="fixed inset-0 z-[260] flex items-end justify-center p-3 sm:items-center sm:p-4" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              aria-label="Close"
              onClick={() => setHistoryOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={historyTitleId}
              className="relative z-[1] flex max-h-[min(85vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-teal-200/80 bg-white shadow-[0_24px_64px_-12px_rgba(16,61,77,0.35)]"
            >
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-teal-100/90 bg-gradient-to-r from-teal-50/90 to-white px-4 py-3">
                <div className="min-w-0">
                  <p id={historyTitleId} className="text-sm font-bold text-[#103D4D]">
                    Session history
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-teal-800/75">Your logged time on this project</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="shrink-0 rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
                {historyLoading ? (
                  <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
                ) : historyGroups.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">No sessions logged yet.</p>
                ) : (
                  <ul className="space-y-5">
                    {historyGroups.map((g) => (
                      <li key={g.dayKey}>
                        <div className="flex items-baseline justify-between gap-2 border-b border-teal-100/80 pb-1">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800/90">{g.label}</p>
                          <p className="text-[11px] font-bold tabular-nums text-teal-950">{formatDuration(g.dayTotal)}</p>
                        </div>
                        <ul className="mt-2 space-y-1.5">
                          {g.items.map((row) => {
                            const t = new Date(row.created_at);
                            const timeLabel = Number.isNaN(t.getTime())
                              ? ''
                              : t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                            const note = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null;
                            return (
                              <li
                                key={row.id}
                                className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-lg bg-slate-50/90 px-2 py-1.5 text-[12px]"
                              >
                                <span className="tabular-nums text-slate-600">{timeLabel}</span>
                                <span className="font-semibold tabular-nums text-slate-900">
                                  {formatDuration(row.duration_seconds)}
                                </span>
                                {note ? (
                                  <span className="w-full text-[11px] leading-snug text-slate-500">{note}</span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-1.5">
          {!runningHere ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!userId || loading || saving}
              className="inline-flex items-center gap-1 rounded-lg bg-[#103D4D] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm hover:bg-[#0d3442] disabled:opacity-40"
              aria-label="Start timer"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
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
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden />
              {saving ? '…' : 'Stop'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            disabled={!userId || loading}
            title="Session history"
            aria-label="Open session history"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-[#103D4D] disabled:pointer-events-none disabled:opacity-40"
          >
            <IconHistory className="h-3 w-3" />
          </button>
          {runningHere ? (
            <span className="text-[10px] font-bold tabular-nums text-rose-700">
              {formatDuration(liveElapsedSec || 0)}
            </span>
          ) : null}
        </div>
        {historyModal}
      </>
    );
  }

  return (
    <>
      <div className="relative rounded-xl border border-slate-200/90 bg-white px-3 pb-9 pt-2 shadow-sm">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          disabled={!userId || loading}
          title="Session history"
          aria-label="Open session history"
          className="absolute bottom-2 right-2 z-[1] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-[#103D4D] disabled:pointer-events-none disabled:opacity-40"
        >
          <IconHistory className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Timer</p>
            <p className="text-sm font-bold tabular-nums text-slate-900">{loading ? '…' : formatDuration(displayTotal)}</p>
            <p className="text-[10px] text-slate-500">
              {runningHere ? 'Running…' : otherRunning ? `Running on ${otherRunning}` : 'total logged'}
            </p>
          </div>
          <div className="flex gap-1.5">
            {!runningHere ? (
              <button
                type="button"
                onClick={() => void start()}
                disabled={!userId || loading || saving}
                className="rounded-lg bg-[#103D4D] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm hover:bg-[#0d3442] disabled:opacity-40"
              >
                {saving ? '…' : 'Start'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={saving}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-40"
              >
                {saving ? '…' : 'Stop & log'}
              </button>
            )}
          </div>
        </div>
      </div>
      {historyModal}
    </>
  );
}
