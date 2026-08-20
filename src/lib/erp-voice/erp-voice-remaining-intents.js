/**
 * Remaining ERP voice parsers. Roman Urdu trained for this project.
 */

import { preprocessVoiceTranscript } from './erp-voice-intents-shared';
import { hasRomanAction } from './erp-voice-roman-urdu';

function cleanPerson(s) {
  return String(s || '')
    .replace(/\b(jo|ye|ya|us|is|the|please|user|member|ko|ka|ki|ke|se|sy|message|dm|send|bhejo|chat|se|baat)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function cleanEntity(s) {
  return String(s || '')
    .replace(/\b(jo|ye|ya|the|please|ko|ka|ki|ke|se|sy|karo|project|proj|task|kaam|meeting|note|wala|wali)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Open DM / chat with someone: no message body. */
export function matchOpenDm(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (/\b(message|bhejo|send|hello|hi|salam)\b/.test(t) && /\b(ko|to)\b/.test(t)) return null;

  const patterns = [
    /(.+?)\s+se\s+(?:baat|chat|message)\s+(?:karo|kro|kar do|shuru)/,
    /(.+?)\s+ko\s+(?:chat|message|dm)\s+(?:kholo|khol|open|karo)/,
    /(?:chat|message|dm)\s+(?:kholo|open|karo)\s+(.+)/,
    /(?:open|kholo)\s+(?:chat|message|dm)\s+(?:with\s+)?(.+)/,
    /(.+?)\s+(?:ke\s+sath|sath)\s+chat/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const personName = cleanPerson(m[1]);
    if (personName.length >= 2) {
      return {
        type: 'open_dm',
        personName,
        raw,
        messageEn: `Open chat with ${personName}?`,
      };
    }
  }
  return null;
}

/** Break start / end. */
export function matchAttendanceBreak(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (/\b(break end|break khatam|break wapas|break finish|break band|pause end)\b/.test(t)) {
    return { type: 'attendance_break_end', raw, messageEn: 'End pause?' };
  }
  if (
    /\b(break start|break shuru|break le|break lo|lunch break|tea break|short break|prayer break|short leave|chhuti|chutti|medical leave|emergency leave|training break)\b/.test(
      t,
    )
  ) {
    let breakType = 'general';
    if (/\b(short leave|chhuti|chutti|half leave)\b/.test(t)) breakType = 'short_leave';
    else if (/\b(medical|doctor|sick)\b/.test(t)) breakType = 'medical';
    else if (/\b(emergency|urgent)\b/.test(t)) breakType = 'emergency';
    else if (/\b(official|client visit|field)\b/.test(t)) breakType = 'official';
    else if (/\b(meeting|external meeting)\b/.test(t)) breakType = 'meeting';
    else if (/\b(training|course|seminar)\b/.test(t)) breakType = 'training';
    else if (/\b(lunch|meal)\b/.test(t)) breakType = 'lunch';
    else if (/\b(prayer|namaz|salah)\b/.test(t)) breakType = 'prayer';
    else if (/\b(personal)\b/.test(t)) breakType = 'personal';
    else if (/\b(short|tea|coffee)\b/.test(t)) breakType = 'short';
    const label =
      breakType === 'short_leave'
        ? 'Short leave'
        : breakType === 'medical'
          ? 'Medical leave'
          : breakType === 'emergency'
            ? 'Emergency leave'
            : breakType === 'short'
              ? 'Short break'
              : breakType === 'lunch'
                ? 'Lunch break'
                : breakType === 'prayer'
                  ? 'Prayer break'
                  : 'Pause';
    return { type: 'attendance_break_start', breakType, raw, messageEn: `Start ${label}?` };
  }
  return null;
}

/** Mark task complete / done. */
export function matchCompleteTask(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!hasRomanAction(t, 'complete') && !/\b(done|ho gaya|mukammal|tayar)\b/.test(t)) return null;

  const patterns = [
    /(?:task|kaam)\s+(.+?)\s+(?:complete|done|mukammal|tayar|ho gaya|khatam)/,
    /(.+?)\s+(?:task|kaam)\s+(?:complete|done|mukammal|khatam|ho gaya)/,
    /(?:complete|done|mukammal)\s+(?:task|kaam)\s+(.+)/,
    /(.+?)\s+(?:complete|done)\s+karo/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const title = cleanEntity(m[1]);
    if (title.length >= 2) {
      return {
        type: 'complete_task',
        title,
        raw,
        messageEn: `Mark task "${title}" as done?`,
      };
    }
  }
  return null;
}

/** Cancel a scheduled meeting by title. */
export function matchCancelMeeting(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(meeting|mulakaat|calendar)\b/.test(t)) return null;
  if (!hasRomanAction(t, 'cancel') && !/\b(cancel|band|hatao)\b/.test(t)) return null;

  const patterns = [
    /(?:cancel|band)\s+(?:meeting|mulakaat)\s+(.+)/,
    /(?:meeting|mulakaat)\s+(.+?)\s+(?:cancel|band|hatao)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const title = cleanEntity(m[1]);
    if (title.length >= 2) {
      return {
        type: 'cancel_meeting',
        title,
        raw,
        messageEn: `Cancel meeting "${title}"?`,
      };
    }
  }
  return null;
}

/** Cancel own pending leave. */
export function matchCancelOwnLeave(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(leave|chutti)\b/.test(t)) return null;
  if (!hasRomanAction(t, 'cancel')) return null;
  if (/\b(approve|reject|manzoor|mana)\b/.test(t)) return null;
  if (/\b(ali|muhammad|[a-z]{3,})\s+(ki|ka)\b/.test(t) && !/\b(meri|mera|my)\b/.test(t)) return null;

  if (/\b(meri|mera|my|apni|apna)\b/.test(t) || /\b(leave|chutti)\s+cancel\b/.test(t)) {
    return { type: 'cancel_leave_request', raw, messageEn: 'Cancel your pending leave request?' };
  }
  return null;
}

/** Cancel own pending remote request. */
export function matchCancelOwnRemote(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(remote|wfh|ghar se)\b/.test(t)) return null;
  if (!hasRomanAction(t, 'cancel')) return null;
  if (/\b(approve|reject)\b/.test(t)) return null;

  if (/\b(meri|mera|my|apni|apna|remote)\s+cancel\b/.test(t) || /\bcancel\s+(?:remote|wfh)\b/.test(t)) {
    return { type: 'cancel_remote_request', raw, messageEn: 'Cancel your pending remote request?' };
  }
  return null;
}

