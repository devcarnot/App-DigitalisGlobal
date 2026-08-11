/**
 * Detect which ERP feature a voice command refers to (not only projects).
 */

import { preprocessVoiceTranscript } from './erp-voice-intents-shared';

/** @typedef {'announcement' | 'note' | 'meeting' | 'message' | 'leave' | 'task' | 'project' | 'attendance' | 'search' | null} VoiceFeature */

const FEATURE_PATTERNS = /** @type {Array<[VoiceFeature, RegExp]>} */ ([
  ['announcement', /\b(announcement|announcements|update|updates|ikhbar|itla|itila)\b/],
  ['meeting', /\b(meeting|meetings|calendar meeting|schedule meeting)\b/],
  ['note', /\b(note|notes|notepad|yaad dash|yad dash)\b/],
  ['leave', /\b(leave request|apply leave|chutti|time off|approve leave|reject leave)\b/],
  ['message', /\b(message|messages|dm|direct message|inbox chat)\b/],
  ['attendance', /\b(check in|check out|attendance|clock in|clock out)\b/],
  ['task', /\b(task|tasks|kaam)\b/],
  ['project', /\b(project|proj)\b/],
]);

/**
 * @param {string} raw
 * @returns {VoiceFeature}
 */
export function detectVoiceFeature(raw) {
  const t = preprocessVoiceTranscript(raw);
  for (const [feature, re] of FEATURE_PATTERNS) {
    if (re.test(t)) return feature;
  }
  return null;
}

/** @param {string} raw */
export function isAnnouncementVoiceCommand(raw) {
  return detectVoiceFeature(raw) === 'announcement';
}

/** @param {string} raw */
export function isNoteVoiceCommand(raw) {
  return detectVoiceFeature(raw) === 'note';
}

/** @param {string} raw */
export function isMeetingVoiceCommand(raw) {
  return detectVoiceFeature(raw) === 'meeting';
}

/**
 * True when the utterance is clearly about projects/tasks: not announcements, notes, etc.
 * @param {string} raw
 */
