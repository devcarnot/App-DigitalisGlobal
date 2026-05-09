'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildErpMeetingGoogleCalendarUrl,
  buildErpMeetingJoinUrl,
  buildErpMeetingOutlookCalendarUrl,
  cancelErpMeeting,
  downloadErpMeetingIcs,
  rsvpErpMeeting,
} from '../../lib/erp-meetings-client';
import {
  describeTimeZone,
  getLocalTimeZone,
  isValidIanaTimeZone,
  ymdHmInZone,
} from '../../lib/erp-timezones';
import {
  erpModalPanelClass,
  erpModalFooterClass,
  erpModalBackdropClass,
  ErpModalCloseButton,
} from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';
import ChatMessageHtml from './ChatMessageHtml';

const RSVP_LABELS = {
  pending: 'No response',
  accepted: 'Going',
  declined: 'Declined',
  tentative: 'Maybe',
};

const RSVP_PILL_CLASS = {
  pending:
    'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-slate-700/70',
  accepted:
    'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-800/55',
  declined:
    'bg-rose-100 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55',
  tentative:
    'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-800/55',
};

function formatLongWhen(iso, durationMinutes) {
  if (!iso) return '';
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return '';
  const minutes = Math.max(5, Math.min(600, Number(durationMinutes) || 30));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const sameDay = start.toDateString() === end.toDateString();
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  const timeOpts = { hour: '2-digit', minute: '2-digit' };
  const dateLabel = start.toLocaleDateString(undefined, dateOpts);
  const startT = start.toLocaleTimeString(undefined, timeOpts);
  const endT = end.toLocaleTimeString(undefined, timeOpts);
  if (sameDay) return `${dateLabel} · ${startT} – ${endT}`;
  return `${dateLabel} ${startT} → ${end.toLocaleDateString(undefined, dateOpts)} ${endT}`;
}

