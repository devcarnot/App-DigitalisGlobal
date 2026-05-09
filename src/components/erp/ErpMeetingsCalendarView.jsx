'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildErpMeetingJoinUrl, listErpMeetings } from '../../lib/erp-meetings-client';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtTimeShort(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Returns 42 Date objects (6 rows × 7 cols) covering the calendar month
 * the cursor falls in, padded with the surrounding month days.
 */
function buildCalendarGrid(cursor) {
  const first = startOfMonth(cursor);
  const start = new Date(first);
  start.setDate(start.getDate() - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

/**
 * Month-grid calendar of meetings. Self-contained: fetches its own data when
 * mounted or when the parent bumps `reloadKey`.
 */
export default function ErpMeetingsCalendarView({
  currentUserId,
  isAdmin = false,
  projectsById,
  nameById,
  onEdit,
  reloadKey,
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [meetings, setMeetings] = useState([]);
  const [attendeesByMeeting, setAttendeesByMeeting] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedYmd, setSelectedYmd] = useState(() => ymd(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await listErpMeetings({ range: 'all' });
      setMeetings(Array.isArray(data?.meetings) ? data.meetings : []);
      setAttendeesByMeeting(data?.attendeesByMeeting || {});
    } catch (e) {
      setErrorMsg(e?.message || 'Failed to load meetings');
      setMeetings([]);
      setAttendeesByMeeting({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const cells = useMemo(() => buildCalendarGrid(cursor), [cursor]);

  // Group meetings by local YYYY-MM-DD for fast cell lookup.
  const meetingsByDay = useMemo(() => {
    const map = {};
    for (const m of meetings) {
      const d = new Date(m.scheduled_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = ymd(d);
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    }
    return map;
  }, [meetings]);

  const monthLabel = useMemo(
    () => cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [cursor],
  );

  const goPrev = useCallback(() => {
    setCursor((c) => {
      const next = new Date(c);
      next.setMonth(next.getMonth() - 1);
      return startOfMonth(next);
    });
  }, []);

  const goNext = useCallback(() => {
    setCursor((c) => {
      const next = new Date(c);
      next.setMonth(next.getMonth() + 1);
      return startOfMonth(next);
    });
  }, []);

  const goToday = useCallback(() => {
    const now = new Date();
    setCursor(startOfMonth(now));
    setSelectedYmd(ymd(now));
  }, []);

  const todayYmd = ymd(new Date());
  const cursorMonth = cursor.getMonth();
  const cursorYear = cursor.getFullYear();

  const selectedMeetings = useMemo(
    () => meetingsByDay[selectedYmd] || [],
    [meetingsByDay, selectedYmd],
  );

  const handleMeetingClick = useCallback(
    (meeting) => {
      const canManage = isAdmin || meeting.created_by === currentUserId;
      if (canManage && onEdit) {
        onEdit(meeting);
        return;
      }
      const joinUrl = meeting.location_url || buildErpMeetingJoinUrl(meeting.jitsi_room);
      if (joinUrl && typeof window !== 'undefined') {
        window.open(joinUrl, '_blank', 'noopener,noreferrer');
      }
    },
    [currentUserId, isAdmin, onEdit],
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-cyan-200/60 bg-white px-3 py-2 shadow-sm dark:border-teal-900/45 dark:bg-[#0a1016] dark:[background-image:none]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            className="rounded-lg border border-slate-300/85 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-300/85 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            className="rounded-lg border border-slate-300/85 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
          >
            ›
          </button>
        </div>
        <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          {monthLabel}
        </h2>
        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
          {loading ? 'Loading…' : `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:border-rose-800/55 dark:bg-rose-950/45 dark:text-rose-200">
          {errorMsg}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-cyan-200/60 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-teal-900/45 dark:bg-[#0a1016] dark:ring-teal-950/25 dark:[background-image:none]">
        <div className="grid grid-cols-7 border-b border-slate-200/85 bg-slate-50/85 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-teal-900/45 dark:bg-[#0e1824] dark:text-slate-300 dark:[background-image:none]">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const key = ymd(day);
            const inMonth = day.getMonth() === cursorMonth && day.getFullYear() === cursorYear;
            const isToday = key === todayYmd;
            const isSelected = key === selectedYmd;
            const dayMeetings = meetingsByDay[key] || [];
            const visible = dayMeetings.slice(0, 3);
            const more = dayMeetings.length - visible.length;
            return (
              <button
                key={`${key}-${idx}`}
                type="button"
                onClick={() => setSelectedYmd(key)}
                aria-label={day.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                className={[
                  'relative flex min-h-[92px] flex-col items-stretch gap-1 border border-slate-200/70 px-1.5 py-1 text-left text-[11px] transition',
                  'dark:border-teal-900/40',
                  inMonth
                    ? 'bg-white text-slate-800 dark:bg-[#0a1016] dark:text-slate-200'
                    : 'bg-slate-50/60 text-slate-400 dark:bg-[#070c11] dark:text-slate-600',
                  isSelected
                    ? 'ring-2 ring-inset ring-teal-500 dark:ring-teal-400'
                    : 'hover:bg-cyan-50/55 dark:hover:bg-[#0e1824]/80',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                      isToday
                        ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500'
                        : inMonth
                          ? 'text-slate-700 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-600',
                    ].join(' ')}
                  >
                    {day.getDate()}
                  </span>
                  {dayMeetings.length > 0 ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                      {dayMeetings.length}
                    </span>
                  ) : null}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {visible.map((m) => {
                    const start = new Date(m.scheduled_at);
                    const isCancelled = m.status === 'cancelled';
                    return (
                      <li
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMeetingClick(m);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMeetingClick(m);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={[
                          'truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight transition',
                          isCancelled
                            ? 'bg-rose-100/85 text-rose-700 line-through dark:bg-rose-950/45 dark:text-rose-200'
                            : 'bg-teal-100/85 text-teal-900 hover:bg-teal-200/90 dark:bg-teal-900/55 dark:text-teal-100 dark:hover:bg-teal-800/65',
                        ].join(' ')}
                      >
                        <span className="mr-1 font-bold">{fmtTimeShort(start)}</span>
                        <span className="truncate">{m.title || 'Meeting'}</span>
                      </li>
                    );
                  })}
                  {more > 0 ? (
                    <li className="truncate px-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      +{more} more
                    </li>
                  ) : null}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      <SelectedDayPanel
        ymdKey={selectedYmd}
        meetings={selectedMeetings}
        attendeesByMeeting={attendeesByMeeting}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        projectsById={projectsById}
        nameById={nameById}
        onEdit={onEdit}
      />
    </section>
  );
}

function SelectedDayPanel({
  ymdKey,
  meetings,
  attendeesByMeeting,
  currentUserId,
  isAdmin,
  projectsById,
  nameById,
  onEdit,
}) {
  const dayLabel = useMemo(() => {
    const [y, m, d] = ymdKey.split('-').map((n) => Number(n));
    if (!y || !m || !d) return ymdKey;
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return ymdKey;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [ymdKey]);

  if (meetings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200/85 bg-white px-4 py-3 text-[12px] font-medium text-slate-500 dark:border-teal-900/55 dark:bg-[#0a1016] dark:text-slate-400 dark:[background-image:none]">
        <span className="font-bold text-slate-700 dark:text-slate-200">{dayLabel}</span>
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        No meetings scheduled.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-200/60 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-teal-900/45 dark:bg-[#0a1016] dark:ring-teal-950/25 dark:[background-image:none]">
      <header className="border-b border-slate-200/85 px-4 py-2 text-[12px] font-bold text-slate-700 dark:border-teal-900/45 dark:text-slate-200">
        {dayLabel}
        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {meetings.length} meeting{meetings.length === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="divide-y divide-slate-200/85 dark:divide-teal-900/45">
        {meetings.map((m) => {
          const start = new Date(m.scheduled_at);
          const end = new Date(start.getTime() + (Number(m.duration_minutes) || 30) * 60 * 1000);
          const joinUrl = m.location_url || buildErpMeetingJoinUrl(m.jitsi_room);
          const canManage = isAdmin || m.created_by === currentUserId;
          const isCancelled = m.status === 'cancelled';
          const project = m.project_id ? projectsById?.[m.project_id] : null;
          const organizerName = nameById?.[m.created_by] || 'Organizer';
          const attendees = attendeesByMeeting?.[m.id] || [];
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 transition hover:bg-slate-50/85 dark:hover:bg-[#0e1824]/85"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                  {fmtTimeShort(start)} – {fmtTimeShort(end)}
                  {project ? (
                    <>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-slate-600 dark:text-slate-400">{project.name}</span>
                    </>
                  ) : null}
                </p>
                <p
                  className={[
                    'truncate text-[13px] font-extrabold tracking-tight',
                    isCancelled ? 'text-slate-500 line-through dark:text-slate-500' : 'text-slate-900 dark:text-slate-50',
                  ].join(' ')}
                >
                  {m.title}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Organized by {organizerName}
                  {attendees.length > 1 ? (
                    <>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      {attendees.length} invited
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isCancelled && joinUrl ? (
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
                  >
                    Join
                  </a>
                ) : null}
                {canManage && !isCancelled ? (
                  <button
                    type="button"
                    onClick={() => onEdit?.(m)}
                    className="rounded-lg border border-slate-300/85 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
                  >
                    Edit
                  </button>
                ) : null}
                {isCancelled ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/55">
                    Cancelled
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
