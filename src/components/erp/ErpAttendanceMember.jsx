'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpClientSideRole } from '../../lib/erp-roles';
import {
  attendanceAverageForWindow,
  attendanceBreakEndLabel,
  attendanceBreakTypeLabel,
  attendanceBreakTypeMeta,
  ERP_ATTENDANCE_BREAK_TYPES,
  attendanceRowNetSeconds,
  clearAttendanceCheckInAnchorMs,
  normalizeAttendanceBreakType,
  readAttendanceCheckInAnchorMs,
  formatAttendanceAverageSeconds,
  formatWorkDate,
  dateStringAddDays,
  localDateString,
  parseAttendanceMs,
  purgeInvalidAttendanceCheckInAnchor,
  writeAttendanceCheckInAnchorMs,
} from '../../lib/erp-attendance';
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
import {
  AttendanceHistoryTable,
  AttendanceHoursBarChart,
  buildDailyNetSeries,
  formatNetHoursShort,
  formatSecondsAsHms,
} from './ErpAttendanceCharts';

const HISTORY_DAYS = 60;
const CHART_DAYS = 14;

function AttendanceStatBox({ label, value, sub, tone = 'default', live = false }) {
  const tones = {
    default:
      'border-slate-200/80 bg-white dark:border-teal-900/40 dark:bg-[#0a1018]',
    net:
      'border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-emerald-50/50 dark:border-teal-800/45 dark:from-[#0d141c] dark:to-[#0f1614] dark:[background-image:none]',
    break:
      'border-amber-200/80 bg-amber-50/80 dark:border-amber-900/45 dark:bg-amber-950/35',
    live:
      'border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-cyan-50/40 dark:border-teal-800/45 dark:from-[#0d141c] dark:to-[#101820] dark:[background-image:none]',
  };
  return (
    <div className={`min-w-0 rounded-xl border px-2.5 py-2 shadow-sm ${tones[tone] || tones.default}`}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{sub}</p> : null}
      {live ? (
        <span className="mt-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden title="Live" />
      ) : null}
    </div>
  );
}