function durationLabel(durationMinutes) {
  const m = Math.max(5, Math.min(600, Number(durationMinutes) || 30));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

/**
 * Read-only details view for a meeting.
 *
 * Click on a meeting (in the calendar grid, day list, etc.) opens this modal —
 * editing the meeting requires an explicit "Edit" button click here. That way
 * a casual click can never accidentally drop the user into an edit form.
 */
export default function ErpMeetingDetailsModal({
  open,
  meeting,
  attendees = [],
  loading = false,
  loadError = '',
  currentUserId,
  isAdmin = false,
  projectsById,
  nameById,
  onClose,
  onEdit,
  onCancelled,
  onRsvped,
}) {
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [calMenuOpen, setCalMenuOpen] = useState(false);
  const [localAttendees, setLocalAttendees] = useState(attendees);
  const [localStatus, setLocalStatus] = useState(meeting?.status || 'scheduled');
  const calRef = useRef(null);

  // Keep local mirrors in sync when the parent reloads.
  useEffect(() => {
    setLocalAttendees(attendees);
  }, [attendees]);
  useEffect(() => {
    setLocalStatus(meeting?.status || 'scheduled');
  }, [meeting?.id, meeting?.status]);
  useEffect(() => {
    if (!open) {
      setBusyAction(null);
      setActionError('');
      setCalMenuOpen(false);
    }
  }, [open]);

  // Close the "Add to calendar" popover on outside click / Esc.
  useEffect(() => {
    if (!calMenuOpen) return undefined;
    const onDocPointer = (e) => {
      if (!calRef.current) return;
      if (!calRef.current.contains(e.target)) setCalMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setCalMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [calMenuOpen]);

  const projectName = meeting?.project_id ? projectsById?.[meeting.project_id]?.name : null;
  const joinUrl = useMemo(
    () => (meeting?.location_url ? meeting.location_url : buildErpMeetingJoinUrl(meeting?.jitsi_room)),
    [meeting?.location_url, meeting?.jitsi_room],
  );
  const isCancelled = localStatus === 'cancelled';
  const isOrganizer = meeting?.created_by === currentUserId;
  const canManage = Boolean(isOrganizer || isAdmin);
  const myAttendee = localAttendees.find((a) => a.user_id === currentUserId) || null;
  const myRsvp = myAttendee?.rsvp_status || 'pending';

  // Show the organizer's original timezone (and the wall-clock the meeting was
  // scheduled in) whenever it differs from the viewer's own zone — saves
  // attendees from doing the math.
  const tzInfo = useMemo(() => {
    if (!meeting?.scheduled_at) return null;
    const meetingZone = isValidIanaTimeZone(meeting?.time_zone) ? meeting.time_zone : null;
    if (!meetingZone) return null;
    const localZone = getLocalTimeZone();
    if (meetingZone === localZone) return null;
    const utc = new Date(meeting.scheduled_at);
    if (Number.isNaN(utc.getTime())) return null;
    const wall = ymdHmInZone(utc, meetingZone);
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall || '');
    let wallLabel = '';
    if (m) {
      const localDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
      if (!Number.isNaN(localDate.getTime())) {
        wallLabel = localDate.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
    return {
      meetingZone,
      meetingZoneLabel: describeTimeZone(meetingZone, utc),
      wallLabel,
    };
  }, [meeting?.scheduled_at, meeting?.time_zone]);

  const counts = useMemo(() => {
    let going = 0;
    let maybe = 0;
    let declined = 0;
    let pending = 0;
    for (const a of localAttendees) {
      if (a.user_id === meeting?.created_by) continue;
      if (a.rsvp_status === 'accepted') going += 1;
      else if (a.rsvp_status === 'tentative') maybe += 1;
      else if (a.rsvp_status === 'declined') declined += 1;
      else pending += 1;
    }
    return { going, maybe, declined, pending };
  }, [localAttendees, meeting?.created_by]);

  const handleJoin = useCallback(() => {
    if (joinUrl && typeof window !== 'undefined') {
      window.open(joinUrl, '_blank', 'noopener,noreferrer');
    }
  }, [joinUrl]);

  const handleEdit = useCallback(() => {
    if (!meeting) return;
    onEdit?.(meeting);
  }, [meeting, onEdit]);

  const handleCancel = useCallback(async () => {
    if (!meeting || busyAction) return;
    const ok = window.confirm(`Cancel “${meeting.title}”? Attendees will be notified.`);
    if (!ok) return;
    setBusyAction('cancel');
    setActionError('');
    try {
      await cancelErpMeeting(meeting.id);
      setLocalStatus('cancelled');
      onCancelled?.(meeting);
    } catch (e) {
      setActionError(e?.message || 'Could not cancel meeting.');
    } finally {
      setBusyAction(null);
    }
  }, [meeting, busyAction, onCancelled]);

  const handleRsvp = useCallback(
    async (status) => {
      if (!meeting || busyAction) return;
      if (myRsvp === status) return;
      const prevStatus = myRsvp;
      setBusyAction(`rsvp:${status}`);
      setActionError('');
      // Optimistically flip my own row.
      setLocalAttendees((list) =>
        list.map((a) =>
          a.user_id === currentUserId
            ? { ...a, rsvp_status: status, responded_at: new Date().toISOString() }
            : a,
        ),
      );
      try {
        await rsvpErpMeeting(meeting.id, status);
        onRsvped?.(meeting, status);
      } catch (e) {
        // Roll back to the previous status.
        setLocalAttendees((list) =>
          list.map((a) => (a.user_id === currentUserId ? { ...a, rsvp_status: prevStatus } : a)),
        );
        setActionError(e?.message || 'Could not update RSVP.');
      } finally {
        setBusyAction(null);
      }
    },
    [meeting, busyAction, myRsvp, currentUserId, onRsvped],
  );

  const openExternal = useCallback((url) => {
    if (!url || typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
    setCalMenuOpen(false);
  }, []);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meeting details"
        className="fixed inset-0 z-[1300] flex items-center justify-center p-3 sm:p-6"
      >
        <div className={erpModalBackdropClass} onClick={onClose} aria-hidden="true" />
        <div className={erpModalPanelClass}>
          <ErpModalCloseButton onClose={onClose} label="Close meeting details" />

          {/* Header */}
          <div
            className={`relative shrink-0 border-b px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6 ${
              isCancelled
                ? 'border-rose-300/60 bg-gradient-to-br from-rose-50/85 via-white to-rose-50/45 dark:border-rose-900/45 dark:from-rose-950/40 dark:via-[#0e1824] dark:to-[#0e1824]'
                : 'border-cyan-200/65 bg-gradient-to-br from-cyan-50/85 via-white to-teal-50/55 dark:border-teal-900/45 dark:from-[#0e2c3a]/55 dark:via-[#0e1824] dark:to-[#0e1824]'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              {isCancelled ? 'Cancelled meeting' : 'Meeting'}
            </p>
            <h2 className="mt-1 break-words pr-12 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
              {meeting?.title || 'Untitled meeting'}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/85 px-2 py-1 ring-1 ring-slate-200/85 dark:bg-[#101a22] dark:ring-teal-900/55">
                <svg className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3.5" y="5" width="17" height="15" rx="2" />
                  <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
                </svg>
                {formatLongWhen(meeting?.scheduled_at, meeting?.duration_minutes) || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/85 px-2 py-1 ring-1 ring-slate-200/85 dark:bg-[#101a22] dark:ring-teal-900/55">
                <svg className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {durationLabel(meeting?.duration_minutes)}
              </span>
              {projectName ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/85 px-2 py-1 ring-1 ring-slate-200/85 dark:bg-[#101a22] dark:ring-teal-900/55">
                  <svg className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" strokeLinejoin="round" />
                  </svg>
                  {projectName}
                </span>
              ) : null}
              {tzInfo ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-50/85 px-2 py-1 ring-1 ring-cyan-200/85 dark:bg-teal-950/40 dark:ring-teal-900/55"
                  title={`Scheduled in ${tzInfo.meetingZoneLabel}${tzInfo.wallLabel ? ` (${tzInfo.wallLabel} local-to-organizer)` : ''}`}
                >
                  <svg className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" strokeLinecap="round" />
                  </svg>
                  <span>
                    Scheduled in <span className="font-bold">{tzInfo.meetingZone}</span>
                    {tzInfo.wallLabel ? (
                      <>
                        {' · '}
                        <span className="font-bold">{tzInfo.wallLabel}</span>
                      </>
                    ) : null}
                  </span>
                </span>
              ) : null}
              {isCancelled ? (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55">
                  Cancelled
                </span>
              ) : null}
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {loading ? (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading meeting…</p>
            ) : loadError ? (
              <p className="rounded-lg border border-rose-300/70 bg-rose-50/80 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/55 dark:bg-rose-950/30 dark:text-rose-200">
                {loadError}
              </p>
            ) : (
              <div className="space-y-5">
                {/* Description */}
                <section>
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Description
                  </h3>
                  {meeting?.description ? (
                    <ChatMessageHtml
                      text={meeting.description}
                      className="rounded-xl bg-slate-50/70 p-3 text-[13px] leading-relaxed text-slate-800 ring-1 ring-slate-200/85 dark:bg-[#0a141a] dark:text-slate-200 dark:ring-teal-900/40"
                    />
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200/85 bg-white/60 px-3 py-2 text-[12px] italic text-slate-500 dark:border-teal-900/45 dark:bg-[#0a141a] dark:text-slate-400">
                      No description was provided for this meeting.
                    </p>
                  )}
                </section>

                {/* Where */}
                <section>
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Where
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {joinUrl ? (
                      <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-cyan-200/65 bg-cyan-50/55 px-3 py-1.5 text-[12px] font-semibold text-teal-900 dark:border-teal-900/55 dark:bg-teal-950/35 dark:text-teal-100">
                        <svg className="h-4 w-4 text-teal-600 dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="break-all">{joinUrl}</span>
                      </span>
                    ) : null}
                    {meeting?.location_text ? (
                      <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200/85 bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-slate-700 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200">
                        <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M12 21s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z" strokeLinejoin="round" />
                          <circle cx="12" cy="9" r="2.5" />
                        </svg>
                        {meeting.location_text}
                      </span>
                    ) : null}
                    {!joinUrl && !meeting?.location_text ? (
                      <span className="text-[12px] italic text-slate-500 dark:text-slate-400">
                        No location set.
                      </span>
                    ) : null}
                  </div>
                </section>

                {/* Attendees */}
                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Attendees ({localAttendees.length})
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {counts.going} going · {counts.maybe} maybe · {counts.declined} declined · {counts.pending} no reply
                    </p>
                  </div>
                  {localAttendees.length === 0 ? (
                    <p className="text-[12px] italic text-slate-500 dark:text-slate-400">
                      No attendees yet.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {localAttendees.map((a) => {
                        const name = nameById?.[a.user_id] || 'Member';
                        const pillClass = RSVP_PILL_CLASS[a.rsvp_status] || RSVP_PILL_CLASS.pending;
                        return (
                          <li
                            key={a.user_id}
                            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${pillClass}`}
                            title={`${name} — ${RSVP_LABELS[a.rsvp_status] || 'No response'}`}
                          >
                            <span className="font-semibold">{name}</span>
                            {a.role === 'optional' ? (
                              <span className="text-[9px] uppercase tracking-wide opacity-70">opt</span>
                            ) : null}
                            {a.role === 'organizer' ? (
                              <span className="text-[9px] uppercase tracking-wide opacity-70">org</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* Your RSVP (only if I'm an attendee and not cancelled) */}
                {!isCancelled && myAttendee ? (
                  <section>
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Your response
                    </h3>
                    <div
                      className={`inline-flex rounded-lg border border-slate-200/85 bg-slate-50/70 p-0.5 text-[11px] font-bold uppercase tracking-wide transition dark:border-slate-700/65 dark:bg-slate-900/40 ${
                        busyAction?.startsWith('rsvp:') ? 'opacity-90' : ''
                      }`}
                      aria-busy={busyAction?.startsWith('rsvp:') ? 'true' : 'false'}
                    >
                      {[
                        { id: 'accepted', label: 'Accept' },
                        { id: 'tentative', label: 'Maybe' },
                        { id: 'declined', label: 'Decline' },
                      ].map((opt) => {
                        const active = myRsvp === opt.id;
                        const activeClass =
                          opt.id === 'accepted'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : opt.id === 'declined'
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'bg-amber-500 text-white shadow-sm';
                        const isPending = busyAction === `rsvp:${opt.id}`;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={Boolean(busyAction)}
                            aria-pressed={active}
                            onClick={() => handleRsvp(opt.id)}
                            className={[
                              'rounded-md px-3 py-1.5 transition active:scale-[0.97] disabled:cursor-progress',
                              active
                                ? activeClass
                                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60',
                              isPending ? 'animate-pulse' : '',
                              busyAction && !active ? 'opacity-50' : '',
                            ].join(' ')}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {actionError ? (
                  <p className="rounded-lg border border-rose-300/70 bg-rose-50/80 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/55 dark:bg-rose-950/30 dark:text-rose-200">
                    {actionError}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={erpModalFooterClass}>
            {/* Add to calendar */}
            {meeting && !isCancelled ? (
              <div ref={calRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCalMenuOpen((v) => !v)}
                  disabled={Boolean(busyAction)}
                  aria-haspopup="menu"
                  aria-expanded={calMenuOpen}
                  className="rounded-lg border border-slate-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
                >
                  Add to calendar
                </button>
                {calMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-30 mb-1.5 w-52 overflow-hidden rounded-xl border border-slate-200/90 bg-white text-[12px] shadow-lg ring-1 ring-slate-900/5 dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-black/45 dark:ring-teal-950/30"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openExternal(buildErpMeetingGoogleCalendarUrl(meeting, joinUrl))}
                      className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-teal-950/40"
                    >
                      Google Calendar
                      <span aria-hidden className="text-slate-400">↗</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openExternal(buildErpMeetingOutlookCalendarUrl(meeting, joinUrl))}
                      className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-teal-950/40"
                    >
                      Outlook
                      <span aria-hidden className="text-slate-400">↗</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        downloadErpMeetingIcs(meeting, joinUrl);
                        setCalMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-teal-950/40"
                    >
                      Apple Calendar / .ics
                      <span aria-hidden className="text-slate-400">⬇</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <span className="grow" />

            {/* Organizer / admin actions */}
            {canManage && !isCancelled ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={Boolean(busyAction)}
                className="rounded-lg border border-rose-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800/55 dark:bg-[#101a22] dark:text-rose-300 dark:hover:bg-rose-950/35 dark:[background-image:none]"
              >
                {busyAction === 'cancel' ? 'Cancelling…' : 'Cancel meeting'}
              </button>
            ) : null}
            {canManage && !isCancelled ? (
              <button
                type="button"
                onClick={handleEdit}
                disabled={Boolean(busyAction)}
                className="rounded-lg border border-slate-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
              >
                Edit meeting
              </button>
            ) : null}

            {/* Join (everyone) */}
            {!isCancelled && joinUrl ? (
              <button
                type="button"
                onClick={handleJoin}
                disabled={Boolean(busyAction)}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                Join
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