/** Re-invite trashed user by name/email. */
export function matchReinviteUser(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(reinvite|re invite|wapas invite|dobara invite|phir invite|restore user)\b/.test(t)) return null;

  const patterns = [
    /(?:reinvite|re invite|wapas invite|dobara invite|phir invite|restore user)\s+(.+)/,
    /(.+?)\s+(?:ko|ko)\s+(?:wapas|dobara|phir)\s+invite/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const q = cleanPerson(m[1]);
    if (q.length >= 2) {
      return {
        type: 'reinvite_user',
        personName: q.includes('@') ? undefined : q,
        email: q.includes('@') ? q : undefined,
        raw,
        messageEn: `Re-invite ${q}?`,
      };
    }
  }
  return null;
}

/** Roman Urdu navigate without "open". "projects par jao", "tasks dikhao". */
export function matchRomanNavigateLoose(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (hasRomanAction(t, 'create') || hasRomanAction(t, 'delete') || hasRomanAction(t, 'send')) return null;

  const pagePatterns = [
    { module: 'projects', href: '/erp/projects', label: 'Projects', re: /^(.+?)\s+(?:par jao|pe jao|dikhao|kholo|page|wala page)$/ },
    { module: 'tasks', href: '/erp/my-tasks', label: 'My tasks', re: /^(?:mere|meray)?\s*(?:kaam|tasks?)\s+(?:dikhao|kholo|par jao)$/ },
    { module: 'messages', href: '/erp/messages', label: 'Messages', re: /^(?:chat|message|paigham)\s+(?:kholo|dikhao|par jao)$/ },
    { module: 'announcements', href: '/erp/announcements', label: 'Announcements', re: /^(?:elan|announcement|update)\s+(?:kholo|dikhao|page)$/ },
    { module: 'leave', href: '/erp/leave', label: 'Leave', re: /^(?:chutti|leave)\s+(?:page|kholo|dikhao)$/ },
    { module: 'attendance', href: '/erp/attendance', label: 'Attendance', re: /^(?:hazri|attendance)\s+(?:lagao|page|kholo|dikhao)$/ },
    { module: 'files', href: '/erp/files', label: 'Files', re: /^(?:files?|documents?)\s+(?:kholo|dikhao|page)$/ },
    { module: 'meetings', href: '/erp/meetings', label: 'Meetings', re: /^(?:meeting|mulakaat|calendar)\s+(?:kholo|dikhao|page)$/ },
    { module: 'notes', href: '/erp/notes', label: 'Notes', re: /^(?:notes?|notepad)\s+(?:kholo|dikhao|page)$/ },
    { module: 'trash', href: '/erp/admin/trash', label: 'Trash', re: /^(?:trash|kachra)\s+(?:kholo|dikhao|page)$/ },
    { module: 'settings_roles', href: '/erp/admin/administration?tab=roles', label: 'Users & Roles', re: /^(?:roles?|permissions?|access)\s+(?:page|kholo|dikhao)$/ },
  ];

  for (const p of pagePatterns) {
    if (p.re.test(t)) {
      return {
        type: 'navigate',
        href: p.href,
        label: p.label,
        module: p.module,
        raw,
        messageEn: `Opening ${p.label}.`,
      };
    }
  }
  return null;
}

/** @param {string} raw */
export function matchRemainingFeatureActions(raw) {
  return (
    matchOpenDm(raw) ||
    matchAttendanceBreak(raw) ||
    matchCompleteTask(raw) ||
    matchCancelMeeting(raw) ||
    matchCancelOwnLeave(raw) ||
    matchCancelOwnRemote(raw) ||
    matchReinviteUser(raw) ||
    matchRomanNavigateLoose(raw)
  );
}
