'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import {
  erpModalBackdropClass,
  erpModalFooterClass,
  erpModalPanelClass,
  ErpModalCloseButton,
} from './ErpModalFormPrimitives';
import { LEAVE_TYPE_LABELS } from '../../lib/erp-leave';
import { isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';

/** Status pill — same palette as the rest of the leave UI. */
function StatusPill({ status }) {
  const k = String(status || '').toLowerCase();
  const map = {
    approved:
      'bg-emerald-100 text-emerald-800 ring-emerald-300/70 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-800/55',
    pending:
      'bg-amber-100 text-amber-900 ring-amber-300/70 dark:bg-amber-950/55 dark:text-amber-100 dark:ring-amber-800/55',
    rejected:
      'bg-rose-100 text-rose-800 ring-rose-300/70 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55',
    cancelled:
      'bg-slate-100 text-slate-700 ring-slate-300/70 dark:bg-slate-800/65 dark:text-slate-200 dark:ring-slate-700/60',
  };
  const cls = map[k] || map.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${cls}`}
    >
      {k || 'pending'}
    </span>
  );
}

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(d);
  }
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(d);
  }
};

/**
 * Read-only details popup for one leave request, with a kebab "more"
 * menu in the header so admins / team managers can change the response
 * (status) without leaving the dialog.
 *
 * Props:
 *   open, request, memberName, reviewerName, viewerRole,
 *   onClose, onChangeStatus(newStatus), onOpenAttachment(path), busy
 */
export default function ErpLeaveDetailModal({
  open,
  request,
  memberName,
  reviewerName,
  viewerRole,
  onClose,
  onChangeStatus,
  onOpenAttachment,
  busy = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on Escape and (separately) close the kebab menu on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) {
        if (menuOpen) setMenuOpen(false);
        else onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, menuOpen, onClose, open]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  // Reset the kebab when the dialog closes / re-opens for a different row.
  useEffect(() => {
    if (!open) setMenuOpen(false);
  }, [open, request?.id]);

  const statusActions = useMemo(() => {
    if (!request) return [];
    const cur = String(request.status || 'pending').toLowerCase();
    const isSuper = isErpGlobalAdmin(viewerRole);
    const isManager = isErpManagerRole(viewerRole); // admin OR team_lead

    if (isSuper) {
      // Super Admin can move freely between every state (server route allows it).
      return [
        { id: 'approved', label: 'Mark as approved', tone: 'emerald' },
        { id: 'rejected', label: 'Mark as rejected', tone: 'rose' },
        { id: 'pending', label: 'Re-open as pending', tone: 'amber' },
        { id: 'cancelled', label: 'Mark as cancelled', tone: 'slate' },
      ].filter((a) => a.id !== cur);
    }
    if (isManager) {
      // Team leads can only act on pending rows (server filter `.eq('status','pending')`).
      if (cur !== 'pending') return [];
      return [
        { id: 'approved', label: 'Approve request', tone: 'emerald' },
        { id: 'rejected', label: 'Reject request', tone: 'rose' },
      ];
    }
    return [];
  }, [request, viewerRole]);

  const canChangeStatus = statusActions.length > 0;

  const handleAction = useCallback(
    async (next) => {
      setMenuOpen(false);
      if (!onChangeStatus || !next) return;
      await onChangeStatus(next);
    },
    [onChangeStatus],
  );

  if (!open || !request) return null;

  const typeLabel = LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type || 'Leave';

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[100] flex items-stretch justify-center p-0 sm:p-4"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => !busy && onClose?.()}
          className={erpModalBackdropClass}
        />
        <div
          className={erpModalPanelClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="erp-leave-detail-title"
        >
          <div className="relative shrink-0 border-b border-slate-200/80 bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-4 text-white dark:border-teal-900/55 dark:from-[#0e2c3a] dark:to-teal-900">
            <div className="flex items-start justify-between gap-3 pr-12">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/90">
                  Leave request
                </p>
                <h2
                  id="erp-leave-detail-title"
                  className="mt-1 truncate text-lg font-bold tracking-tight text-white"
                >
                  {memberName || 'Member'}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusPill status={request.status} />
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold text-cyan-50 ring-1 ring-white/20">
                    {typeLabel}
                  </span>
                  <span className="text-[11px] font-medium text-cyan-100/85">
                    {request.day_count || 0} day{(request.day_count || 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canChangeStatus ? (
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      disabled={busy}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label="Change response"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-black/20 text-white/95 shadow-md backdrop-blur-sm transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 disabled:opacity-50 sm:h-10 sm:w-10"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <circle cx="12" cy="5" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="12" cy="19" r="1.6" />
                      </svg>
                    </button>
                    {menuOpen ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-[2] mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/20 ring-1 ring-slate-900/5 dark:border-teal-900/55 dark:bg-[#0f1820] dark:shadow-black/45"
                      >
                        <p className="border-b border-slate-200/70 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-teal-900/45 dark:bg-[#0a1218] dark:text-slate-400">
                          Change response
                        </p>
                        <ul className="py-1">
                          {statusActions.map((a) => {
                            const dot =
                              a.tone === 'emerald'
                                ? 'bg-emerald-500'
                                : a.tone === 'rose'
                                ? 'bg-rose-500'
                                : a.tone === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-slate-400';
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => handleAction(a.id)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-[#162430]"
                                >
                                  <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
                                  {a.label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <ErpModalCloseButton onClose={() => !busy && onClose?.()} />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailRow label="Start date" value={fmtDate(request.start_date)} />
              <DetailRow label="End date" value={fmtDate(request.end_date)} />
              <DetailRow label="Days" value={`${request.day_count || 0}`} />
              <DetailRow label="Type" value={typeLabel} />
              <DetailRow label="Submitted" value={fmtDateTime(request.created_at)} />
              <DetailRow
                label="Reviewed"
                value={
                  request.reviewed_at
                    ? `${fmtDateTime(request.reviewed_at)}${reviewerName ? ` · by ${reviewerName}` : ''}`
                    : '—'
                }
              />
            </dl>

            <section className="mt-5 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Reason
              </p>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 dark:border-teal-900/45 dark:bg-[#0a1218] dark:text-slate-200">
                {request.reason ? (
                  <p className="whitespace-pre-wrap">{request.reason}</p>
                ) : (
                  <p className="italic text-slate-400 dark:text-slate-500">No reason provided.</p>
                )}
              </div>
            </section>

            {request.reviewer_note ? (
              <section className="mt-5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Reviewer note
                </p>
                <div className="rounded-xl border border-cyan-200/70 bg-cyan-50/40 px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 dark:border-teal-800/55 dark:bg-teal-950/30 dark:text-slate-100">
                  <p className="whitespace-pre-wrap">{request.reviewer_note}</p>
                </div>
              </section>
            ) : null}

            {request.attachment_path ? (
              <section className="mt-5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Attachment
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAttachment?.(request.attachment_path)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#103D4D] shadow-sm transition hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-teal-200 dark:hover:bg-[#162430]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l8.57-8.57A4 4 0 0118 8.84l-8.59 8.57a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  Download attachment
                </button>
              </section>
            ) : null}
          </div>

          <div className={erpModalFooterClass}>
            <button
              type="button"
              onClick={() => !busy && onClose?.()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}
