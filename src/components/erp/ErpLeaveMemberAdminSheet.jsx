'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  calendarDayCountInclusive,
  leaveQuotaYear,
} from '../../lib/erp-leave';
import ErpNativeSelect from './ErpNativeSelect';
import ErpConfirmDialog from './ErpConfirmDialog';
import { useErpSession } from './useErpSession';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';

function toDateInput(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function IconCalendar({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinejoin="round" />
    </svg>
  );
}

function IconBan({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" strokeLinecap="round" />
    </svg>
  );
}

function IconShield({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" strokeLinejoin="round" />
    </svg>
  );
}

const ACTION_META = {
  history: { label: 'Leave history', sub: 'When they took time off' },
  record: { label: 'Record leave', sub: 'Backfill approved days' },
  amend: { label: 'Amend row', sub: 'Dates, type, day count' },
  cancel: { label: 'Cancel row', sub: 'Void a request' },
  status: { label: 'Set status', sub: 'Approve, reject, or reset' },
};

const LEAVE_FILE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const LEAVE_FILE_MAX_BYTES = 8 * 1024 * 1024;

function safeLeaveFileName(f) {
  return String(f?.name || 'document')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
}

/**
 * Slide-over: full leave timeline for one member + five admin tools (see ACTION_META).
 * @param {{ open: boolean, member: { id: string, full_name?: string | null, role?: string | null } | null, leaves: object[], year: number, onClose: () => void, onSaved: () => Promise<void> | void }} props
 */
export default function ErpLeaveMemberAdminSheet({ open, member, leaves, year, onClose, onSaved }) {
  const { profile } = useErpSession();
  const historyTableRef = useRef(null);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [yearFilter, setYearFilter] = useState('all');
  const [leaveCancelConfirmOpen, setLeaveCancelConfirmOpen] = useState(false);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordType, setRecordType] = useState('regular');
  const [recordStart, setRecordStart] = useState('');
  const [recordEnd, setRecordEnd] = useState('');
  const [recordReason, setRecordReason] = useState('');
  const [recordFile, setRecordFile] = useState(null);

  const [amendOpen, setAmendOpen] = useState(false);
  const [amendType, setAmendType] = useState('regular');
  const [amendStart, setAmendStart] = useState('');
  const [amendEnd, setAmendEnd] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const selectedRow = useMemo(() => leaves.find((r) => r.id === selectedId) || null, [leaves, selectedId]);

  const leavesFiltered = useMemo(() => {
    const list = (leaves || []).filter((r) => r.user_id === member?.id);
    if (yearFilter === 'all') return [...list].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    const y = Number(yearFilter);
    return [...list]
      .filter((r) => leaveQuotaYear(r.start_date) === y)
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  }, [leaves, member?.id, yearFilter]);

  const reloadAudit = useCallback(async () => {
    if (!member?.id) return;
    setAuditLoading(true);
    try {
      const { data, error: aErr } = await supabase
        .from('erp_leave_admin_actions')
        .select('id, created_at, action, meta, leave_request_id')
        .eq('target_user_id', member.id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (!aErr) setAudit(data || []);
      else setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, [member?.id]);

  useEffect(() => {
    if (!open || !member?.id) {
      setAudit([]);
      setSelectedId(null);
      setRecordOpen(false);
      setAmendOpen(false);
      setError('');
      setHighlight(null);
      setRecordFile(null);
      return;
    }
    setYearFilter(String(year));
    void reloadAudit();
  }, [open, member?.id, year, reloadAudit]);

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      setError('');
      try {
        await fn();
        await onSaved?.();
        await reloadAudit();
      } catch (e) {
        setError(e?.message || 'Something went wrong');
      } finally {
        setBusy(false);
      }
    },
    [onSaved, reloadAudit],
  );

  async function openAttachment(path) {
    if (!path) return;
    const { data, error: uErr } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (uErr || !data?.signedUrl) return;
    await downloadFromSignedUrlWithFallback(data.signedUrl, basenameFromStoragePath(path));
  }

  function openAmend(row) {
    if (!row) return;
    setSelectedId(row.id);
    setAmendType(row.leave_type);
    setAmendStart(toDateInput(row.start_date));
    setAmendEnd(toDateInput(row.end_date));
    setAmendOpen(true);
  }

  async function submitAmend() {
    if (!selectedRow) return;
    const dc = calendarDayCountInclusive(amendStart, amendEnd);
    if (!amendStart || !amendEnd || dc < 1) {
      setError('Choose valid start and end dates.');
      return;
    }
    await run(async () => {
      const { error: rpcErr } = await supabase.rpc('erp_leave_admin_amend_request', {
        p_request_id: selectedRow.id,
        p_start_date: amendStart,
        p_end_date: amendEnd,
        p_day_count: dc,
        p_leave_type: amendType,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setAmendOpen(false);
    });
  }

  async function submitRecord() {
    if (!member?.id) return;
    const dc = calendarDayCountInclusive(recordStart, recordEnd);
    if (!recordStart || !recordEnd || dc < 1) {
      setError('Choose valid start and end dates.');
      return;
    }
    if (recordFile) {
      if (!LEAVE_FILE_ACCEPT.includes(recordFile.type)) {
        setError('Attachment: use JPEG, PNG, WebP, or PDF.');
        return;
      }
      if (recordFile.size > LEAVE_FILE_MAX_BYTES) {
        setError('Attachment must be 8 MB or smaller.');
        return;
      }
    }
    let uploadedPath = null;
    await run(async () => {
      if (recordFile) {
        uploadedPath = `leave/${member.id}/${Date.now()}_${safeLeaveFileName(recordFile)}`;
        const { error: upErr } = await supabase.storage.from('erp-files').upload(uploadedPath, recordFile, {
          upsert: false,
          contentType: recordFile.type || 'application/octet-stream',
        });
        if (upErr) throw new Error(upErr.message);
      }
      const { error: rpcErr } = await supabase.rpc('erp_leave_admin_record_leave', {
        p_user_id: member.id,
        p_leave_type: recordType,
        p_start_date: recordStart,
        p_end_date: recordEnd,
        p_day_count: dc,
        p_reason: recordReason || null,
        p_attachment_path: uploadedPath,
      });
      if (rpcErr) {
        if (uploadedPath) await supabase.storage.from('erp-files').remove([uploadedPath]);
        throw new Error(rpcErr.message);
      }
      setRecordOpen(false);
      setRecordReason('');
      setRecordStart('');
      setRecordEnd('');
      setRecordFile(null);
    });
  }

  function requestCancelLeaveRow() {
    if (!selectedRow || !['pending', 'approved', 'rejected'].includes(selectedRow.status)) {
      setError('Select a row first, then tap Cancel.');
      return;
    }
    setLeaveCancelConfirmOpen(true);
  }

  async function executeCancelLeaveRow() {
    if (!selectedRow) return;
    setLeaveCancelConfirmOpen(false);
    await run(async () => {
      const { error: rpcErr } = await supabase.rpc('erp_leave_admin_cancel_request', {
        p_request_id: selectedRow.id,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setSelectedId(null);
    });
  }

  async function setStatus(next) {
    if (!selectedRow) return;
    const isSuper = isErpGlobalAdmin(profile?.role);
    await run(async () => {
      if (isSuper) {
        const payload = { status: next };
        const note = statusNote.trim();
        if (note) payload.reviewer_note = note;
        const res = await erpAuthorizedFetch(`/api/erp/admin/leave-requests/${selectedRow.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not update status');
        setStatusNote('');
        return;
      }
      const { error: rpcErr } = await supabase.rpc('erp_leave_admin_set_request_status', {
        p_request_id: selectedRow.id,
        p_status: next,
        p_reviewer_note: statusNote.trim() || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setStatusNote('');
    });
  }

  if (!open || !member) return null;

  return (
    <>
    <div className="fixed inset-0 z-[500] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="leave-admin-sheet-title">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close panel" />
      <div className="relative flex h-full w-full max-w-[min(100%,28rem)] flex-col border-l border-cyan-200/60 bg-gradient-to-b from-white via-cyan-50/20 to-slate-50 shadow-[-12px_0_48px_-12px_rgba(16,61,77,0.25)] sm:max-w-lg">
        <div className="shrink-0 border-b border-cyan-200/50 bg-gradient-to-r from-[#103D4D] via-teal-800 to-[#103D4D] px-4 py-4 text-white shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p id="leave-admin-sheet-title" className="truncate text-lg font-bold tracking-tight">
                {member.full_name?.trim() || 'Member'}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-cyan-100/90 capitalize">
                {String(member.role || '').replace(/_/g, ' ')} · Leave admin
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>

        <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Five admin tools</p>
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 pt-2 sm:grid-cols-3">
          {(
            [
              ['history', IconCalendar],
              ['record', IconPlus],
              ['amend', IconPencil],
              ['cancel', IconBan],
              ['status', IconShield],
            ]
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setHighlight(key);
                setError('');
                if (key === 'record') setRecordOpen(true);
                if (key === 'amend') {
                  if (selectedRow && ['pending', 'approved'].includes(selectedRow.status)) setAmendOpen(true);
                  else setError('Select a pending or approved row in the table first, then tap Amend.');
                }
                if (key === 'cancel') requestCancelLeaveRow();
                if (key === 'status') {
                  if (!selectedRow) setError('Select a row, then use the status buttons below the table.');
                }
                if (key === 'history') {
                  requestAnimationFrame(() =>
                    historyTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                  );
                }
              }}
              className={`flex flex-col items-start gap-1 rounded-xl border px-2.5 py-2.5 text-left transition ${
                highlight === key
                  ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-300/50'
                  : 'border-slate-200/90 bg-white/90 hover:border-cyan-300 hover:bg-cyan-50/50'
              }`}
            >
              <span className="flex items-center gap-1.5 text-[#103D4D]">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-[11px] font-bold leading-tight text-slate-900">{ACTION_META[key].label}</span>
              </span>
              <span className="text-[10px] leading-snug text-slate-500">{ACTION_META[key].sub}</span>
            </button>
          ))}
        </div>

        {error ? (
          <p className="mx-4 mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 [scrollbar-width:thin]">
          {recordOpen ? (
            <section className="mb-5 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-inner ring-1 ring-emerald-900/[0.04]">
              <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-900">Record approved leave</h3>
              <p className="mt-1 text-[11px] text-slate-600">Creates an approved line (counts toward quota). Reason is prefixed for the audit trail.</p>
              <div className="mt-3 grid gap-2">
                <label className="block text-[10px] font-bold uppercase text-slate-500">
                  Type
                  <ErpNativeSelect
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white !pl-2 !pr-10 py-2 text-sm"
                  >
                    <option value="regular">Regular</option>
                    <option value="medical">Medical</option>
                  </ErpNativeSelect>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Start
                    <input
                      type="date"
                      value={recordStart}
                      onChange={(e) => setRecordStart(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    End
                    <input
                      type="date"
                      value={recordEnd}
                      onChange={(e) => setRecordEnd(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-[10px] font-bold uppercase text-slate-500">
                  Note (optional)
                  <textarea
                    value={recordReason}
                    onChange={(e) => setRecordReason(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                    placeholder="e.g. Carry-over from HR spreadsheet"
                  />
                </label>
                <label className="block text-[10px] font-bold uppercase text-slate-500">
                  Attachment (optional)
                  <input
                    type="file"
                    accept={LEAVE_FILE_ACCEPT.join(',')}
                    onChange={(e) => setRecordFile(e.target.files?.[0] || null)}
                    className="mt-1 block w-full cursor-pointer text-xs text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-emerald-200/90 file:bg-white file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-emerald-900 file:shadow-sm hover:file:border-emerald-400/60"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">JPEG, PNG, WebP, or PDF · max 8 MB · same secure folder as self-serve leave attachments.</p>
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitRecord()}
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-40"
                  >
                    Save record
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordOpen(false);
                      setRecordFile(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {amendOpen && selectedRow ? (
            <section className="mb-5 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/80 to-white p-4 shadow-inner">
              <h3 className="text-xs font-bold uppercase tracking-wide text-sky-900">Amend leave</h3>
              <p className="mt-1 text-[11px] text-slate-600">Adjust dates or type. Day count follows the date range.</p>
              <div className="mt-3 grid gap-2">
                <label className="block text-[10px] font-bold uppercase text-slate-500">
                  Type
                  <ErpNativeSelect
                    value={amendType}
                    onChange={(e) => setAmendType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white !pl-2 !pr-10 py-2 text-sm"
                  >
                    <option value="regular">Regular</option>
                    <option value="medical">Medical</option>
                  </ErpNativeSelect>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Start
                    <input
                      type="date"
                      value={amendStart}
                      onChange={(e) => setAmendStart(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    End
                    <input
                      type="date"
                      value={amendEnd}
                      onChange={(e) => setAmendEnd(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                    />
                  </label>
                </div>
                <p className="text-[11px] font-semibold text-slate-700">
                  Days: {calendarDayCountInclusive(amendStart, amendEnd) || '—'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitAmend()}
                    className="rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-40"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmendOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <div ref={historyTableRef} className="mb-3 flex flex-wrap items-center justify-between gap-2 scroll-mt-4">
            <h3 id="leave-history-table" className="text-xs font-bold uppercase tracking-wide text-slate-700">
              When they took leave
            </h3>
            <ErpNativeSelect
              zoneSize="sm"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white !pl-2 !pr-8 py-1.5 text-[11px] font-bold text-slate-800"
            >
              <option value="all">All years</option>
              <option value={String(year)}>{year}</option>
              <option value={String(year - 1)}>{year - 1}</option>
            </ErpNativeSelect>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">St</th>
                  <th className="w-8 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {leavesFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                      No leave rows for this filter.
                    </td>
                  </tr>
                ) : (
                  leavesFiltered.map((r) => {
                    const sel = selectedId === r.id;
                    return (
                      <tr
                        key={r.id}
                        className={`cursor-pointer border-b border-slate-100 transition ${sel ? 'bg-cyan-50 ring-1 ring-inset ring-cyan-200' : 'hover:bg-slate-50/80'}`}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td className="px-2 py-2 font-medium text-slate-800">
                          <span className="block whitespace-nowrap">{r.start_date}</span>
                          <span className="text-slate-400">→ {r.end_date}</span>
                          <span className="ml-1 tabular-nums text-slate-500">({r.day_count}d)</span>
                        </td>
                        <td className="px-2 py-2 text-slate-700">{LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block max-w-[4.5rem] truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              r.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-900'
                                : r.status === 'pending'
                                  ? 'bg-amber-100 text-amber-950'
                                  : r.status === 'rejected'
                                    ? 'bg-rose-100 text-rose-900'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {LEAVE_STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td className="px-1 py-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAmend(r);
                            }}
                            className="rounded-lg p-1 text-[#103D4D] hover:bg-cyan-100"
                            title="Amend"
                          >
                            <IconPencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {selectedRow ? (
            <div className="mt-4 rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/50 to-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-900">Set status — selected row</p>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={2}
                placeholder="Optional note to store on the request…"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedRow.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus('approved')}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus('rejected')}
                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                {isErpGlobalAdmin(profile?.role) && selectedRow.status === 'rejected' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus('approved')}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
                  >
                    Approve (correct reject)
                  </button>
                ) : null}
                {isErpGlobalAdmin(profile?.role) && selectedRow.status === 'approved' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus('rejected')}
                    className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
                  >
                    Reject (correct approve)
                  </button>
                ) : null}
                {['approved', 'rejected', 'cancelled'].includes(selectedRow.status) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus('pending')}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-950 disabled:opacity-40"
                  >
                    Reset to pending
                  </button>
                ) : null}
                {selectedRow.status !== 'cancelled' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus('cancelled')}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 disabled:opacity-40"
                  >
                    Mark cancelled
                  </button>
                ) : null}
              </div>
              {selectedRow.reason ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-500">Reason:</span> {selectedRow.reason}
                </p>
              ) : null}
              {selectedRow.attachment_path ? (
                <button
                  type="button"
                  onClick={() => void openAttachment(selectedRow.attachment_path)}
                  className="mt-2 text-[11px] font-bold text-[#103D4D] underline"
                >
                  Open attachment
                </button>
              ) : null}
            </div>
          ) : null}

          <section className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Admin change log</h3>
              {auditLoading ? <span className="text-[10px] text-slate-400">Loading…</span> : null}
            </div>
            {audit.length === 0 && !auditLoading ? (
              <p className="mt-2 text-[11px] text-slate-500">No manager edits logged yet for this person.</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-[11px]">
                {audit.map((a) => (
                  <li key={a.id} className="rounded-lg border border-white/80 bg-white/90 px-2 py-1.5 shadow-sm">
                    <span className="font-semibold text-slate-800">{a.action}</span>
                    <span className="text-slate-400"> · </span>
                    <span className="tabular-nums text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                    {a.meta && typeof a.meta === 'object' ? (
                      <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600">
                        {JSON.stringify(a.meta)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>

      <ErpConfirmDialog
        open={leaveCancelConfirmOpen}
        title="Cancel this leave?"
        confirmLabel="Cancel leave"
        tone="danger"
        busy={busy}
        onCancel={() => !busy && setLeaveCancelConfirmOpen(false)}
        onConfirm={() => void executeCancelLeaveRow()}
      >
        <p>
          Cancel leave for <span className="font-semibold text-slate-800">{member?.full_name?.trim() || 'member'}</span> (
          {selectedRow ? `${selectedRow.start_date} → ${selectedRow.end_date}` : ''})? This voids the request.
        </p>
      </ErpConfirmDialog>
    </>
  );
}
