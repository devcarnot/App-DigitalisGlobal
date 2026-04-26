'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import {
  formatAttendanceDateTime,
  formatDurationBetween,
  formatWorkDate,
  dateStringAddDays,
  localDateString,
} from '../../lib/erp-attendance';
import ErpAdminPageHero from './ErpAdminPageHero';

const HISTORY_DAYS = 60;

/**
 * @param {{ embedded?: boolean, onTimesUpdated?: () => void, dashboardWidget?: boolean }} props
 * When `dashboardWidget`, only the “Today” card is shown (no page hero, no history list) — for the ERP dashboard.
 */
export default function ErpAttendanceMember({ embedded = false, onTimesUpdated, dashboardWidget = false }) {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    setLoading(true);
    setError('');
    try {
      await refreshTodayFromServer();
      const { data, error: qErr } = await supabase
        .from('erp_attendance_days')
        .select('id, work_date, check_in_at, check_out_at, created_at')
        .eq('user_id', uid)
        .gte('work_date', historyFromStr)
        .order('work_date', { ascending: false });
      if (qErr) throw new Error(qErr.message);
      setRows(data || []);
    } catch (e) {
      setError(e?.message || 'Could not load attendance');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid, historyFromStr, refreshTodayFromServer]);

  useEffect(() => {
    load();
  }, [load]);

  const todayRow = useMemo(() => rows.find((r) => String(r.work_date).slice(0, 10) === todayStr), [rows, todayStr]);

  const canCheckIn = !todayRow;
  const canCheckOut = todayRow && !todayRow.check_out_at;

  /** Live ticking clock for the "checked-in but not checked-out" state.
   *  Only re-renders this component once per second while needed. */
  const isLiveCounting = Boolean(todayRow?.check_in_at && !todayRow?.check_out_at);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isLiveCounting) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLiveCounting]);

  const liveElapsedLabel = useMemo(() => {
    if (!todayRow?.check_in_at) return null;
    const startMs = new Date(todayRow.check_in_at).getTime();
    if (Number.isNaN(startMs)) return null;
    const endMs = todayRow.check_out_at ? new Date(todayRow.check_out_at).getTime() : nowMs;
    const ms = Math.max(0, endMs - startMs);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, [todayRow?.check_in_at, todayRow?.check_out_at, nowMs]);

  async function onCheckIn() {
    if (!uid || !canCheckIn) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('erp_attendance_check_in_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      if (data?.work_date) setTodayStr(String(data.work_date).slice(0, 10));
      await load();
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not check in');
    } finally {
      setBusy(false);
    }
  }

  async function onCheckOut() {
    if (!uid || !todayRow?.id || !canCheckOut) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('erp_attendance_check_out_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      if (data?.work_date) setTodayStr(String(data.work_date).slice(0, 10));
      await load();
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not check out');
    } finally {
      setBusy(false);
    }
  }

  const todayCard = (
    <section className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white via-cyan-50/20 to-white p-5 shadow-[0_14px_40px_-22px_rgba(16,61,77,0.16)] ring-1 ring-cyan-900/[0.04] sm:p-6">
        <h2 className="text-base font-bold text-[#103D4D]">Today</h2>
        <p className="mt-1 text-sm text-slate-600">
          Date: <span className="font-semibold text-slate-800">{formatWorkDate(todayStr)}</span>
        </p>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D]" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {todayRow ? (
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-in</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">{formatAttendanceDateTime(todayRow.check_in_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Check-out</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">
                      {todayRow.check_out_at ? formatAttendanceDateTime(todayRow.check_out_at) : '—'}
                    </dd>
                  </div>
                </dl>
                {liveElapsedLabel ? (
                  <div
                    className={`mt-3 inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${
                      isLiveCounting
                        ? 'bg-gradient-to-r from-teal-50 via-cyan-50 to-emerald-50 ring-1 ring-teal-200/70'
                        : 'bg-emerald-50/80 ring-1 ring-emerald-200/70'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide ${
                        isLiveCounting ? 'text-teal-800' : 'text-emerald-800'
                      }`}
                    >
                      {isLiveCounting ? 'Working time' : 'Total worked'}
                    </span>
                    <span
                      className={`font-mono text-base font-bold tabular-nums ${
                        isLiveCounting ? 'text-teal-950' : 'text-emerald-900'
                      }`}
                    >
                      {liveElapsedLabel}
                    </span>
                    {isLiveCounting ? (
                      <span
                        className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500"
                        aria-hidden
                        title="Live"
                      />
                    ) : null}
                    {!isLiveCounting && todayRow.check_in_at && todayRow.check_out_at ? (
                      <span className="text-xs font-medium text-emerald-800/80">
                        ({formatDurationBetween(todayRow.check_in_at, todayRow.check_out_at)})
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-600">You have not checked in yet today.</p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !profile || !canCheckIn}
                onClick={() => void onCheckIn()}
                className="rounded-xl bg-[#103D4D] px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-[#0c333f] disabled:opacity-40"
              >
                Check in
              </button>
              <button
                type="button"
                disabled={busy || !profile || !canCheckOut}
                onClick={() => void onCheckOut()}
                className="rounded-xl border-2 border-[#103D4D] bg-white px-6 py-2.5 text-sm font-bold text-[#103D4D] shadow-sm transition hover:bg-cyan-50 disabled:opacity-40"
              >
                Check out
              </button>
            </div>
            {!canCheckIn && !canCheckOut && todayRow?.check_out_at ? (
              <p className="text-xs text-slate-500">
                {dashboardWidget ? 'Day complete.' : 'Day complete. See history below.'}
              </p>
            ) : null}
          </div>
        )}
    </section>
  );

  if (dashboardWidget) {
    return (
      <div className="w-full max-w-none text-[13px] leading-snug text-slate-800">
        {error ? (
          <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">{error}</p>
        ) : null}
        {todayCard}
        <p className="mt-2 text-center sm:text-left">
          <Link
            href="/erp/attendance"
            className="text-[11px] font-bold text-[#103D4D] underline decoration-cyan-300/60 underline-offset-2 hover:text-teal-800"
          >
            Full attendance & history →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div
      className={`w-full space-y-6 text-[13px] leading-snug text-slate-800 ${embedded ? 'max-w-none' : 'max-w-2xl'}`}
    >
      {embedded ? (
        <div className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white to-cyan-50/30 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-[#103D4D]">Your check-in</h2>
        </div>
      ) : (
        <ErpAdminPageHero eyebrow="Time tracking" title="Check-in & check-out" accent="teal" />
      )}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      {todayCard}

      <section
        className={`rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 ${embedded ? 'max-h-[min(18rem,40vh)] overflow-hidden' : ''}`}
      >
        <h2 className="text-sm font-bold text-slate-900">Recent days</h2>
        <p className="mt-0.5 text-xs text-slate-500">Last {HISTORY_DAYS} days on this device calendar.</p>
        {loading ? null : rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No entries yet.</p>
        ) : (
          <ul
            className={`mt-3 space-y-2 overflow-y-auto pr-1 ${embedded ? 'max-h-[min(12rem,30vh)]' : 'max-h-[min(24rem,50vh)]'}`}
          >
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-semibold text-slate-800">{formatWorkDate(r.work_date)}</span>
                <span className="text-slate-600">
                  <span className="text-slate-500">In</span> {formatAttendanceDateTime(r.check_in_at)}
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-500">Out</span>{' '}
                  {r.check_out_at ? formatAttendanceDateTime(r.check_out_at) : '—'}
                  {r.check_in_at && r.check_out_at ? (
                    <span className="ml-2 font-medium text-emerald-800">
                      ({formatDurationBetween(r.check_in_at, r.check_out_at)})
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