function formatAttendanceTimeCompact(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const BREAK_GROUP_BUTTON_CLASS = {
  breaks:
    'border-amber-400/55 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800/45 dark:bg-[#1f1610] dark:text-amber-200/95 dark:hover:bg-[#291c14]',
  leave:
    'border-violet-400/55 bg-violet-50 text-violet-950 hover:bg-violet-100 dark:border-violet-800/45 dark:bg-[#16101f] dark:text-violet-200/95 dark:hover:bg-[#1f1429]',
  work:
    'border-sky-400/55 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-sky-800/45 dark:bg-[#101820] dark:text-sky-200/95 dark:hover:bg-[#142230]',
  other:
    'border-slate-300/70 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-600/45 dark:bg-[#141820] dark:text-slate-200 dark:hover:bg-[#1a2030]',
};

const BREAK_GROUP_PILL_CLASS = {
  breaks:
    'border-amber-200/70 bg-amber-50/80 text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-200/95',
  leave:
    'border-violet-200/70 bg-violet-50/80 text-violet-950 dark:border-violet-900/45 dark:bg-violet-950/35 dark:text-violet-200/95',
  work:
    'border-sky-200/70 bg-sky-50/80 text-sky-950 dark:border-sky-900/45 dark:bg-sky-950/35 dark:text-sky-200/95',
  other:
    'border-slate-200/70 bg-slate-50/80 text-slate-800 dark:border-slate-700/45 dark:bg-slate-900/35 dark:text-slate-200/95',
};

function AttendanceBreakTypePicker({ disabled, onPick }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pause
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {ERP_ATTENDANCE_BREAK_TYPES.map((bt) => (
            <button
              key={bt.id}
              type="button"
              disabled={disabled}
              title={bt.hint}
              onClick={() => onPick(bt.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] font-bold transition disabled:opacity-40 ${BREAK_GROUP_BUTTON_CLASS[bt.group] || BREAK_GROUP_BUTTON_CLASS.other}`}
            >
              {bt.shortLabel}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Multi-day?{' '}
        <Link
          href="/erp/leave"
          className="font-bold text-[#103D4D] underline decoration-cyan-300/60 underline-offset-2 hover:text-teal-800 dark:text-teal-200"
        >
          Leave page →
        </Link>
      </p>
    </div>
  );
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
  const [breakSessions, setBreakSessions] = useState(() => pickErpCache(CACHE_KEY, (c) => c.breakSessions ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCheckOutOpen, setConfirmCheckOutOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('stats');

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
      setBreakSessions(Array.isArray(cached?.breakSessions) ? cached.breakSessions : []);
      if (cached?.todayStr) setTodayStr(cached.todayStr);
    }, setLoading);
    setError('');
    try {
      await refreshTodayFromServer();
      const { data, error: qErr } = await supabase
        .from('erp_attendance_days')
        .select(
          'id, work_date, check_in_at, check_out_at, created_at, break_started_at, break_seconds_total, break_type',
        )
        .eq('user_id', uid)
        .gte('work_date', historyFromStr)
        .order('work_date', { ascending: false });
      if (qErr) throw new Error(qErr.message);
      const nextRows = data || [];
      const dayIds = nextRows.map((r) => r.id).filter(Boolean);
      let nextBreakSessions = [];
      if (dayIds.length > 0) {
        const { data: sessions, error: sErr } = await supabase
          .from('erp_attendance_break_sessions')
          .select('id, attendance_day_id, break_type, started_at, ended_at, duration_seconds')
          .in('attendance_day_id', dayIds)
          .order('started_at', { ascending: false });
        if (!sErr) nextBreakSessions = sessions || [];
      }
      writeErpDataCache(CACHE_KEY, { rows: nextRows, todayStr, breakSessions: nextBreakSessions });
      setRows(nextRows);
      setBreakSessions(nextBreakSessions);
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

  const todayRow = useMemo(() => {
    const byDate = rows.find((r) => String(r.work_date).slice(0, 10) === todayStr);
    if (byDate) return byDate;
    return rows.find((r) => r.check_in_at && !r.check_out_at) ?? null;
  }, [rows, todayStr]);

  const todayBreakSessions = useMemo(() => {
    if (!todayRow?.id) return [];
    return breakSessions
      .filter((s) => s.attendance_day_id === todayRow.id)
      .sort((a, b) => parseAttendanceMs(b.started_at) - parseAttendanceMs(a.started_at));
  }, [breakSessions, todayRow?.id]);

  const [clockTick, setClockTick] = useState(0);
  const [checkInAnchorVersion, setCheckInAnchorVersion] = useState(0);

  const isLiveCounting = Boolean(todayRow?.check_in_at && !todayRow?.check_out_at);

  useEffect(() => {
    if (!uid || !todayRow?.check_in_at || todayRow.check_out_at) return;
    const workDate = String(todayRow.work_date).slice(0, 10);
    purgeInvalidAttendanceCheckInAnchor(uid, workDate);
    const dbMs = parseAttendanceMs(todayRow.check_in_at);
    if (Number.isNaN(dbMs)) return;
    const existing = readAttendanceCheckInAnchorMs(uid, workDate);
    const now = Date.now();
    if (Number.isNaN(existing)) {
      const seed = dbMs > now + 2000 ? now : dbMs;
      writeAttendanceCheckInAnchorMs(uid, workDate, seed);
      setCheckInAnchorVersion((v) => v + 1);
      return;
    }
    writeAttendanceCheckInAnchorMs(uid, workDate, Math.min(existing, dbMs));
    setCheckInAnchorVersion((v) => v + 1);
  }, [uid, todayRow?.id, todayRow?.check_in_at, todayRow?.check_out_at, todayRow?.work_date]);

  useEffect(() => {
    if (!isLiveCounting) return undefined;
    setClockTick((t) => t + 1);
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isLiveCounting, todayRow?.id]);

  const nowMs = useMemo(() => Date.now(), [clockTick]);

  const canCheckIn = !todayRow;
  const canCheckOut = todayRow && !todayRow.check_out_at;
  const canStartBreak = Boolean(todayRow?.check_in_at && !todayRow.check_out_at && !todayRow.break_started_at);
  const canEndBreak = Boolean(todayRow?.break_started_at && !todayRow.check_out_at);

  const liveNetWorkingLabel = useMemo(() => {
    if (!todayRow?.check_in_at) return null;
    const netSec = attendanceRowNetSeconds(todayRow, nowMs, { uid, workDate: todayRow.work_date });
    return formatSecondsAsHms(netSec);
  }, [todayRow, nowMs, uid, checkInAnchorVersion]);

  const liveBreakElapsedLabel = useMemo(() => {
    if (!todayRow?.break_started_at || todayRow.check_out_at) return null;
    const t = parseAttendanceMs(todayRow.break_started_at);
    if (Number.isNaN(t)) return null;
    const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
    return formatSecondsAsHms(sec);
  }, [todayRow?.break_started_at, todayRow?.check_out_at, nowMs]);

  const averageStats = useMemo(() => {
    const windows = [
      { key: '7d', label: '7 days', days: 7 },
      { key: '14d', label: '2 weeks', days: 14 },
      { key: '30d', label: '30 days', days: 30 },
    ];
    return windows.map((w) => ({
      ...w,
      ...attendanceAverageForWindow(rows, todayStr, w.days, nowMs, { uid }),
    }));
  }, [rows, todayStr, nowMs, uid]);

  const chartSeries = useMemo(
    () => buildDailyNetSeries(rows, todayStr, CHART_DAYS, uid, nowMs),
    [rows, todayStr, nowMs, uid],
  );

  const periodTotals = useMemo(() => {
    const stat30 = averageStats.find((s) => s.key === '30d');
    return {
      totalSec: stat30?.totalSec ?? 0,
      loggedDayCount: stat30?.loggedDayCount ?? 0,
    };
  }, [averageStats]);

  async function onCheckIn() {
    if (!uid || !canCheckIn) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('erp_attendance_check_in_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      const workDate = data?.work_date ? String(data.work_date).slice(0, 10) : todayStr;
      if (data?.work_date) setTodayStr(workDate);
      writeAttendanceCheckInAnchorMs(uid, workDate, Date.now());
      setCheckInAnchorVersion((v) => v + 1);
      await load();
      broadcastErpAttendanceChange(uid);
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not check in');
    } finally {
      setBusy(false);
    }
  }

  async function onBreakStart(breakType = 'short') {
    if (!uid || !canStartBreak) return;
    const normalizedType = normalizeAttendanceBreakType(breakType);
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_break_start_pk', {
        p_break_type: normalizedType,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setRows((prev) =>
        prev.map((r) =>
          r.id === todayRow?.id
            ? { ...r, break_started_at: new Date().toISOString(), break_type: normalizedType }
            : r,
        ),
      );
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
      setRows((prev) =>
        prev.map((r) =>
          r.id === todayRow?.id
            ? { ...r, break_started_at: null, break_type: null }
            : r,
        ),
      );
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
      clearAttendanceCheckInAnchorMs(uid, todayRow.work_date);
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
    <section
      className={`rounded-xl border border-cyan-200/45 bg-white/95 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-teal-900/45 dark:bg-[#0c121a] dark:ring-teal-950/30 ${
        embedded ? 'p-3' : 'p-4 sm:p-5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#103D4D] dark:text-white">
          {embedded ? 'Your check-in' : 'Today'}
        </h2>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatWorkDate(todayStr)}</span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-6">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-cyan-300" />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {todayRow ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <AttendanceStatBox
                label="Check-in"
                value={formatAttendanceTimeCompact(todayRow.check_in_at)}
              />
              <AttendanceStatBox
                label="Check-out"
                value={todayRow.check_out_at ? formatAttendanceTimeCompact(todayRow.check_out_at) : '—'}
                sub={todayRow.check_out_at ? null : 'Still in'}
              />
              <AttendanceStatBox
                label="Break"
                tone={todayRow.break_started_at ? 'break' : 'default'}
                value={
                  todayRow.break_started_at
                    ? liveBreakElapsedLabel || '…'
                    : formatSecondsAsHms(Number(todayRow.break_seconds_total) || 0)
                }
                sub={
                  todayRow.break_started_at
                    ? `${attendanceBreakTypeLabel(todayRow.break_type, { short: true })} · paused`
                    : todayBreakSessions.length > 0
                      ? `${todayBreakSessions.length} pause${todayBreakSessions.length === 1 ? '' : 's'} today`
                      : 'Total today'
                }
              />
              {liveNetWorkingLabel ? (
                <AttendanceStatBox
                  label={isLiveCounting ? 'Net working' : 'Net worked'}
                  tone={isLiveCounting ? 'live' : 'net'}
                  value={liveNetWorkingLabel}
                  sub={isLiveCounting ? 'Live timer' : 'Final'}
                  live={isLiveCounting && !todayRow.break_started_at}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">You have not checked in yet today.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !profile || !canCheckIn}
              onClick={() => void onCheckIn()}
              className="rounded-lg erp-brand-fill px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-40"
            >
              Check in
            </button>
            <button
              type="button"
              disabled={busy || !profile || !canCheckOut}
              onClick={() => setConfirmCheckOutOpen(true)}
              className="rounded-lg border border-[#103D4D]/25 bg-white px-3.5 py-1.5 text-xs font-bold text-[#103D4D] transition hover:bg-cyan-50 disabled:opacity-40 dark:border-teal-700/40 dark:bg-[#131b24] dark:text-slate-200 dark:hover:bg-[#18222d]"
            >
              Check out
            </button>
            {canEndBreak ? (
              <button
                type="button"
                disabled={busy || !profile}
                onClick={() => void onBreakEnd()}
                className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-800/35 dark:bg-[#101816] dark:text-emerald-200/90 dark:hover:bg-[#15221c]"
              >
                {attendanceBreakEndLabel(todayRow?.break_type)}
              </button>
            ) : null}
          </div>

          {canStartBreak ? (
            <AttendanceBreakTypePicker disabled={busy || !profile} onPick={(id) => void onBreakStart(id)} />
          ) : null}

          {todayBreakSessions.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {todayBreakSessions.map((s) => {
                const meta = attendanceBreakTypeMeta(s.break_type);
                const pillClass =
                  BREAK_GROUP_PILL_CLASS[meta?.group || 'other'] || BREAK_GROUP_PILL_CLASS.other;
                return (
                  <li
                    key={s.id}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pillClass}`}
                  >
                    {attendanceBreakTypeLabel(s.break_type, { short: true })} ·{' '}
                    {formatSecondsAsHms(Number(s.duration_seconds) || 0)}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {!canCheckIn && !canCheckOut && todayRow?.check_out_at ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {dashboardWidget ? 'Day complete.' : 'Day complete · open Statistics or History tab below'}
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
    <div className="w-full min-w-0 max-w-none space-y-4 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      {!embedded ? (
        <ErpAdminPageHero eyebrow="Time tracking" title="Check-in & check-out" accent="teal" />
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/45 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {todayCard}

      {!dashboardWidget ? (
        <section
          className={`rounded-xl border border-slate-200/80 bg-white/95 shadow-sm dark:border-teal-800/45 dark:bg-[#0c121a] ${
            embedded ? 'p-3' : 'p-4 sm:p-5'
          }`}
        >
          <div role="tablist" aria-label="Attendance details" className="flex flex-wrap gap-1.5">
            {[
              { id: 'stats', label: 'Statistics' },
              { id: 'history', label: 'History', count: rows.length },
            ].map((tab) => {
              const active = detailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDetailTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                    active
                      ? 'bg-[#103D4D] text-white ring-1 ring-cyan-300/60 dark:bg-teal-700/80 dark:ring-teal-500/40'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-[#101a22] dark:text-slate-300 dark:ring-teal-900/55 dark:hover:bg-[#152230]'
                  }`}
                >
                  {tab.label}
                  {tab.count != null ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {detailTab === 'stats' ? (
            <div role="tabpanel" className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {averageStats.map((stat) => (
                  <div
                    key={stat.key}
                    className="rounded-xl border border-teal-200/55 bg-gradient-to-br from-teal-50/70 to-white px-2.5 py-2 dark:border-teal-900/45 dark:from-[#0e1824] dark:to-[#0c141a] dark:[background-image:none]"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-teal-800/80 dark:text-teal-300/90">
                      Avg · {stat.label}
                    </p>
                    <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[#103D4D] dark:text-white">
                      {stat.workDayCount > 0 ? formatAttendanceAverageSeconds(stat.avgSec) : '—'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {stat.workDayCount > 0
                        ? `${stat.workDayCount} work days (Mon–Sat)${stat.loggedDayCount > 0 ? ` · ${stat.loggedDayCount} logged` : ''}`
                        : 'No data'}
                    </p>
                  </div>
                ))}
                <div className="rounded-xl border border-violet-200/55 bg-gradient-to-br from-violet-50/70 to-white px-2.5 py-2 dark:border-violet-900/45 dark:from-[#141020] dark:to-[#0c1018] dark:[background-image:none]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-violet-800/80 dark:text-violet-300/90">
                    Total · 30 days
                  </p>
                  <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[#103D4D] dark:text-white">
                    {periodTotals.loggedDayCount > 0 ? formatNetHoursShort(periodTotals.totalSec) : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Net working time{periodTotals.loggedDayCount > 0 ? ` · ${periodTotals.loggedDayCount} days logged` : ''}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-teal-900/35 dark:bg-[#0a1018]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-white">Daily hours</p>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Last {CHART_DAYS} days
                  </span>
                </div>
                <AttendanceHoursBarChart
                  labels={chartSeries.labels}
                  minutes={chartSeries.minutes}
                  dates={chartSeries.dates}
                  compact={embedded}
                />
              </div>
            </div>
          ) : (
            <div
              role="tabpanel"
              className={`mt-3 overflow-y-auto pr-1 [scrollbar-width:thin] ${
                embedded ? 'max-h-[min(16rem,35vh)]' : 'max-h-[min(22rem,45vh)]'
              }`}
            >
              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-cyan-300" />
                </div>
              ) : (
                <AttendanceHistoryTable rows={rows} uid={uid} />
              )}
              <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                Last {HISTORY_DAYS} days · times in your local timezone
              </p>
            </div>
          )}
        </section>
      ) : null}
      {confirmCheckOutDialog}
    </div>
  );
}
