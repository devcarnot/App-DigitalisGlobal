'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildErpMeetingJoinUrl, listErpMeetings } from '../../lib/erp-meetings-client';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCache,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LABELS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const VIEW_MODES = ['month', 'week', 'day'];
const VIEW_STORAGE_KEY = 'erp:meetingsCalendarMode';

// Day/Week scroll grid configuration. Show every hour (00:00–24:00) and let
// the panel scroll vertically. Auto-scrolls to the first interesting hour on
// mount so users don't always start at midnight.
const HOUR_HEIGHT_PX = 48;
const TIME_GUTTER_WIDTH_PX = 56;
const SCROLL_DEFAULT_HOUR = 7;

function startOfMonth(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  // Locale-naive: start week on Sunday to mirror the month grid header.
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
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

function fmtHourLabel(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' }).replace(/\s/g, '');
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

function buildWeekDays(cursor) {
  const start = startOfWeek(cursor);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

/**
 * Calendar of meetings with three view modes:
 *   - "month": classic month grid (default)
 *   - "week":  7-column hourly timeline for the visible week
 *   - "day":   single hourly timeline column for the visible day
 *
 * Self-contained: fetches its own data when mounted or when the parent bumps
 * `reloadKey`. Clicking a meeting block calls `onSelect` (preferred) so the
 * parent can show a read-only details panel; `onEdit` is kept as a fallback.
 */
export default function ErpMeetingsCalendarView({
  currentUserId,
  isAdmin = false,
  projectsById,
  nameById,
  onSelect,
  onEdit,
  reloadKey,
}) {
  const [viewMode, setViewMode] = useState('month');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const CACHE_KEY = currentUserId ? `meetings:calendar:${currentUserId}` : null;
  const [meetings, setMeetings] = useState(() => pickErpCache(CACHE_KEY, (c) => c.meetings ?? [], []));
  const [attendeesByMeeting, setAttendeesByMeeting] = useState(() =>
    pickErpCache(CACHE_KEY, (c) => c.attendeesByMeeting ?? {}, {}),
  );
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedYmd, setSelectedYmd] = useState(() => ymd(new Date()));

  // Restore the user's preferred view (month/week/day) from localStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored && VIEW_MODES.includes(stored)) {
        setViewMode(stored);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const switchViewMode = useCallback((next) => {
    if (!VIEW_MODES.includes(next)) return;
    setViewMode(next);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore quota / privacy errors */
    }
    // Snap the cursor to a sensible anchor for the new view so the header
    // labels stay in sync with what's visible.
    setCursor((c) => {
      if (next === 'month') return startOfMonth(c);
      if (next === 'week') return startOfWeek(c);
      return startOfDay(c);
    });
  }, []);

  const load = useCallback(async () => {
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setMeetings(Array.isArray(cached?.meetings) ? cached.meetings : []);
      setAttendeesByMeeting(
        cached?.attendeesByMeeting && typeof cached.attendeesByMeeting === 'object'
          ? cached.attendeesByMeeting
          : {},
      );
    }, setLoading);
    setErrorMsg('');
    try {
      const data = await listErpMeetings({ range: 'all' });
      const nextMeetings = Array.isArray(data?.meetings) ? data.meetings : [];
      const nextAttendees = data?.attendeesByMeeting || {};
      writeErpDataCache(CACHE_KEY, { meetings: nextMeetings, attendeesByMeeting: nextAttendees });
      setMeetings(nextMeetings);
      setAttendeesByMeeting(nextAttendees);
    } catch (e) {
      setErrorMsg(e?.message || 'Failed to load meetings');
      if (!hasErpDataCache(CACHE_KEY)) {
        setMeetings([]);
        setAttendeesByMeeting({});
      }
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

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

  const cells = useMemo(
    () => (viewMode === 'month' ? buildCalendarGrid(cursor) : []),
    [cursor, viewMode],
  );
  const weekDays = useMemo(
    () => (viewMode === 'week' ? buildWeekDays(cursor) : []),
    [cursor, viewMode],
  );

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') {
      return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const start = startOfWeek(cursor);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
      const startLabel = start.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const endLabel = end.toLocaleDateString(undefined, {
        month: sameMonth ? undefined : 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${startLabel} – ${endLabel}`;
    }
    return cursor.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [cursor, viewMode]);

  const goPrev = useCallback(() => {
    setCursor((c) => {
      const next = new Date(c);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() - 1);
        return startOfMonth(next);
      }
      if (viewMode === 'week') {
        next.setDate(next.getDate() - 7);
        return startOfWeek(next);
      }
      next.setDate(next.getDate() - 1);
      return startOfDay(next);
    });
  }, [viewMode]);

  const goNext = useCallback(() => {
    setCursor((c) => {
      const next = new Date(c);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() + 1);
        return startOfMonth(next);
      }
      if (viewMode === 'week') {
        next.setDate(next.getDate() + 7);
        return startOfWeek(next);
      }
      next.setDate(next.getDate() + 1);
      return startOfDay(next);
    });
  }, [viewMode]);

  const goToday = useCallback(() => {
    const now = new Date();
    if (viewMode === 'month') setCursor(startOfMonth(now));
    else if (viewMode === 'week') setCursor(startOfWeek(now));
    else setCursor(startOfDay(now));
    setSelectedYmd(ymd(now));
  }, [viewMode]);

  const todayYmd = ymd(new Date());

  const handleMeetingClick = useCallback(
    (meeting) => {
      // Prefer the read-only details panel (`onSelect`). Editing is always an
      // explicit, opt-in action inside the details modal.
      if (onSelect) {
        onSelect(meeting);
        return;
      }
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
    [currentUserId, isAdmin, onEdit, onSelect],
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-cyan-200/60 bg-white px-3 py-2 shadow-sm dark:border-teal-900/45 dark:bg-[#0a1016] dark:[background-image:none]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrev}
            aria-label={`Previous ${viewMode}`}
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
            aria-label={`Next ${viewMode}`}
            className="rounded-lg border border-slate-300/85 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
          >
            ›
          </button>
        </div>
        <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          {headerLabel}
        </h2>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Calendar layout"
            className="inline-flex overflow-hidden rounded-full border border-slate-300/85 bg-white text-[10px] font-bold uppercase tracking-wide shadow-sm dark:border-teal-900/55 dark:bg-[#101a22] dark:[background-image:none]"
          >
            {[
              { id: 'month', label: 'Month' },
              { id: 'week', label: 'Week' },
              { id: 'day', label: 'Day' },
            ].map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={viewMode === opt.id}
                onClick={() => switchViewMode(opt.id)}
                className={[
                  'px-2.5 py-1 transition',
                  i > 0 ? 'border-l border-slate-300/85 dark:border-teal-900/55' : '',
                  viewMode === opt.id
                    ? 'bg-teal-600 text-white shadow-inner dark:bg-teal-700'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#16242e]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            {loading && meetings.length === 0
              ? 'Loading…'
              : `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:border-rose-800/55 dark:bg-rose-950/45 dark:text-rose-200">
          {errorMsg}
        </div>
      ) : null}

      {viewMode === 'month' ? (
        <MonthGrid
          cells={cells}
          cursor={cursor}
          meetingsByDay={meetingsByDay}
          selectedYmd={selectedYmd}
          setSelectedYmd={setSelectedYmd}
          todayYmd={todayYmd}
          handleMeetingClick={handleMeetingClick}
        />
      ) : viewMode === 'week' ? (
        <HourTimeline
          days={weekDays}
          meetingsByDay={meetingsByDay}
          handleMeetingClick={handleMeetingClick}
          todayYmd={todayYmd}
          variant="week"
        />
      ) : (
        <HourTimeline
          days={[startOfDay(cursor)]}
          meetingsByDay={meetingsByDay}
          handleMeetingClick={handleMeetingClick}
          todayYmd={todayYmd}
          variant="day"
        />
      )}

      {viewMode === 'month' ? (
        <SelectedDayPanel
          ymdKey={selectedYmd}
          meetings={meetingsByDay[selectedYmd] || []}
          attendeesByMeeting={attendeesByMeeting}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          projectsById={projectsById}
          nameById={nameById}
          onEdit={onEdit}
          onSelect={onSelect}
        />
      ) : null}
    </section>
  );
}

function MonthGrid({
  cells,
  cursor,
  meetingsByDay,
  selectedYmd,
  setSelectedYmd,
  todayYmd,
  handleMeetingClick,
}) {
  const cursorMonth = cursor.getMonth();
  const cursorYear = cursor.getFullYear();
  return (
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
  );
}

/**
 * Shared scrollable hourly timeline used by the week + day views. Renders an
 * absolute-positioned meeting block per event so the start/duration is visible
 * at a glance. Now-line + auto-scroll keep the working hours in sight.
 */
function HourTimeline({ days, meetingsByDay, handleMeetingClick, todayYmd, variant }) {
  const scrollRef = useRef(null);
  const [now, setNow] = useState(() => new Date());

  // Auto-scroll to a sensible default hour on first paint so the user lands
  // on the working day, not midnight.
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const targetTop = SCROLL_DEFAULT_HOUR * HOUR_HEIGHT_PX;
    el.scrollTop = Math.max(0, targetTop - HOUR_HEIGHT_PX);
  }, []);

  // Tick the now-line every minute so it slides along the timeline live.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const colCount = days.length;
  const totalHeight = HOUR_HEIGHT_PX * 24;
  const showNow = days.some((d) => ymd(d) === todayYmd);
  const nowTop = showNow ? (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT_PX : 0;
  const nowDayIndex = showNow ? days.findIndex((d) => ymd(d) === ymd(now)) : -1;

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-200/60 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-teal-900/45 dark:bg-[#0a1016] dark:ring-teal-950/25 dark:[background-image:none]">
      {/* Day-of-week / day header strip */}
      <div
        className="grid border-b border-slate-200/85 bg-slate-50/85 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-teal-900/45 dark:bg-[#0e1824] dark:text-slate-300 dark:[background-image:none]"
        style={{
          gridTemplateColumns: `${TIME_GUTTER_WIDTH_PX}px repeat(${colCount}, minmax(0, 1fr))`,
        }}
      >
        <div aria-hidden />
        {days.map((d) => {
          const key = ymd(d);
          const isToday = key === todayYmd;
          return (
            <div
              key={`${key}-head`}
              className={[
                'flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-center',
                isToday ? 'text-teal-700 dark:text-teal-300' : '',
              ].join(' ')}
            >
              <span className="text-[10px] tracking-wider">
                {variant === 'day'
                  ? WEEKDAY_LABELS_LONG[d.getDay()]
                  : WEEKDAY_LABELS[d.getDay()]}
              </span>
              <span
                className={[
                  'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold',
                  isToday
                    ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500'
                    : 'text-slate-800 dark:text-slate-200',
                ].join(' ')}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable hour rows */}
      <div ref={scrollRef} className="relative max-h-[calc(100dvh-280px)] min-h-[420px] overflow-y-auto">
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `${TIME_GUTTER_WIDTH_PX}px repeat(${colCount}, minmax(0, 1fr))`,
            height: `${totalHeight}px`,
          }}
        >
          {/* Hour gutter */}
          <div className="relative border-r border-slate-200/85 dark:border-teal-900/45">
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={`gutter-${h}`}
                className="flex items-start justify-end border-b border-slate-100/85 pr-2 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-teal-900/30 dark:text-slate-500"
                style={{ height: `${HOUR_HEIGHT_PX}px` }}
              >
                {h === 0 ? '' : fmtHourLabel(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, dayIdx) => {
            const key = ymd(d);
            const isToday = key === todayYmd;
            const dayMeetings = meetingsByDay[key] || [];
            return (
              <div
                key={`col-${key}`}
                className={[
                  'relative border-r border-slate-200/70 dark:border-teal-900/40',
                  isToday ? 'bg-teal-50/30 dark:bg-teal-950/10' : '',
                ].join(' ')}
              >
                {/* Hour gridlines */}
                {Array.from({ length: 24 }).map((_, h) => (
                  <div
                    key={`grid-${key}-${h}`}
                    className="border-b border-slate-100/85 dark:border-teal-900/30"
                    style={{ height: `${HOUR_HEIGHT_PX}px` }}
                  />
                ))}
                {/* Meeting blocks */}
                {dayMeetings.map((m) => {
                  const start = new Date(m.scheduled_at);
                  if (Number.isNaN(start.getTime())) return null;
                  const minutes = Math.max(15, Math.min(720, Number(m.duration_minutes) || 30));
                  const end = new Date(start.getTime() + minutes * 60 * 1000);
                  const startMin = start.getHours() * 60 + start.getMinutes();
                  const top = (startMin / 60) * HOUR_HEIGHT_PX;
                  // Cap the block at the bottom of the visible day so blocks
                  // crossing midnight don't overflow the column.
                  const dayEnd = new Date(d);
                  dayEnd.setHours(23, 59, 0, 0);
                  const effectiveEnd = end > dayEnd ? dayEnd : end;
                  const heightMin = Math.max(15, (effectiveEnd - start) / 60000);
                  const height = (heightMin / 60) * HOUR_HEIGHT_PX;
                  const isCancelled = m.status === 'cancelled';
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMeetingClick(m);
                      }}
                      title={`${m.title || 'Meeting'} · ${fmtTimeShort(start)} – ${fmtTimeShort(end)}`}
                      className={[
                        'absolute left-1 right-1 z-[1] flex flex-col items-stretch gap-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[10px] font-semibold leading-tight shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80',
                        isCancelled
                          ? 'border-rose-300/55 bg-rose-100/85 text-rose-800 line-through hover:bg-rose-200/90 dark:border-rose-900/50 dark:bg-rose-950/55 dark:text-rose-200'
                          : 'border-teal-300/65 bg-teal-100/90 text-teal-900 hover:bg-teal-200/90 dark:border-teal-700/55 dark:bg-teal-900/65 dark:text-teal-100 dark:hover:bg-teal-800/75',
                      ].join(' ')}
                      style={{ top: `${top}px`, height: `${Math.max(20, height)}px` }}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">
                        {fmtTimeShort(start)} – {fmtTimeShort(end)}
                      </span>
                      <span className="line-clamp-2 text-[11px] font-extrabold tracking-tight">
                        {m.title || 'Meeting'}
                      </span>
                    </button>
                  );
                })}
                {/* Now line */}
                {showNow && nowDayIndex === dayIdx ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 right-0 z-[2]"
                    style={{ top: `${nowTop}px` }}
                  >
                    <div className="relative">
                      <div className="absolute -left-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0a1016]" />
                      <div className="h-px bg-rose-500" />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
  onSelect,
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
          const handleTitleClick = () => {
            if (onSelect) onSelect(m);
            else if (canManage && onEdit) onEdit(m);
          };
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
                <button
                  type="button"
                  onClick={handleTitleClick}
                  title="View meeting details"
                  className={[
                    'block w-full truncate text-left text-[13px] font-extrabold tracking-tight transition hover:text-teal-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:hover:text-teal-300',
                    isCancelled ? 'text-slate-500 line-through dark:text-slate-500' : 'text-slate-900 dark:text-slate-50',
                  ].join(' ')}
                >
                  {m.title}
                </button>
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
