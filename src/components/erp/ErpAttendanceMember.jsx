'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpClientSideRole } from '../../lib/erp-roles';
import {
  attendanceRowForDisplay,
  attendanceRowNetSeconds,
  clearAttendanceCheckInAnchorMs,
  clearAttendanceBreakStartAnchorMs,
  pickTodayAttendanceRow,
  readAttendanceCheckInAnchorMs,
  readAttendanceBreakStartAnchorMs,
  attendanceLiveBreakSeconds,
  formatWorkDate,
  dateStringAddDays,
  localDateString,
  parseAttendanceMs,
  purgeInvalidAttendanceCheckInAnchor,
  purgeInvalidAttendanceBreakStartAnchor,
  syncErpAttendanceDay,
  writeAttendanceCheckInAnchorMs,
  writeAttendanceBreakStartAnchorMs,
  dismissNeedsMeItem,
  filterDismissedNeedsMeItems,
} from '../../lib/erp-attendance';
import { formatSecondsAsHms } from './ErpAttendanceCharts';
import {
  broadcastErpAttendanceChange,
  useErpAttendanceCrossTabSync,
  useErpTableRealtime,
  useRefetchOnVisible,
} from '../../lib/erp-realtime-sync';
import {
  buildAttendanceNeedsMeItems,
  shiftPolicySubtitle,
} from '../../lib/erp-attendance-policy';
import AttendancePageFrame from './attendance/AttendancePageFrame';
import AttendanceLiveHero from './attendance/AttendanceLiveHero';
import AttendanceMonthCalendar from './attendance/AttendanceMonthCalendar';
import AttendanceMemberHoursPanel from './attendance/AttendanceMemberHoursPanel';
import AttendanceMemberSidebar from './attendance/AttendanceMemberSidebar';
import AttendanceBreakOptionsMenu from './attendance/AttendanceBreakOptionsMenu';
import AttendanceDashboardWidget from './attendance/AttendanceDashboardWidget';
import {
  useMemberApprovedLeaveDates,
  useMemberLeaveBalances,
} from './attendance/useErpAttendanceLeave';
import { currentMonthString } from '../../lib/erp-attendance-policy';
import ErpConfirmDialog from './ErpConfirmDialog';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const HISTORY_DAYS = 60;

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

/**
 * @param {{ embedded?: boolean, onTimesUpdated?: () => void, dashboardWidget?: boolean }} props
 * When `dashboardWidget`, only the “Today” card is shown (no page hero, no history list): for the ERP dashboard.
 */
