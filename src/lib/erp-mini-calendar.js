import { parseDateOnlyLocal } from './task-dates';

/** @param {Date} d */
export function dateToYmd(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** @param {string | null | undefined} ymd */
export function ymdToDate(ymd) {
  return parseDateOnlyLocal(ymd);
}

/** @param {string | null | undefined} ymd */
export function formatYmdDisplay(ymd) {
  if (!ymd) return '';
  const d = ymdToDate(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/**
 * @param {number} viewYear
 * @param {number} viewMonth 0–11
 */
export function buildCalendarCells(viewYear, viewMonth) {
  const first = new Date(viewYear, viewMonth, 1);
  const start = new Date(viewYear, viewMonth, 1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      ymd: dateToYmd(d),
      inMonth: d.getMonth() === viewMonth,
      day: d.getDate(),
    });
  }
  return cells;
}

/** @param {string | undefined | null} ymd */
export function isYmdBefore(ymd, minYmd) {
  if (!ymd || !minYmd) return false;
  return String(ymd) < String(minYmd);
}

/** @param {string | undefined | null} ymd */
export function isYmdAfter(ymd, maxYmd) {
  if (!ymd || !maxYmd) return false;
  return String(ymd) > String(maxYmd);
}

/** @param {string | undefined | null} ymd @param {string | undefined | null} min @param {string | undefined | null} max */
export function isYmdDisabled(ymd, min, max) {
  return isYmdBefore(ymd, min) || isYmdAfter(ymd, max);
}

/** Split `YYYY-MM-DDTHH:mm` into date + time (`HH:mm`). */
export function splitDatetimeLocalValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return { date: '', time: '' };
  const [date, time = ''] = s.split('T');
  return { date: date || '', time: time.slice(0, 5) };
}

/** Merge date + time into datetime-local value. */
export function joinDatetimeLocalValue(date, time) {
  const d = String(date || '').trim();
  const t = String(time || '').trim();
  if (!d) return '';
  if (!t) return `${d}T00:00`;
  return `${d}T${t.length === 5 ? t : t.slice(0, 5)}`;
}
