'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildErpMeetingGoogleCalendarUrl,
  buildErpMeetingJoinUrl,
  buildErpMeetingOutlookCalendarUrl,
  cancelErpMeeting,
  downloadErpMeetingIcs,
  listErpMeetings,
  rsvpErpMeeting,
} from '../../lib/erp-meetings-client';

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

function formatWhen(iso, durationMinutes) {
  if (!iso) return '';
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + (Number(durationMinutes) || 30) * 60 * 1000);
  const sameDay = start.toDateString() === end.toDateString();
  const fmtDate = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const fmtT = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `${fmtDate} · ${fmtT(start)} – ${fmtT(end)}`;
  return `${fmtDate} ${fmtT(start)} → ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${fmtT(end)}`;
}

/**
 * Lightweight "Add to calendar" dropdown — Google Calendar (URL), Outlook (URL),
 * Apple/iCal (.ics download). No portal so it lives next to the card actions.
 */
function AddToCalendarMenu({ meeting, joinUrl, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocPointer = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openUrl = useCallback((url) => {
    if (!url || typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add to calendar"
        className="rounded-lg border border-slate-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
      >
        Add to calendar
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200/90 bg-white text-[12px] shadow-lg ring-1 ring-slate-900/5 dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-black/45 dark:ring-teal-950/30"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => openUrl(buildErpMeetingGoogleCalendarUrl(meeting, joinUrl))}
            className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-teal-950/40"
          >
            Google Calendar
            <span aria-hidden className="text-slate-400">↗</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openUrl(buildErpMeetingOutlookCalendarUrl(meeting, joinUrl))}
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
              setOpen(false);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-teal-950/40"
          >
            Apple Calendar / .ics
            <span aria-hidden className="text-slate-400">⬇</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MeetingCard({
  meeting,
  attendees,
  currentUserId,
  projectsById,
  nameById,
  onCancel,
  onEdit,
  onRsvp,
  onJoin,
  busy,
}) {
  const isOrganizer = meeting.created_by === currentUserId;
  const myAttendee = attendees.find((a) => a.user_id === currentUserId) || null;
  const myRsvp = myAttendee?.rsvp_status || 'pending';
  const projectName = meeting.project_id ? projectsById?.[meeting.project_id]?.name : null;
  const joinUrl = meeting.location_url || buildErpMeetingJoinUrl(meeting.jitsi_room);
  const isCancelled = meeting.status === 'cancelled';
  const counts = useMemo(() => {
    let going = 0;
    let maybe = 0;
    let declined = 0;
    let pending = 0;
    for (const a of attendees) {
      if (a.user_id === meeting.created_by) continue;
      if (a.rsvp_status === 'accepted') going += 1;
      else if (a.rsvp_status === 'tentative') maybe += 1;
      else if (a.rsvp_status === 'declined') declined += 1;
      else pending += 1;
    }
    return { going, maybe, declined, pending, total: attendees.length };
  }, [attendees, meeting.created_by]);

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white/95 shadow-md transition dark:bg-[#0e1824] dark:[background-image:none] ${
        isCancelled
          ? 'border-rose-300/55 ring-1 ring-rose-200/50 dark:border-rose-900/45 dark:ring-rose-950/40'
          : 'border-cyan-200/55 ring-1 ring-cyan-100/40 dark:border-teal-900/45 dark:ring-teal-950/35'
      }`}
    >
      <header
        className={`flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 ${
          isCancelled
            ? 'border-rose-200/55 bg-gradient-to-r from-rose-50/70 to-white dark:border-rose-900/45 dark:from-rose-950/25 dark:to-[#0e1824]'
            : 'border-cyan-100/65 bg-gradient-to-r from-teal-50/70 via-white to-cyan-50/55 dark:border-teal-900/45 dark:from-[#0e2c3a]/55 dark:via-[#0e1824] dark:to-[#0e1824]'
        }`}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-800/85 dark:text-teal-200/85">
            {formatWhen(meeting.scheduled_at, meeting.duration_minutes)}
          </p>
          <h3 className="mt-0.5 truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            {meeting.title}
          </h3>
          {projectName ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-400 dark:text-slate-500">Project</span>{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{projectName}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isCancelled ? (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55">
              Cancelled
            </span>
          ) : (
            <>
              {joinUrl ? (
                <button
                  type="button"
                  onClick={() => onJoin?.(meeting, joinUrl)}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-700 dark:hover:bg-teal-600"
                  disabled={busy}
                >
                  Join
                </button>
              ) : null}
              <AddToCalendarMenu meeting={meeting} joinUrl={joinUrl} disabled={busy} />
              {isOrganizer ? (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit?.(meeting)}
                    className="rounded-lg border border-slate-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
                    disabled={busy}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancel?.(meeting)}
                    className="rounded-lg border border-rose-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-700 transition hover:bg-rose-50 dark:border-rose-800/55 dark:bg-[#101a22] dark:text-rose-300 dark:hover:bg-rose-950/35 dark:[background-image:none]"
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      </header>

      {meeting.description ? (
        <p className="whitespace-pre-line border-b border-slate-100 px-4 py-3 text-[13px] leading-snug text-slate-700 dark:border-slate-800/60 dark:text-slate-300">
          {meeting.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wide ${RSVP_PILL_CLASS[myRsvp]}`}
          >
            You: {RSVP_LABELS[myRsvp]}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {counts.going} going · {counts.maybe} maybe · {counts.declined} declined · {counts.pending} no reply
          </span>
        </div>
        {!isCancelled && myAttendee ? (
          <div className="flex shrink-0 rounded-lg border border-slate-200/85 bg-slate-50/70 p-0.5 text-[10px] font-bold uppercase tracking-wide dark:border-slate-700/65 dark:bg-slate-900/40">
            {[
              { id: 'accepted', label: 'Accept' },
              { id: 'tentative', label: 'Maybe' },
              { id: 'declined', label: 'Decline' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => onRsvp?.(meeting, opt.id)}
                className={`rounded-md px-2.5 py-1 transition ${
                  myRsvp === opt.id
                    ? opt.id === 'accepted'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : opt.id === 'declined'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 dark:border-slate-800/60 dark:bg-[#0a141a]">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Attendees
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {attendees.map((a) => {
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
      </div>
    </article>
  );
}

/**
 * List of meetings with filter chips and inline RSVP / cancel.
 *
 * Props:
 *   currentUserId
 *   projectsById?: Record<id, { name }> — used to label project links
 *   nameById?: Record<id, fullName> — used for attendee chips
 *   projectId?: optional fixed project filter (used inside a project workspace)
 *   onEdit?(meeting) — triggers edit; parent renders the modal
 *   reloadKey? — bump to force a refetch from the parent
 *   onScheduledLinkVisited?() — callback when 'id' query param is auto-selected
 */
export default function ErpMeetingsList({
  currentUserId,
  projectsById = {},
  nameById = {},
  projectId = null,
  onEdit,
  reloadKey = 0,
}) {
  const [range, setRange] = useState('upcoming');
  const [meetings, setMeetings] = useState([]);
  const [attendeesByMeeting, setAttendeesByMeeting] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notProvisioned, setNotProvisioned] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listErpMeetings({ range, projectId });
      setMeetings(data.meetings || []);
      setAttendeesByMeeting(data.attendeesByMeeting || {});
      setNotProvisioned(Boolean(data.notProvisioned));
    } catch (e) {
      setError(e?.message || 'Could not load meetings.');
    } finally {
      setLoading(false);
    }
  }, [range, projectId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  const handleRsvp = useCallback(
    async (meeting, status) => {
      if (busyId) return;
      setBusyId(meeting.id);
      try {
        await rsvpErpMeeting(meeting.id, status);
        setAttendeesByMeeting((prev) => {
          const list = prev[meeting.id] || [];
          const next = list.map((a) =>
            a.user_id === currentUserId ? { ...a, rsvp_status: status, responded_at: new Date().toISOString() } : a,
          );
          return { ...prev, [meeting.id]: next };
        });
      } catch (e) {
        setError(e?.message || 'Could not update RSVP.');
      } finally {
        setBusyId(null);
      }
    },
    [busyId, currentUserId],
  );

  const handleCancel = useCallback(
    async (meeting) => {
      if (busyId) return;
      const confirmCancel = window.confirm(`Cancel “${meeting.title}”? Attendees will be notified.`);
      if (!confirmCancel) return;
      setBusyId(meeting.id);
      try {
        await cancelErpMeeting(meeting.id);
        setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? { ...m, status: 'cancelled' } : m)));
      } catch (e) {
        setError(e?.message || 'Could not cancel meeting.');
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const handleJoin = useCallback((_meeting, url) => {
    if (typeof window !== 'undefined' && url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex shrink-0 rounded-xl border border-cyan-200/70 bg-slate-900 p-0.5 shadow-sm dark:border-teal-900/55 dark:bg-[#121a22] dark:[background-image:none]"
          role="tablist"
          aria-label="Meeting filter"
        >
          {[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'past', label: 'Past' },
            { id: 'all', label: 'All' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={range === opt.id}
              onClick={() => setRange(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                range === opt.id
                  ? 'bg-teal-400 text-slate-950 shadow-md dark:bg-teal-500'
                  : 'text-cyan-100/80 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="text-[11px] font-semibold text-teal-700 hover:underline dark:text-teal-300"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {notProvisioned ? (
        <p className="rounded-lg border border-amber-300/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/55 dark:bg-amber-950/30 dark:text-amber-200">
          The meetings database tables haven&apos;t been provisioned yet. Apply
          {' '}
          <code className="font-mono">supabase/migrations/20260515120000_erp_meetings.sql</code>
          {' '}to your Supabase project (dashboard SQL editor or
          {' '}
          <code className="font-mono">supabase db push</code>) and refresh.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-300/70 bg-rose-50/80 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/55 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading && meetings.length === 0 ? (
        <p className="rounded-xl border border-slate-200/70 bg-white/90 px-4 py-8 text-center text-xs font-medium text-slate-500 dark:border-teal-900/45 dark:bg-[#0e1824] dark:text-slate-400 dark:[background-image:none]">
          Loading meetings…
        </p>
      ) : null}

      {!loading && meetings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/40 px-6 py-12 text-center text-sm text-slate-500 dark:border-teal-900/55 dark:bg-[#0c151c] dark:text-slate-400 dark:[background-image:none]">
          No meetings here yet.
        </p>
      ) : null}

      <div className="space-y-3">
        {meetings.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={m}
            attendees={attendeesByMeeting[m.id] || []}
            currentUserId={currentUserId}
            projectsById={projectsById}
            nameById={nameById}
            onCancel={handleCancel}
            onEdit={onEdit}
            onRsvp={handleRsvp}
            onJoin={handleJoin}
            busy={busyId === m.id}
          />
        ))}
      </div>
    </div>
  );
}
