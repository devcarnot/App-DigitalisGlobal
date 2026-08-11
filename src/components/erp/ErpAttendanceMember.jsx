'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpClientSideRole } from '../../lib/erp-roles';
import {
  attendanceAverageForWindow,
  formatAttendanceAverageSeconds,
  formatAttendanceDateTime,
  formatWorkDate,
  dateStringAddDays,
  localDateString,
} from '../../lib/erp-attendance';
import { ERP_DARK_SECTION_MAIN_PANEL, ERP_DARK_SOLID_CARD } from '../../lib/erp-dark-surfaces';
import {
  broadcastErpAttendanceChange,
  useErpAttendanceCrossTabSync,
  useErpTableRealtime,
  useRefetchOnVisible,
} from '../../lib/erp-realtime-sync';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpConfirmDialog from './ErpConfirmDialog';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const HISTORY_DAYS = 60;

function formatSecondsAsHms(totalSec) {
  const n = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * @param {{ embedded?: boolean, onTimesUpdated?: () => void, dashboardWidget?: boolean }} props
 * When `dashboardWidget`, only the “Today” card is shown (no page hero, no history list): for the ERP dashboard.
 */
export default function ErpAttendanceMember({ embedded = false, onTimesUpdated, dashboardWidget = false }) {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `attendance:member:${uid}` : null;

  const [rows, setRows] = useState(() => pickErpCache(CACHE_KEY, (c) => c.rows ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCheckOutOpen, setConfirmCheckOutOpen] = useState(false);

  const [todayStr, setTodayStr] = useState(() => localDateString());
  const historyFromStr = useMemo(() => {
    return dateStringAddDays(todayStr, -HISTORY_DAYS);
  }, [todayStr]);

  const refreshTodayFromServer = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('erp_work_date_pk');
      const s = typeof data === 'string' ? data : data?.toString?.();
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        setTodayStr(s);
      }
    } catch {
      // If RPC isn't deployed yet, fall back to local date.
      setTodayStr(localDateString());
    }
  }, []);

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setRows(Array.isArray(cached?.rows) ? cached.rows : []);
      if (cached?.todayStr) setTodayStr(cached.todayStr);
    }, setLoading);
    setError('');
    try {
      await refreshTodayFromServer();
      const { data, error: qErr } = await supabase
        .from('erp_attendance_days')
        .select(
          'id, work_date, check_in_at, check_out_at, created_at, break_started_at, break_seconds_total',
        )
        .eq('user_id', uid)
        .gte('work_date', historyFromStr)
        .order('work_date', { ascending: false });
      if (qErr) throw new Error(qErr.message);
      const nextRows = data || [];
      writeErpDataCache(CACHE_KEY, { rows: nextRows, todayStr });
      setRows(nextRows);
    } catch (e) {
      setError(e?.message || 'Could not load attendance');
      if (!hasErpDataCache(CACHE_KEY)) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, uid, historyFromStr, refreshTodayFromServer, todayStr]);

  useEffect(() => {
    load();
  }, [load]);

  useErpTableRealtime({
    enabled: Boolean(uid),
    channelName: `erp-attendance-member-${uid}`,
    table: 'erp_attendance_days',
    filter: uid ? `user_id=eq.${uid}` : undefined,
    onChange: load,
  });
  useErpAttendanceCrossTabSync(uid, load);
  useRefetchOnVisible(load, Boolean(uid));

  const todayRow = useMemo(() => rows.find((r) => String(r.work_date).slice(0, 10) === todayStr), [rows, todayStr]);

  const canCheckIn = !todayRow;
  const canCheckOut = todayRow && !todayRow.check_out_at;
  const canStartBreak = Boolean(todayRow?.check_in_at && !todayRow.check_out_at && !todayRow.break_started_at);
  const canEndBreak = Boolean(todayRow?.break_started_at && !todayRow.check_out_at);

  /** Live ticking clock for open shift (gross elapsed); net working time excludes completed + current break. */
  const isLiveCounting = Boolean(todayRow?.check_in_at && !todayRow?.check_out_at);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isLiveCounting) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLiveCounting]);

  const liveNetWorkingLabel = useMemo(() => {
    if (!todayRow?.check_in_at) return null;
    const startMs = new Date(todayRow.check_in_at).getTime();
    if (Number.isNaN(startMs)) return null;
    const endMs = todayRow.check_out_at ? new Date(todayRow.check_out_at).getTime() : nowMs;
    const grossSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const breakStored = Number(todayRow.break_seconds_total) || 0;
    const breakLiveSec =
      !todayRow.check_out_at && todayRow.break_started_at
        ? Math.max(0, Math.floor((nowMs - new Date(todayRow.break_started_at).getTime()) / 1000))
        : 0;
    const netSec = Math.max(0, grossSec - breakStored - breakLiveSec);
    return formatSecondsAsHms(netSec);
  }, [
    todayRow?.check_in_at,
    todayRow?.check_out_at,
    todayRow?.break_started_at,
    todayRow?.break_seconds_total,
    nowMs,
  ]);

  const liveBreakElapsedLabel = useMemo(() => {
    if (!todayRow?.break_started_at || todayRow.check_out_at) return null;
    const t = new Date(todayRow.break_started_at).getTime();
    if (Number.isNaN(t)) return null;
    const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
    return formatSecondsAsHms(sec);
  }, [todayRow?.break_started_at, todayRow?.check_out_at, nowMs]);

  const averageStats = useMemo(() => {
    const windows = [
      { key: '7d', label: 'Last 7 days', days: 7 },
      { key: '14d', label: 'Last 2 weeks', days: 14 },
      { key: '30d', label: 'Last month', days: 30 },
    ];
    return windows.map((w) => ({
      ...w,
      ...attendanceAverageForWindow(rows, todayStr, w.days, nowMs),
    }));
  }, [rows, todayStr, nowMs]);

  async function onCheckIn() {
    if (!uid || !canCheckIn) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('erp_attendance_check_in_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      if (data?.work_date) setTodayStr(String(data.work_date).slice(0, 10));
      await load();
      broadcastErpAttendanceChange(uid);
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not check in');
    } finally {
      setBusy(false);
    }
  }

  async function onBreakStart() {
    if (!uid || !canStartBreak) return;
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_break_start_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      await load();
      broadcastErpAttendanceChange(uid);
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not start break');
    } finally {
      setBusy(false);
    }
  }

  async function onBreakEnd() {
    if (!uid || !canEndBreak) return;
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_break_end_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      await load();
      broadcastErpAttendanceChange(uid);
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not end break');
    } finally {
      setBusy(false);
    }
  }

  async function onCheckOut() {
    if (!uid || !todayRow?.id || !canCheckOut) return;
    setBusy(true);
    setError('');
    try {
      if (todayRow.break_started_at) {
        const { error: bErr } = await supabase.rpc('erp_attendance_break_end_pk');
        if (bErr) throw new Error(bErr.message);
      }
      const { data, error: rpcErr } = await supabase.rpc('erp_attendance_check_out_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      if (data?.work_date) setTodayStr(String(data.work_date).slice(0, 10));
      await load();
      broadcastErpAttendanceChange(uid);
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not check out');
    } finally {
      setBusy(false);
    }
  }

  const todayCard = (
    <section className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white via-cyan-50/20 to-white p-5 shadow-[0_14px_40px_-22px_rgba(16,61,77,0.16)] ring-1 ring-cyan-900/[0.04] sm:p-6 dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-black/35 dark:ring-teal-950/30 dark:[background-image:none]">
        <h2 className="text-base font-bold text-[#103D4D] dark:text-white">Today</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Date: <span className="font-semibold text-slate-800 dark:text-white">{formatWorkDate(todayStr)}</span>
        </p>

        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-cyan-300" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {todayRow ? (
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-teal-900/35 dark:bg-[#090e14] dark:shadow-none">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Check-in</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatAttendanceDateTime(todayRow.check_in_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Check-out</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                      {todayRow.check_out_at ? formatAttendanceDateTime(todayRow.check_out_at) : 'n/a'}
                    </dd>
                  </div>
                  {(Number(todayRow.break_seconds_total) > 0 || todayRow.break_started_at) && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Break
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                        {todayRow.break_started_at
                          ? `Since ${formatAttendanceDateTime(todayRow.break_started_at)} (${liveBreakElapsedLabel || 'n/a'} so far)`
                          : `${formatSecondsAsHms(Number(todayRow.break_seconds_total) || 0)} total today`}
                      </dd>
                    </div>
                  )}
                </dl>
                {liveNetWorkingLabel ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <div
                      className={`inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${
                        isLiveCounting
                          ? 'bg-gradient-to-r from-teal-50 via-cyan-50 to-emerald-50 ring-1 ring-teal-200/70 dark:bg-[#0d141c] dark:ring-teal-800/35 dark:[background-image:none]'
                          : 'bg-emerald-50/80 ring-1 ring-emerald-200/70 dark:bg-[#0f1614] dark:ring-emerald-900/35 dark:[background-image:none]'
                      }`}
                    >
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wide ${
                          isLiveCounting ? 'text-teal-800 dark:text-slate-400' : 'text-emerald-800 dark:text-slate-400'
                        }`}
                      >
                        {isLiveCounting ? 'Working time (net)' : 'Total worked (net)'}
                      </span>
                      <span
                        className={`font-mono text-base font-bold tabular-nums ${
                          isLiveCounting ? 'text-teal-950 dark:text-slate-100' : 'text-emerald-900 dark:text-slate-100'
                        }`}
                      >
                        {liveNetWorkingLabel}
                      </span>
                      {isLiveCounting && !todayRow.break_started_at ? (
                        <span
                          className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500"
                          aria-hidden
                          title="Live"
                        />
                      ) : null}
                    </div>
                    {todayRow.break_started_at && !todayRow.check_out_at && liveBreakElapsedLabel ? (
                      <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 ring-1 ring-amber-200/70 dark:border-amber-900/50 dark:bg-amber-950/45 dark:ring-amber-800/40">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                          On break
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-amber-950 dark:text-amber-100">
                          {liveBreakElapsedLabel}
                        </span>
                        <span
                          className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"
                          aria-hidden
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">You have not checked in yet today.</p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !profile || !canCheckIn}
                onClick={() => void onCheckIn()}
                className="rounded-xl erp-brand-fill px-6 py-2.5 text-sm font-bold text-white shadow-md transition disabled:opacity-40"
              >
                Check in
              </button>
              <button
                type="button"
                disabled={busy || !profile || !canCheckOut}
                onClick={() => setConfirmCheckOutOpen(true)}
                className="rounded-xl border-2 border-[#103D4D] bg-white px-6 py-2.5 text-sm font-bold text-[#103D4D] shadow-sm transition hover:bg-cyan-50 disabled:opacity-40 dark:border-teal-700/40 dark:bg-[#131b24] dark:text-slate-200 dark:shadow-none dark:[background-image:none] dark:hover:bg-[#18222d]"
              >
                Check out
              </button>
              <button
                type="button"
                disabled={busy || !profile || !canStartBreak}
                onClick={() => void onBreakStart()}
                className="rounded-xl border-2 border-amber-500/70 bg-amber-50 px-5 py-2.5 text-sm font-bold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-40 dark:border-amber-800/45 dark:bg-[#1f1610] dark:text-amber-200/95 dark:hover:bg-[#291c14] dark:[background-image:none]"
              >
                Start break
              </button>
              <button
                type="button"
                disabled={busy || !profile || !canEndBreak}
                onClick={() => void onBreakEnd()}
                className="rounded-xl border-2 border-emerald-600/50 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-800/35 dark:bg-[#101816] dark:text-emerald-200/90 dark:hover:bg-[#15221c] dark:[background-image:none]"
              >
                End break
              </button>
            </div>
            {!canCheckIn && !canCheckOut && todayRow?.check_out_at ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dashboardWidget ? 'Day complete.' : 'Day complete. See history below.'}
              </p>
            ) : null}
          </div>
        )}
    </section>
  );

  const confirmCheckOutDialog = (
    <ErpConfirmDialog
      open={confirmCheckOutOpen}
      title="Check out?"
      description="Are you sure you want to check out for today? This will end your working time."
      confirmLabel="Check out"
      tone="teal"
      busy={busy}
      onCancel={() => !busy && setConfirmCheckOutOpen(false)}
      onConfirm={() => {
        void onCheckOut().finally(() => setConfirmCheckOutOpen(false));
      }}
    />
  );

  if (dashboardWidget) {
    if (isErpClientSideRole(profile?.role)) return null;
    return (
      <div className="w-full max-w-none text-[13px] leading-snug text-slate-800 dark:text-slate-100">
        {error ? (
          <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">{error}</p>
        ) : null}
        {todayCard}
        {!isErpClientSideRole(profile?.role) ? (
        <p className="mt-2 text-center sm:text-left">
          <Link
            href="/erp/attendance"
            className="text-[11px] font-bold text-[#103D4D] underline decoration-cyan-300/60 underline-offset-2 hover:text-teal-800 dark:text-teal-200 dark:hover:text-white"
          >
            Full attendance & history →
          </Link>
        </p>
        ) : null}
        {confirmCheckOutDialog}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-6 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      {embedded ? (
        <div
          className={`rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white to-cyan-50/30 px-4 py-3 sm:px-5 ${ERP_DARK_SECTION_MAIN_PANEL}`}
        >
          <h2 className="text-sm font-bold text-[#103D4D] dark:text-teal-200">Your check-in</h2>
        </div>
      ) : (
        <ErpAdminPageHero eyebrow="Time tracking" title="Check-in & check-out" accent="teal" />
      )}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/45 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {todayCard}

      {!embedded && !dashboardWidget ? (
        <section className="grid gap-3 sm:grid-cols-3">
          {averageStats.map((stat) => (
            <div
              key={stat.key}
              className="rounded-2xl border border-teal-200/55 bg-gradient-to-br from-teal-50/80 via-white to-cyan-50/40 p-4 shadow-sm ring-1 ring-teal-900/[0.04] dark:border-teal-900/45 dark:from-[#0e1824] dark:via-[#0c141a] dark:to-[#081018] dark:ring-teal-950/30 dark:[background-image:none]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800/80 dark:text-teal-300/90">
                {stat.label}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#103D4D] dark:text-white">
                {stat.dayCount > 0 ? formatAttendanceAverageSeconds(stat.avgSec) : 'n/a'}
              </p>
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                {stat.dayCount > 0
                  ? `Avg per day · ${stat.dayCount} day${stat.dayCount === 1 ? '' : 's'} with time logged`
                  : 'No completed days in this window'}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <section
        className={`rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-teal-800/45 dark:bg-gradient-to-b dark:from-[#0e1824] dark:to-[#060b10] dark:shadow-[0_12px_40px_-24px_rgba(0,0,0,0.45)] ${embedded ? 'max-h-[min(18rem,40vh)] overflow-hidden' : ''}`}
      >
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent days</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Last {HISTORY_DAYS} days on this device calendar.</p>
        {loading ? null : rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No entries yet.</p>
        ) : (
          <ul
            className={`mt-3 space-y-2 overflow-y-auto pr-1 ${embedded ? 'max-h-[min(12rem,30vh)]' : 'max-h-[min(24rem,50vh)]'}`}
          >
            {rows.map((r) => (
              <li
                key={r.id}
                className={`flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-teal-900/35 ${ERP_DARK_SOLID_CARD}`}
              >
                <span className="font-semibold text-slate-800 dark:text-white">{formatWorkDate(r.work_date)}</span>
                <span className="text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500">In</span> {formatAttendanceDateTime(r.check_in_at)}
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-500">Out</span>{' '}
                  {r.check_out_at ? formatAttendanceDateTime(r.check_out_at) : 'n/a'}
                  {r.check_in_at && r.check_out_at ? (
                    <span className="ml-2 font-medium text-emerald-800 dark:text-emerald-300">
                      (
                      {formatSecondsAsHms(
                        Math.max(
                          0,
                          Math.floor(
                            (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 1000,
                          ) - (Number(r.break_seconds_total) || 0),
                        ),
                      )}{' '}
                      net
                      {Number(r.break_seconds_total) > 0
                        ? ` · breaks ${formatSecondsAsHms(Number(r.break_seconds_total))}`
                        : ''}
                      )
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmCheckOutDialog}
    </div>
  );
}
