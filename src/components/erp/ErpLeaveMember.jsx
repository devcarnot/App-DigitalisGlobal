'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import {
  ERP_LEAVE_MEDICAL_QUOTA,
  ERP_LEAVE_REGULAR_QUOTA,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  calendarDayCountInclusive,
  leaveQuotaYear,
} from '../../lib/erp-leave';
import {
  ERP_DARK_SECTION_MAIN_PANEL,
  ERP_DARK_SOLID_CARD,
  ERP_DARK_STAT_CYAN,
  ERP_DARK_STAT_VIOLET,
} from '../../lib/erp-dark-surfaces';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpNativeSelect from './ErpNativeSelect';
import ErpDateInput from './ErpDateInput';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../lib/erp-upload-limits';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = ERP_MAX_UPLOAD_BYTES;

function safeName(f) {
  return String(f?.name || 'document')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
}

function statusPillClass(s) {
  if (s === 'approved')
    return 'bg-emerald-100 text-emerald-900 ring-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-800/50';
  if (s === 'rejected')
    return 'bg-rose-100 text-rose-900 ring-rose-200/80 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-900/50';
  if (s === 'cancelled')
    return 'bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600';
  return 'bg-amber-100 text-amber-950 ring-amber-200/80 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-800/45';
}

export default function ErpLeaveMember() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const [leaveType, setLeaveType] = useState('regular');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);

  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('erp_leave_requests')
        .select(
          'id, leave_type, start_date, end_date, day_count, status, reason, attachment_path, reviewed_at, created_at',
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(200);
      if (qErr) throw new Error(qErr.message);
      setRows(data || []);
    } catch (e) {
      setError(e?.message || 'Could not load leave requests');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let regApproved = 0;
    let medApproved = 0;
    let regPending = 0;
    let medPending = 0;
    for (const r of rows) {
      const y = leaveQuotaYear(r.start_date);
      if (y !== year) continue;
      if (r.status === 'approved') {
        if (r.leave_type === 'regular') regApproved += r.day_count || 0;
        else medApproved += r.day_count || 0;
      } else if (r.status === 'pending') {
        if (r.leave_type === 'regular') regPending += r.day_count || 0;
        else medPending += r.day_count || 0;
      }
    }
    return {
      regApproved,
      medApproved,
      regPending,
      medPending,
      regLeft: Math.max(0, ERP_LEAVE_REGULAR_QUOTA - regApproved - regPending),
      medLeft: Math.max(0, ERP_LEAVE_MEDICAL_QUOTA - medApproved - medPending),
    };
  }, [rows, year]);

  async function openAttachment(path) {
    if (!path) return;
    const { data, error: uErr } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (uErr || !data?.signedUrl) return;
    await downloadFromSignedUrlWithFallback(data.signedUrl, basenameFromStoragePath(path));
  }

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
    if (leaveType === 'medical' && !file) {
      setError('Medical leave requires a document (image or PDF).');
      return;
    }
    const y = leaveQuotaYear(startDate);
    if (y !== year) {
      setError(`Use dates in ${year} for this year’s quota, or apply after the year changes.`);
      return;
    }
    const need = leaveType === 'regular' ? stats.regLeft : stats.medLeft;
    if (days > need) {
      setError(`Not enough ${leaveType} balance (${need} day(s) left including pending).`);
      return;
    }

    setBusy(true);
    try {
      let attachmentPath = null;
      if (file) {
        if (!ACCEPT.includes(file.type)) {
          setError('Attachment: use JPEG, PNG, WebP, or PDF.');
          setBusy(false);
          return;
        }
        if (file.size > MAX_BYTES) {
          setError(`Attachment must be ${ERP_MAX_UPLOAD_MB} MB or smaller.`);
          setBusy(false);
          return;
        }
        const path = `leave/${uid}/${Date.now()}_${safeName(file)}`;
        const { error: upErr } = await supabase.storage.from('erp-files').upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });
        if (upErr) throw new Error(upErr.message);
        attachmentPath = path;
      }

      const { error: insErr } = await supabase.from('erp_leave_requests').insert({
        user_id: uid,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        day_count: days,
        status: 'pending',
        reason: reason.trim() || null,
        attachment_path: attachmentPath,
      });
      if (insErr) {
        if (attachmentPath) await supabase.storage.from('erp-files').remove([attachmentPath]);
        throw new Error(insErr.message);
      }
      setOk('Leave request submitted. Workspace admins are notified in Recent Activity and can review it on Leave.');
      setStartDate('');
      setEndDate('');
      setReason('');
      setFile(null);
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
        .from('erp_leave_requests')
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
      <ErpAdminPageHero eyebrow="Time off" title="Leave" accent="emerald" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className={`relative overflow-hidden rounded-2xl border border-cyan-200/55 bg-gradient-to-br from-cyan-50/80 via-white to-white p-5 shadow-[0_12px_36px_-20px_rgba(16,61,77,0.18)] ring-1 ring-cyan-900/[0.04] ${ERP_DARK_STAT_CYAN}`}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl dark:bg-cyan-500/12"
            aria-hidden
          />
          <p className="text-[11px] font-semibold text-[#103D4D]/85 dark:text-teal-300/90">Regular</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {stats.regApproved + stats.regPending}
            <span className="text-base font-semibold text-slate-500 dark:text-slate-400"> / {ERP_LEAVE_REGULAR_QUOTA}</span>
          </p>
          <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
            {stats.regPending > 0 ? `${stats.regPending} pending · ` : ''}
            {stats.regLeft} remaining
          </p>
        </div>
        <div
          className={`relative overflow-hidden rounded-2xl border border-violet-200/55 bg-gradient-to-br from-violet-50/70 via-white to-white p-5 shadow-[0_12px_36px_-20px_rgba(91,33,182,0.12)] ring-1 ring-violet-900/[0.05] ${ERP_DARK_STAT_VIOLET}`}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-violet-400/15 blur-2xl dark:bg-violet-500/12"
            aria-hidden
          />
          <p className="text-[11px] font-semibold text-violet-900/80 dark:text-violet-300/90">Medical</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {stats.medApproved + stats.medPending}
            <span className="text-base font-semibold text-slate-500 dark:text-slate-400"> / {ERP_LEAVE_MEDICAL_QUOTA}</span>
          </p>
          <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
            {stats.medPending > 0 ? `${stats.medPending} pending · ` : ''}
            {stats.medLeft} remaining
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className={`space-y-4 rounded-2xl border border-cyan-200/45 bg-white/95 p-5 shadow-[0_14px_40px_-22px_rgba(16,61,77,0.16)] ring-1 ring-cyan-900/[0.04] sm:p-6 ${ERP_DARK_SECTION_MAIN_PANEL}`}
      >
        <h2 className="text-base font-bold text-[#103D4D] dark:text-teal-200">New request</h2>
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-200">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/45 dark:text-emerald-200">
            {ok}
          </p>
        ) : null}

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Type</label>
          <ErpNativeSelect
            value={leaveType}
            onChange={(e) => {
              setLeaveType(e.target.value);
              if (e.target.value === 'regular') setFile(null);
            }}
            className="w-full rounded-xl border border-cyan-200/70 bg-white !pl-3 !pr-10 py-2 text-sm font-medium text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-4 focus:ring-cyan-400/15 dark:border-teal-700/60 dark:bg-[#0f181f] dark:text-slate-100 dark:focus:border-teal-500/50 dark:focus:ring-teal-900/40"
          >
            <option value="regular">{LEAVE_TYPE_LABELS.regular}</option>
            <option value="medical">{LEAVE_TYPE_LABELS.medical}</option>
          </ErpNativeSelect>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Start</label>
            <ErpDateInput
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-4 focus:ring-cyan-400/15 dark:border-teal-700/60 dark:bg-[#0f181f] dark:text-slate-100 dark:[color-scheme:dark] dark:focus:border-teal-500/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">End</label>
            <ErpDateInput
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-4 focus:ring-cyan-400/15 dark:border-teal-700/60 dark:bg-[#0f181f] dark:text-slate-100 dark:[color-scheme:dark] dark:focus:border-teal-500/50"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#103D4D]/40 focus:outline-none focus:ring-4 focus:ring-cyan-400/15 dark:border-teal-700/60 dark:bg-[#0f181f] dark:text-slate-100 dark:focus:border-teal-500/50"
            placeholder="Short note for your lead / admin"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            {leaveType === 'medical' ? 'Medical document (required)' : 'Attachment (optional)'}
          </label>
          <input
            type="file"
            accept={ACCEPT.join(',')}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full cursor-pointer text-xs text-slate-600 file:mr-3 file:cursor-pointer file:rounded-xl file:border file:border-cyan-200/80 file:bg-gradient-to-b file:from-cyan-50 file:to-white file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[#103D4D] file:shadow-sm hover:file:border-[#103D4D]/35 dark:text-slate-400 dark:file:border-teal-700/60 dark:file:bg-gradient-to-b dark:file:from-teal-900/55 dark:file:to-slate-900 dark:file:text-teal-200"
          />
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">JPEG, PNG, WebP, or PDF · max {ERP_MAX_UPLOAD_MB} MB</p>
        </div>

        <button
          type="submit"
          disabled={busy || !profile}
          className="w-full rounded-xl erp-brand-fill py-2.5 text-sm font-bold text-white shadow-md transition disabled:opacity-40 sm:w-auto sm:px-8"
        >
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <section
        className={`rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5 dark:border-teal-800/45 dark:bg-gradient-to-b dark:from-[#0e1824] dark:to-[#060b10] dark:shadow-[0_12px_40px_-20px_rgba(0,0,0,0.4)]`}
      >
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Your requests</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 dark:border-teal-800 dark:border-r-teal-500 dark:border-t-cyan-300" />
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
                    <span className="font-semibold text-slate-900 dark:text-white">{LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusPillClass(r.status)}`}>
                      {LEAVE_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                    {r.start_date} → {r.end_date} · {r.day_count} day{r.day_count === 1 ? '' : 's'}
                  </p>
                  {r.reason ? <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 dark:text-slate-400">{r.reason}</p> : null}
                  {r.attachment_path ? (
                    <button
                      type="button"
                      onClick={() => void openAttachment(r.attachment_path)}
                      className="mt-1 text-[11px] font-bold text-[#103D4D] hover:underline dark:text-teal-300"
                    >
                      View attachment
                    </button>
                  ) : null}
                </div>
                {r.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelRequest(r.id)}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700"
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
