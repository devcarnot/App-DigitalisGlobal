'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import {
  REMOTE_STATUS_LABELS,
  calendarDayCountInclusive,
  leaveQuotaYear,
} from '../../lib/erp-remote-work';
import {
  ERP_DARK_SECTION_MAIN_PANEL,
  ERP_DARK_SOLID_CARD,
  ERP_DARK_STAT_AMBER_HOT,
  ERP_DARK_STAT_CYAN,
} from '../../lib/erp-dark-surfaces';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpDateInput from './ErpDateInput';
import ErpRichTextField from './ErpWysiwygMarkdownField';
import ChatMessageHtml from './ChatMessageHtml';
import { prepareRichContentForSave } from '../../lib/rich-text/rich-text-format';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

function statusPillClass(s) {
  if (s === 'approved')
    return 'bg-sky-100 text-sky-900 ring-sky-200/80 dark:bg-sky-950/55 dark:text-sky-200 dark:ring-sky-800/50';
  if (s === 'rejected')
    return 'bg-rose-100 text-rose-900 ring-rose-200/80 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900/50';
  if (s === 'cancelled')
    return 'bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600';
  return 'bg-amber-100 text-amber-950 ring-amber-200/80 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-800/45';
}

export default function ErpRemoteWorkMember() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const CACHE_KEY = uid ? `remote:member:${uid}` : null;
  const [rows, setRows] = useState(() => pickErpCache(CACHE_KEY, (c) => c.rows ?? [], []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setRows(Array.isArray(cached?.rows) ? cached.rows : []);
    }, setLoading);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('erp_remote_work_requests')
        .select(
          'id, start_date, end_date, day_count, status, reason, reason_format, reviewed_at, created_at',
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(200);
      if (qErr) throw new Error(qErr.message);
      const nextRows = data || [];
      writeErpDataCache(CACHE_KEY, { rows: nextRows });
      setRows(nextRows);
    } catch (e) {
      setError(e?.message || 'Could not load remote work requests');
      if (!hasErpDataCache(CACHE_KEY)) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let approved = 0;
    let pending = 0;
    for (const r of rows) {
      const y = leaveQuotaYear(r.start_date);
      if (y !== year) continue;
      if (r.status === 'approved') approved += r.day_count || 0;
      else if (r.status === 'pending') pending += r.day_count || 0;
    }
    return { approved, pending };
  }, [rows, year]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setOk('');
    if (!uid || !supabase) return;
    if (!startDate || !endDate) {
      setError('Choose start and end dates.');
      return;
    }
    const days = calendarDayCountInclusive(startDate, endDate);
    if (days < 1) {
      setError('End date must be on or after start date.');
      return;
    }
    if (leaveQuotaYear(startDate) !== year) {
      setError(`Use dates in ${year} for this year’s record.`);
      return;
    }

    setBusy(true);
    try {
      const preparedReason = prepareRichContentForSave(reason);

      const { error: insErr } = await supabase.from('erp_remote_work_requests').insert({
        user_id: uid,
        start_date: startDate,
        end_date: endDate,
        day_count: days,
        status: 'pending',
        reason: preparedReason.isEmpty ? null : preparedReason.body,
        reason_format: preparedReason.isEmpty ? 'markdown' : preparedReason.format,
      });
      if (insErr) throw new Error(insErr.message);
      setOk('Remote work request submitted. Your lead or admin can approve it from Remote management.');
      setStartDate('');
      setEndDate('');
      setReason('');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not submit request.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest(id) {
    if (!uid) return;
    setBusy(true);
    setError('');
    try {
      const { error: uErr } = await supabase
        .from('erp_remote_work_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('user_id', uid)
        .eq('status', 'pending');
      if (uErr) throw new Error(uErr.message);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      <ErpAdminPageHero eyebrow="Where you work" title="Remote / WFH" accent="emerald" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className={`relative overflow-hidden rounded-2xl border border-sky-200/55 bg-gradient-to-br from-sky-50/90 via-white to-white p-5 shadow-[0_12px_36px_-20px_rgba(14,116,144,0.18)] ring-1 ring-sky-900/[0.04] ${ERP_DARK_STAT_CYAN}`}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl dark:bg-sky-500/12" aria-hidden />
          <p className="text-[11px] font-semibold text-sky-900/85 dark:text-sky-300/90">Approved ({year})</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{stats.approved}</p>
          <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-400">Calendar days · working from home</p>
        </div>
        <div
          className={`relative overflow-hidden rounded-2xl border border-amber-200/55 bg-gradient-to-br from-amber-50/80 via-white to-white p-5 shadow-[0_12px_36px_-20px_rgba(180,83,9,0.12)] ring-1 ring-amber-900/[0.05] ${ERP_DARK_STAT_AMBER_HOT}`}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-500/12" aria-hidden />
          <p className="text-[11px] font-semibold text-amber-900/80 dark:text-amber-200/90">Pending ({year})</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{stats.pending}</p>
          <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-400">Days awaiting approval</p>
        </div>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className={`space-y-4 rounded-2xl border border-sky-200/45 bg-white/95 p-5 shadow-[0_14px_40px_-22px_rgba(14,116,144,0.14)] ring-1 ring-sky-900/[0.04] sm:p-6 ${ERP_DARK_SECTION_MAIN_PANEL}`}
      >
        <h2 className="text-base font-bold text-[#103D4D] dark:text-teal-200">New remote work request</h2>
        <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
          Request days you plan to work from home (or another remote location). This is not annual leave: you are available for work.
        </p>
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/50 dark:text-rose-200">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/45 dark:text-emerald-200">
            {ok}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Start</label>
            <ErpDateInput
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-sky-200/70 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-4 focus:ring-sky-400/15 dark:border-teal-700/60 dark:bg-[#0f181f] dark:text-slate-100 dark:[color-scheme:dark] dark:focus:border-teal-500/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">End</label>
            <ErpDateInput
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-sky-200/70 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-4 focus:ring-sky-400/15 dark:border-teal-700/60 dark:bg-[#0f181f] dark:text-slate-100 dark:[color-scheme:dark] dark:focus:border-teal-500/40"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Reason (optional)</label>
          <ErpRichTextField
            value={reason}
            format="markdown"
            onChange={setReason}
            placeholder="e.g. Focus work from home, client timezone, etc."
            minHeight="4rem"
            showToolbar={false}
            variant="compact"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !profile}
          className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-[#103D4D] py-2.5 text-sm font-bold text-white shadow-md transition hover:opacity-95 disabled:opacity-40 sm:w-auto sm:px-8"
        >
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5 dark:border-teal-800/45 dark:bg-gradient-to-b dark:from-[#0e1824] dark:to-[#060b10]">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Your requests</h2>
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-sky-200 border-t-[#103D4D] border-r-violet-500 dark:border-teal-800 dark:border-r-teal-500 dark:border-t-cyan-300" />
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No requests yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-teal-900/35 ${ERP_DARK_SOLID_CARD}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">Remote work</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusPillClass(r.status)}`}>
                      {REMOTE_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                    {r.start_date} → {r.end_date} · {r.day_count} day{r.day_count === 1 ? '' : 's'}
                  </p>
                  {r.reason ? (
                    <ChatMessageHtml
                      text={r.reason}
                      format={r.reason_format || 'markdown'}
                      className="mt-1 text-[11px] text-slate-500 line-clamp-2 dark:text-slate-400"
                    />
                  ) : null}
                </div>
                {r.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelRequest(r.id)}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
