/**
 * Parse Roman Urdu / English relative dates and times for voice commands.
 */

import { preprocessVoiceTranscript } from './erp-voice-intents-shared';
import { calendarDayCountInclusive } from '../erp-leave';

/**
 * @param {string} raw
 * @returns {{ startDate: string, endDate: string, dayCount: number } | null}
 */
export function parseVoiceDateRange(raw) {
  const t = preprocessVoiceTranscript(raw);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start = new Date(today);
  let dayCount = 1;

  const daysMatch = t.match(/\b(\d+)\s+(?:din|days?)\b/);
  if (daysMatch) dayCount = Math.max(1, Math.min(30, parseInt(daysMatch[1], 10)));

  if (/\b(parson|day after tomorrow)\b/.test(t)) {
    start.setDate(start.getDate() + 2);
  } else if (/\b(kal|tomorrow)\b/.test(t)) {
    start.setDate(start.getDate() + 1);
  } else if (/\b(aaj|today)\b/.test(t)) {
    // today
  } else if (/\b(next week|agle haftay|agle week)\b/.test(t)) {
    start.setDate(start.getDate() + 7);
  }

  const fromMatch = t.match(/\b(?:kal|tomorrow|aaj|today|parson)\s+se\b/);
  if (fromMatch && /\b(kal|tomorrow)\b/.test(t)) {
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + dayCount - 1);

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    startDate: fmt(start),
    endDate: fmt(end),
    dayCount: calendarDayCountInclusive(fmt(start), fmt(end)) || dayCount,
  };
}

/**
 * @param {string} raw
 * @returns {string | null} ISO datetime
 */
export function parseVoiceDateTime(raw) {
  const t = preprocessVoiceTranscript(raw);
  const hasDateHint = /\b(kal|tomorrow|aaj|today|parson|next week|agle|\d{1,2}:|\d{1,2}\s+baje|\d{1,2}\s*(?:am|pm))\b/.test(t);
  if (!hasDateHint) return null;

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\b(kal|tomorrow)\b/.test(t)) base.setDate(base.getDate() + 1);
  else if (/\b(parson)\b/.test(t)) base.setDate(base.getDate() + 2);
  else if (/\b(next week|agle haftay)\b/.test(t)) base.setDate(base.getDate() + 7);

  let hours = 10;
  let minutes = 0;

  const h24 = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (h24) {
    hours = parseInt(h24[1], 10);
    minutes = parseInt(h24[2], 10);
  } else {
    const pm = t.match(/\b(\d{1,2})\s*(?:pm|p m)\b/);
    const am = t.match(/\b(\d{1,2})\s*(?:am|a m)\b/);
    const baje = t.match(/\b(\d{1,2})\s+baje\b/);
    const n = parseInt((pm || am || baje)?.[1] || '10', 10);
    if (pm) hours = n === 12 ? 12 : n + 12;
    else if (am) hours = n === 12 ? 0 : n;
    else if (baje) hours = n <= 6 ? n + 12 : n;
    else hours = n;
  }

  base.setHours(hours, minutes, 0, 0);
  if (Number.isNaN(base.getTime())) return null;
  return base.toISOString();
}
