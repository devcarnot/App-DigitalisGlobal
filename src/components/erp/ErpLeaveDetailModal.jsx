'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import { erpModalBackdropClass } from './ErpModalFormPrimitives';
import { LEAVE_TYPE_LABELS } from '../../lib/erp-leave';
import { isErpGlobalAdmin, isErpManagerRole } from '../../lib/erp-roles';

/** Tight, content-sized panel for a detail dialog (vs the default 56vw/900px
 *  shell which is sized for editor forms with lots of inputs). */
const PANEL_CLASS =
  'relative z-[1] flex max-h-[min(94dvh,720px)] w-full max-w-[min(calc(100vw-2rem),640px)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_28px_70px_-28px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/[0.04] dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-[0_28px_70px_-28px_rgba(0,0,0,0.7)] dark:ring-white/[0.03]';

/** Status pill — solid color over the dark gradient header, soft pastel everywhere else. */
function StatusPill({ status, onLight = false }) {
  const k = String(status || '').toLowerCase();
  const onLightMap = {
    approved:
      'bg-emerald-100 text-emerald-800 ring-emerald-300/70 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-800/55',
    pending:
      'bg-amber-100 text-amber-900 ring-amber-300/70 dark:bg-amber-950/55 dark:text-amber-100 dark:ring-amber-800/55',
    rejected:
      'bg-rose-100 text-rose-800 ring-rose-300/70 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55',
    cancelled:
      'bg-slate-100 text-slate-700 ring-slate-300/70 dark:bg-slate-800/65 dark:text-slate-200 dark:ring-slate-700/60',
  };
  const onDarkMap = {
    approved: 'bg-emerald-500/95 text-white ring-emerald-300/40',
    pending: 'bg-amber-500/95 text-amber-950 ring-amber-200/45',
    rejected: 'bg-rose-500/95 text-white ring-rose-300/40',
    cancelled: 'bg-slate-500/90 text-white ring-slate-300/40',
  };
  const map = onLight ? onLightMap : onDarkMap;
  const cls = map[k] || map.pending;
  const dot =
    k === 'approved'
      ? 'bg-emerald-200'
      : k === 'rejected'
        ? 'bg-rose-200'
        : k === 'cancelled'
          ? 'bg-slate-200'
          : 'bg-amber-200';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${cls}`}
    >
      {!onLight ? <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden /> : null}
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
  const dayCount = request.day_count || 0;
  const initials = (memberName || 'M')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'M';

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => !busy && onClose?.()}
          className={erpModalBackdropClass}
        />
        <div
          className={PANEL_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="erp-leave-detail-title"
        >
          {/* Header — gradient banner with avatar, name, status pill, and actions.
           *  IMPORTANT: keep the header `overflow-visible` so the kebab dropdown
           *  can escape into the body area. The decorative gradient blobs live
           *  in their own `overflow-hidden` wrapper below. */}
          <header className="relative shrink-0 bg-gradient-to-br from-[#0d3343] via-[#103D4D] to-teal-700 px-5 py-4 text-white sm:px-6 sm:py-5 dark:from-[#0a1f29] dark:via-[#0e2c3a] dark:to-teal-900">
            <span
              className="pointer-events-none absolute inset-0 overflow-hidden"
              aria-hidden
            >
              <span className="absolute -right-10 -top-10 block h-44 w-44 rounded-full bg-cyan-300/15 blur-3xl" />
              <span className="absolute -bottom-16 -left-12 block h-44 w-44 rounded-full bg-teal-400/15 blur-3xl" />
            </span>
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-sm font-bold text-white shadow-inner ring-1 ring-white/25 backdrop-blur-sm sm:h-12 sm:w-12 sm:text-base">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/90">
                    Leave request
                  </p>
                  <h2
                    id="erp-leave-detail-title"
                    className="mt-0.5 truncate text-lg font-bold tracking-tight text-white sm:text-[1.0625rem]"
                  >
                    {memberName || 'Member'}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusPill status={request.status} />
                    <span className="rounded-full bg-white/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-50 ring-1 ring-white/20">
                      {typeLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {canChangeStatus ? (
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      disabled={busy}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label="Change response"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white/95 shadow-sm backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 disabled:opacity-50"
                    >
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <circle cx="12" cy="5" r="1.7" />
                        <circle cx="12" cy="12" r="1.7" />
                        <circle cx="12" cy="19" r="1.7" />
                      </svg>
                    </button>
                    {menuOpen ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-700 shadow-2xl shadow-slate-900/25 ring-1 ring-slate-900/[0.04] dark:border-teal-900/55 dark:bg-[#0f1820] dark:text-slate-100 dark:shadow-black/55"
                      >
                        <p className="border-b border-slate-200/80 bg-slate-50/90 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-teal-900/45 dark:bg-[#0a1218] dark:text-slate-400">
                          Change response
                        </p>
                        <ul className="py-1">
                          {statusActions.map((a) => {
                            const toneStyles = {
                              emerald:
                                'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40',
                              rose:
                                'text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/40',
                              amber:
                                'text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40',
                              slate:
                                'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#162430]',
                            };
                            const dotStyles = {
                              emerald: 'bg-emerald-500',
                              rose: 'bg-rose-500',
                              amber: 'bg-amber-500',
                              slate: 'bg-slate-400',
                            };
                            const cls = toneStyles[a.tone] || toneStyles.slate;
                            const dot = dotStyles[a.tone] || dotStyles.slate;
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => handleAction(a.id)}
                                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] font-semibold transition disabled:opacity-50 ${cls}`}
                                >
                                  <span
                                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white shadow-sm dark:ring-[#0f1820] ${dot}`}
                                    aria-hidden
                                  />
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
                <button
                  type="button"
                  onClick={() => !busy && onClose?.()}
                  aria-label="Close dialog"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white/95 shadow-sm backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
                >
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 [scrollbar-width:thin]">
            {/* Hero strip: From / Days / To with arrow icon between dates. */}
            <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 p-3.5 shadow-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 dark:border-teal-900/45 dark:from-[#101a22] dark:via-[#0c151c] dark:to-[#0a141b]">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  From
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                  {fmtDate(request.start_date)}
                </p>
              </div>
              <div className="hidden flex-col items-center justify-center gap-1 sm:flex">
                <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-[#103D4D] ring-1 ring-cyan-200 dark:bg-teal-950/55 dark:text-teal-200 dark:ring-teal-800/55">
                  {dayCount} day{dayCount === 1 ? '' : 's'}
                </span>
                <svg viewBox="0 0 32 8" className="h-2 w-7 text-slate-300 dark:text-teal-800" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path strokeLinecap="round" d="M1 4h28m0 0l-3.5-3M29 4l-3.5 3" />
                </svg>
              </div>
              <div className="min-w-0 sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  To
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                  {fmtDate(request.end_date)}
                </p>
              </div>
              {/* Mobile-only days chip below the dates. */}
              <div className="sm:hidden">
                <span className="inline-flex rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-[#103D4D] ring-1 ring-cyan-200 dark:bg-teal-950/55 dark:text-teal-200 dark:ring-teal-800/55">
                  {dayCount} day{dayCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Reason — main content block. */}
            <section className="mt-4 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Reason
              </p>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-700 dark:border-teal-900/45 dark:bg-[#0a1218] dark:text-slate-200">
                {request.reason ? (
                  <p className="whitespace-pre-wrap">{request.reason}</p>
                ) : (
                  <p className="italic text-slate-400 dark:text-slate-500">No reason provided.</p>
                )}
              </div>
            </section>

            {request.reviewer_note ? (
              <section className="mt-4 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Reviewer note
                </p>
                <div className="rounded-2xl border border-cyan-200/70 bg-cyan-50/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-700 dark:border-teal-800/55 dark:bg-teal-950/30 dark:text-slate-100">
                  <p className="whitespace-pre-wrap">{request.reviewer_note}</p>
                </div>
              </section>
            ) : null}

            {/* Metadata — submitted / reviewed in two columns. */}
            <section className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-slate-200/70 bg-white/50 px-3.5 py-3 dark:border-teal-900/40 dark:bg-[#0a1218]/55">
              <DetailRow label="Submitted" value={fmtDateTime(request.created_at)} />
              <DetailRow
                label="Reviewed"
                value={
                  request.reviewed_at
                    ? `${fmtDateTime(request.reviewed_at)}${reviewerName ? ` · by ${reviewerName}` : ''}`
                    : '—'
                }
              />
            </section>

            {request.attachment_path ? (
              <section className="mt-4 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Attachment
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAttachment?.(request.attachment_path)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#103D4D] shadow-sm transition hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-teal-200 dark:hover:bg-[#162430]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l8.57-8.57A4 4 0 0118 8.84l-8.59 8.57a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  Download attachment
                </button>
              </section>
            ) : null}
          </div>

          {/* Footer — single Close action; status changes happen in the kebab menu. */}
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/80 px-5 py-3 sm:px-6 dark:border-teal-900/50 dark:bg-[#0a1218]">
            <button
              type="button"
              onClick={() => !busy && onClose?.()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
            >
              Close
            </button>
          </footer>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}