export function isProjectVoiceCommand(raw) {
  const feature = detectVoiceFeature(raw);
  if (feature === 'project' || feature === 'task') return true;
  if (feature && feature !== 'project' && feature !== 'task') return false;
  const t = preprocessVoiceTranscript(raw);
  return /\b(project|proj)\b/.test(t);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function splitVoiceSegments(raw) {
  const t = preprocessVoiceTranscript(raw);
  const parts = t.split(/\s+(?:aur|and|then|phir|uske baad|after that|also|plus|,\s*aur|,\s*and)\s+/i);
  const segments = parts.map((s) => s.trim()).filter((s) => s.length > 1);
  return segments.length > 0 ? segments : [t];
}

/** @param {string} s */
function cleanAnnouncementTitle(s) {
  return String(s || '')
    .replace(/^(the|a|an|title|named|called)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** @param {string} t */
function stripAnnouncementBoilerplate(t) {
  return String(t || '')
    .replace(/\b(new|naya)\s+(announcement|announcements|update|updates)\b/gi, ' ')
    .replace(/\b(announcement|announcements|update|updates)\b/gi, ' ')
    .replace(/\b(add|create|post|publish|banao|bnao|daalo|dalo|likho|type|likh)\b/gi, ' ')
    .replace(/\b(karo|kro|krdo|kardo|kar do|karein|do|de|kiya|karo do)\b/gi, ' ')
    .replace(/\b(send|bhejo|bhej do|broadcast|notify|sabko|sab ko|everyone|all staff|team ko|puri team|sari team|tamam)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} seg */
function extractFromAnnouncementSegment(seg) {
  const t = preprocessVoiceTranscript(seg);
  let s = stripAnnouncementBoilerplate(t);

  const msgMatch = s.match(/^(.+?)\s+(?:message|body|matlab|detail|text|msg)\s+(?:hai\s+|is\s+|:\s*)?(.+)$/i);
  if (msgMatch?.[1] && msgMatch?.[2]) {
    const title = cleanAnnouncementTitle(msgMatch[1]);
    const body = msgMatch[2].trim();
    if (title.length >= 2 && body.length >= 2) return { title, body };
  }

  const titledMatch = s.match(/(?:title|named|called|naam)\s+(?:hai\s+|is\s+|:\s*)?(.+?)(?:\s+(?:message|body|matlab)\s+(.+))?$/i);
  if (titledMatch?.[1]) {
    const title = cleanAnnouncementTitle(titledMatch[1]);
    const body = titledMatch[2]?.trim();
    if (title.length >= 2) return { title, body: body && body.length >= 2 ? body : null };
  }

  if (s.length >= 2) return { title: cleanAnnouncementTitle(s), body: null };
  return null;
}

/**
 * @param {string} raw
 * @returns {{ title: string, body: string } | null}
 */
export function extractAnnouncementContent(raw) {
  const segments = splitVoiceSegments(raw);
  /** @type {{ title?: string, body?: string }} */
  let best = {};

  for (const seg of segments) {
    const t = preprocessVoiceTranscript(seg);
    if (!/\b(announcement|announcements|update|updates)\b/.test(t) && !best.title) {
      if (/\b(send|bhejo|broadcast|sabko|everyone|notify)\b/.test(t)) continue;
    }
    const part = extractFromAnnouncementSegment(seg);
    if (part?.title && !best.title) best.title = part.title;
    if (part?.body && !best.body) best.body = part.body;
  }

  if (!best.title) {
    const full = extractFromAnnouncementSegment(raw);
    if (full?.title) best = { ...best, ...full };
  }

  if (!best.title || best.title.length < 2) return null;

  const title = best.title.slice(0, 200);
  const body = (best.body || best.title).slice(0, 12000);
  return { title, body };
}

/** @param {string} s */
function cleanNoteTitle(s) {
  return String(s || '')
    .replace(/^(the|a|an|title|named|called)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** @param {string} seg */
function extractFromNoteSegment(seg) {
  const t = preprocessVoiceTranscript(seg);
  let s = String(t || '')
    .replace(/\b(new|naya)\s+(note|notes)\b/gi, ' ')
    .replace(/\b(note|notes|notepad)\b/gi, ' ')
    .replace(/\b(add|create|banao|bnao|likho|save|daalo|dalo)\b/gi, ' ')
    .replace(/\b(karo|kro|krdo|kardo|kar do|do|de)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const msgMatch = s.match(/^(.+?)\s+(?:message|body|detail|matlab|text)\s+(?:hai\s+|is\s+|:\s*)?(.+)$/i);
  if (msgMatch?.[1] && msgMatch?.[2]) {
    const title = cleanNoteTitle(msgMatch[1]);
    const body = msgMatch[2].trim();
    if (title.length >= 2) return { title, body: body.length >= 1 ? body : null };
  }

  if (s.length >= 2) return { title: cleanNoteTitle(s), body: null };
  return null;
}

/**
 * @param {string} raw
 * @returns {{ title: string, body: string | null } | null}
 */
export function extractNoteContent(raw) {
  const segments = splitVoiceSegments(raw);
  /** @type {{ title?: string, body?: string | null }} */
  let best = {};

  for (const seg of segments) {
    if (!/\b(note|notes|notepad)\b/.test(preprocessVoiceTranscript(seg)) && !best.title) continue;
    const part = extractFromNoteSegment(seg);
    if (part?.title && !best.title) best.title = part.title;
    if (part?.body && !best.body) best.body = part.body;
  }

  if (!best.title) {
    const full = extractFromNoteSegment(raw);
    if (full?.title) best = { ...best, ...full };
  }

  if (!best.title || best.title.length < 2) return null;
  return { title: best.title.slice(0, 120), body: best.body ? best.body.slice(0, 8000) : null };
}