export default function ErpAttendanceMember({ embedded = false, onTimesUpdated, dashboardWidget = false }) {
  const { session, profile, workspaceSettingsTick } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `attendance:member:${uid}` : null;

  const [rows, setRows] = useState(() => pickErpCache(CACHE_KEY, (c) => c.rows ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCheckOutOpen, setConfirmCheckOutOpen] = useState(false);
  const [needsMeDismissVersion, setNeedsMeDismissVersion] = useState(0);

  const [todayStr, setTodayStr] = useState(() => localDateString());
  const historyFromStr = useMemo(() => {
    return dateStringAddDays(todayStr, -HISTORY_DAYS);
  }, [todayStr]);

  const refreshTodayFromServer = useCallback(async () => {
    try {
      const { workDate } = await syncErpAttendanceDay(supabase);
      if (workDate) {
        setTodayStr(workDate);
        return;
      }
    } catch {
      /* fall through to legacy work_date RPC */
    }
    try {
      const { data } = await supabase.rpc('erp_work_date_pk');
      const s = typeof data === 'string' ? data : data?.toString?.();
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        setTodayStr(s);
        return;
      }
    } catch {
      /* use local date */
    }
    setTodayStr(localDateString());
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
          'id, work_date, check_in_at, check_out_at, created_at, break_started_at, break_seconds_total, break_type',
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

  useEffect(() => {
    if (!uid) return undefined;
    const syncDay = () => {
      void refreshTodayFromServer().then(() => load());
    };
    const id = setInterval(syncDay, 60_000);
    return () => clearInterval(id);
  }, [uid, refreshTodayFromServer, load]);

  const displayRows = useMemo(() => rows.map((r) => attendanceRowForDisplay(r)), [rows]);

  const todayRow = useMemo(() => pickTodayAttendanceRow(displayRows, todayStr), [displayRows, todayStr]);

  const [clockTick, setClockTick] = useState(0);
  const [checkInAnchorVersion, setCheckInAnchorVersion] = useState(0);
  const [breakAnchorVersion, setBreakAnchorVersion] = useState(0);

  const isLiveCounting = Boolean(todayRow?.check_in_at && !todayRow?.check_out_at);
  const isOnBreak = Boolean(todayRow?.break_started_at && !todayRow?.check_out_at);

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
    if (!uid || !todayRow?.break_started_at || todayRow.check_out_at) return;
    const workDate = String(todayRow.work_date).slice(0, 10);
    purgeInvalidAttendanceBreakStartAnchor(uid, workDate);
    const dbMs = parseAttendanceMs(todayRow.break_started_at);
    if (Number.isNaN(dbMs)) return;
    const existing = readAttendanceBreakStartAnchorMs(uid, workDate);
    const now = Date.now();
    if (Number.isNaN(existing)) {
      const seed = dbMs > now + 2000 ? now : dbMs;
      writeAttendanceBreakStartAnchorMs(uid, workDate, seed);
      setBreakAnchorVersion((v) => v + 1);
      return;
    }
    writeAttendanceBreakStartAnchorMs(uid, workDate, Math.min(existing, dbMs));
    setBreakAnchorVersion((v) => v + 1);
  }, [uid, todayRow?.id, todayRow?.break_started_at, todayRow?.check_out_at, todayRow?.work_date]);

  useEffect(() => {
    if (!isLiveCounting && !isOnBreak) return undefined;
    setClockTick((t) => t + 1);
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isLiveCounting, isOnBreak, todayRow?.id]);

  const nowMs = useMemo(() => Date.now(), [clockTick]);

  const canCheckIn = !todayRow?.check_in_at;
  const canCheckOut = Boolean(todayRow?.check_in_at && !todayRow.check_out_at);
  const canStartBreak = Boolean(todayRow?.check_in_at && !todayRow.check_out_at && !todayRow.break_started_at);
  const canEndBreak = Boolean(todayRow?.break_started_at && !todayRow.check_out_at);

  const liveNetWorkingLabel = useMemo(() => {
    if (!todayRow?.check_in_at) return null;
    const netSec = attendanceRowNetSeconds(todayRow, nowMs, { uid, workDate: todayRow.work_date });
    return formatSecondsAsHms(netSec);
  }, [todayRow, nowMs, uid, checkInAnchorVersion]);

  const liveBreakElapsedLabel = useMemo(() => {
    if (!todayRow?.break_started_at || todayRow.check_out_at) return null;
    const sec = attendanceLiveBreakSeconds(todayRow, nowMs, { uid, workDate: todayRow.work_date });
    return formatSecondsAsHms(sec);
  }, [todayRow, nowMs, uid, breakAnchorVersion]);

  const leaveBalanceData = useMemberLeaveBalances(uid);
  const [viewMonthStr, setViewMonthStr] = useState(() => currentMonthString());
  const viewMonthEnd = useMemo(() => {
    const [y, mo] = viewMonthStr.split('-').map(Number);
    const last = new Date(y, mo, 0).getDate();
    return `${viewMonthStr}-${String(last).padStart(2, '0')}`;
  }, [viewMonthStr]);
  const approvedLeaveDates = useMemberApprovedLeaveDates(uid, `${viewMonthStr}-01`, viewMonthEnd);
  const needsMeLeaveDates = useMemberApprovedLeaveDates(uid, historyFromStr, todayStr);

  const needsMeItems = useMemo(() => {
    const built = buildAttendanceNeedsMeItems(displayRows, todayStr, nowMs, {
      uid,
      approvedLeaveDates: needsMeLeaveDates,
      historyDays: HISTORY_DAYS,
    });
    return filterDismissedNeedsMeItems(uid, built);
  }, [displayRows, todayStr, nowMs, uid, needsMeLeaveDates, needsMeDismissVersion]);

  const onDismissNeedsMeItem = useCallback(
    (kind, dateStr) => {
      if (!uid) return;
      dismissNeedsMeItem(uid, kind, dateStr);
      setNeedsMeDismissVersion((v) => v + 1);
    },
    [uid],
  );

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

  async function onBreakStart(breakType = 'general') {
    if (!uid || !canStartBreak) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('erp_attendance_break_start_pk', {
        p_break_type: breakType,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const workDate = String(todayRow?.work_date || todayStr).slice(0, 10);
      const startedType = data?.break_type || breakType;
      writeAttendanceBreakStartAnchorMs(uid, workDate, Date.now());
      setBreakAnchorVersion((v) => v + 1);
      setRows((prev) =>
        prev.map((r) =>
          r.id === todayRow?.id
            ? { ...r, break_started_at: new Date().toISOString(), break_type: startedType }
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
      clearAttendanceBreakStartAnchorMs(uid, todayRow?.work_date || todayStr);
      setBreakAnchorVersion((v) => v + 1);
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
        clearAttendanceBreakStartAnchorMs(uid, todayRow.work_date);
        setBreakAnchorVersion((v) => v + 1);
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
          {todayRow?.check_in_at ? (
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
                    ? liveBreakElapsedLabel ?? '…'
                    : formatSecondsAsHms(Number(todayRow.break_seconds_total) || 0)
                }
                sub={todayRow.break_started_at ? 'Live timer' : 'Total today'}
                live={Boolean(todayRow.break_started_at)}
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
            {canStartBreak || canEndBreak ? (
              <AttendanceBreakOptionsMenu
                disabled={!profile}
                busy={busy}
                isOnBreak={canEndBreak}
                activeBreakType={todayRow?.break_type}
                onBreakStart={(type) => void onBreakStart(type)}
                onBreakEnd={() => void onBreakEnd()}
                align="left"
              />
            ) : null}
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
          <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-800">
            {error}
          </p>
        ) : null}
        <AttendanceDashboardWidget
          todayStr={todayStr}
          todayRow={todayRow}
          loading={loading}
          hasRows={rows.length > 0}
          liveNetWorkingLabel={liveNetWorkingLabel}
          liveBreakElapsedLabel={liveBreakElapsedLabel}
          isLiveCounting={isLiveCounting}
          isOnBreak={isOnBreak}
          busy={busy}
          profile={profile}
          canCheckIn={canCheckIn}
          canCheckOut={canCheckOut}
          canStartBreak={canStartBreak}
          canEndBreak={canEndBreak}
          onCheckIn={() => void onCheckIn()}
          onCheckOut={() => setConfirmCheckOutOpen(true)}
          onBreakStart={(type) => void onBreakStart(type)}
          onBreakEnd={() => void onBreakEnd()}
        />
        {confirmCheckOutDialog}
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="w-full min-w-0 max-w-none space-y-4 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/45 dark:text-rose-200">
            {error}
          </p>
        ) : null}
        {todayCard}
        {confirmCheckOutDialog}
      </div>
    );
  }

  const policySubtitle = useMemo(() => shiftPolicySubtitle(), [workspaceSettingsTick]);

  return (
    <AttendancePageFrame
      title="My attendance"
      subtitle={policySubtitle}
    >
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/45 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <AttendanceLiveHero
        todayRow={todayRow}
        todayStr={todayStr}
        nowMs={nowMs}
        uid={uid}
        liveNetWorkingLabel={liveNetWorkingLabel}
        liveBreakElapsedLabel={liveBreakElapsedLabel}
        isOnBreak={isOnBreak}
        isLiveCounting={isLiveCounting}
        busy={busy}
        profile={profile}
        canCheckIn={canCheckIn}
        canCheckOut={canCheckOut}
        canStartBreak={canStartBreak}
        canEndBreak={canEndBreak}
        onCheckIn={() => void onCheckIn()}
        onCheckOut={() => setConfirmCheckOutOpen(true)}
        onBreakStart={(type) => void onBreakStart(type)}
        onBreakEnd={() => void onBreakEnd()}
      />

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <AttendanceMonthCalendar
            rows={displayRows}
            todayStr={todayStr}
            nowMs={nowMs}
            uid={uid}
            approvedLeaveDates={approvedLeaveDates}
            monthStr={viewMonthStr}
            onMonthChange={setViewMonthStr}
          />

          <AttendanceMemberHoursPanel
            rows={displayRows}
            todayStr={todayStr}
            nowMs={nowMs}
            uid={uid}
            approvedLeaveDates={approvedLeaveDates}
            monthStr={viewMonthStr}
          />
        </div>

        <AttendanceMemberSidebar
          needsMeItems={needsMeItems}
          onDismissNeedsMeItem={onDismissNeedsMeItem}
          leaveBalances={leaveBalanceData?.balances}
          leaveBreakdown={leaveBalanceData?.breakdown}
          todayStr={todayStr}
          rows={displayRows}
          nowMs={nowMs}
          uid={uid}
          approvedLeaveDates={approvedLeaveDates}
          onCorrectionsChanged={load}
        />
      </div>

      {confirmCheckOutDialog}
    </AttendancePageFrame>
  );
}
