'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { localDateString } from '../../lib/erp-attendance';
import { broadcastErpAttendanceChange } from '../../lib/erp-realtime-sync';

/**
 * Compact check-in CTA for the mobile dashboard greeting card.
 */
export default function ErpDashboardMobileCheckIn({ onTimesUpdated }) {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const [todayStr, setTodayStr] = useState(() => localDateString());
  const [todayRow, setTodayRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!uid) {
      setTodayRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let workDate = localDateString();
      try {
        const { data: wd } = await supabase.rpc('erp_work_date_pk');
        const s = typeof wd === 'string' ? wd : wd?.toString?.();
        if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) workDate = s;
      } catch {
        /* use local date */
      }
      setTodayStr(workDate);

      const { data, error: qErr } = await supabase
        .from('erp_attendance_days')
        .select('id, work_date, check_in_at, check_out_at')
        .eq('user_id', uid)
        .eq('work_date', workDate)
        .maybeSingle();
      if (qErr && qErr.code !== 'PGRST116') throw qErr;
      setTodayRow(data || null);
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load attendance');
      setTodayRow(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const canCheckIn = !todayRow;
  const checkedIn = Boolean(todayRow?.check_in_at);
  const checkedOut = Boolean(todayRow?.check_out_at);

  async function onCheckIn() {
    if (!uid || !canCheckIn) return;
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('erp_attendance_check_in_pk');
      if (rpcErr) throw new Error(rpcErr.message);
      await load();
      broadcastErpAttendanceChange(uid);
      onTimesUpdated?.();
    } catch (e) {
      setError(e?.message || 'Could not check in');
    } finally {
      setBusy(false);
    }
  }

  const statusLine = useMemo(() => {
    if (loading) return 'Loading attendance…';
    if (checkedOut) return 'You are checked out for today.';
    if (checkedIn) return 'You are checked in.';
    return "You haven't checked in yet today.";
  }, [loading, checkedIn, checkedOut]);

  return (
    <div className="mt-4">
      {error ? (
        <p className="mb-2 rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {!checkedOut && canCheckIn ? (
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void onCheckIn()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl erp-brand-fill py-3.5 text-[15px] font-bold text-white shadow-md shadow-teal-900/20 transition active:scale-[0.98] disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          Check in
        </button>
      ) : checkedIn && !checkedOut ? (
        <Link
          href="/erp/attendance"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#103D4D]/20 bg-white/90 py-3 text-[14px] font-bold text-[#103D4D] dark:border-teal-700/40 dark:bg-[#0f1a24] dark:text-teal-100"
        >
          View today&apos;s shift
        </Link>
      ) : null}
      <p className="mt-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400">{statusLine}</p>
      {!checkedOut && canCheckIn ? (
        <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
          <Link href="/erp/attendance" className="font-semibold text-violet-600 dark:text-violet-300">
            Skip for now
          </Link>
        </p>
      ) : null}
    </div>
  );
}
