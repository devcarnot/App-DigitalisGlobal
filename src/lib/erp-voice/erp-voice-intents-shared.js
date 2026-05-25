/**
 * Shared Roman Urdu / English voice transcript helpers.
 */

import { applyRomanUrduNormalization } from './erp-voice-roman-urdu';

export function normalizeTranscript(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fix common Roman Urdu STT mistakes before intent matching. */
export function preprocessVoiceTranscript(raw) {
  let t = normalizeTranscript(raw);
  t = applyRomanUrduNormalization(t);

  t = t
    .replace(/\b(usne|unhon ne|unho ne|wo|wou|yeh|ye|ab|bhai|yaar|please|sun|suno|bolo|kaho|matlab|means|like)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return t;
}

/** Strip filler / command words from extracted project title. */
export function cleanProjectTitle(s) {
  return sanitizeProjectName(String(s || ''));
}

/** @param {string} s */
export function sanitizeProjectName(s) {
  return String(s || '')
    .replace(/^(new|naya|jo|ye|ya|wahi|isko|usko|the|this|that)\s+/i, '')
    .replace(/\b(jismein|jis mein|mein|in|with|add|members|member|team|log|bande|banday|people|karo|kro|krdo|kardo|create|banao|bnao|bana|project|proj|delete|hatao|mitao|remove|isko|usko|hai|hua|banaa|banaya|bani|jo|naam|se|sy|kar do|kardo)\b.*$/i, '')
    .replace(/\b(ke|k)\s+naam\s+(se|sy|par|pe)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} name */
export function isValidEntityName(name) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (n.length < 2 || n.length > 60) return false;
  if (/^(isko|usko|jo|ye|ya|wahi|delete|karo|kar do|bana hua|banaa hua|naam se|isko delete|project jo|jo project|hai|hua|mitao|hatao)$/.test(n)) {
    return false;
  }
  const filler = new Set([
    'isko', 'usko', 'jo', 'ye', 'ya', 'hai', 'hua', 'bana', 'banaa', 'banaya', 'bani', 'naam', 'se', 'sy',
    'delete', 'karo', 'kar', 'do', 'de', 'mitao', 'hatao', 'remove', 'project', 'proj', 'the', 'this', 'that',
    'mein', 'in', 'wala', 'wali', 'walay',
  ]);
  const meaningful = n.split(/\s+/).filter((w) => w.length > 1 && !filler.has(w));
  return meaningful.length >= 1 && meaningful.join(' ').length >= 2;
}

/** True when user wants to delete/remove — not create. */
export function isDeleteIntent(raw) {
  const t = preprocessVoiceTranscript(raw);
  const hasDelete = /\b(delete|remove|hatao|hata do|mitao|mita do|khatam|drop|del|uda do)\b/.test(t);
  if (!hasDelete) return false;

  const explicitCreate = /\b(project\s+(?:banao|bnao|create|bana do)|(?:banao|bnao|create)\s+project|naya project|new project)\b/.test(t);
  const describingExisting = /\b(bana hua|banaa hua|banaya hua|bana hai|bani hui|jo project|project jo)\b/.test(t);
  if (describingExisting) return true;
  return !explicitCreate;
}

/** True only for clear create commands (not "bana hua" past tense). */
export function isExplicitCreateIntent(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (isDeleteIntent(raw)) return false;
  return /\b(project\s+(?:banao|bnao|create|bana do|bana de)|(?:banao|bnao|create)\s+project|naya project|new project)\b/.test(t);
}

/**
 * Pull project name from "… X ke naam se …" (delete or reference).
 * @param {string} phrase — text before "ke naam se"
 */
function extractNameFromKeNaamSePhrase(phrase) {
  let name = String(phrase || '')
    .replace(/^(?:jo\s+)?(?:project|proj)\s+(?:bana\s+hua|banaa\s+hua|banaya\s+hua|bana\s+hai|bani\s+hui)\s+(?:hai\s+)?/i, '')
    .replace(/^(?:jo\s+)?(?:project|proj)\s+/i, '')
    .replace(/^(?:bana\s+hua|banaa\s+hua|banaya\s+hua|bana\s+hai|bani\s+hui)\s+(?:hai\s+)?/i, '')
    .trim();
  return sanitizeProjectName(name);
}

/**
 * Parse delete-project target from Roman Urdu / English.
 * @param {string} raw
 * @returns {{ projectName?: string, useLastCreated?: boolean } | null}
 */
export function extractDeleteProjectTarget(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!isDeleteIntent(raw)) return null;
  if (!/\b(project|proj|isko|usko|ye project|jo project)\b/.test(t)) return null;

  const naamBefore = t.match(/(.+?)\s+(?:ke|k)\s+naam\s+(?:se|sy|par|pe)\b/);
  if (naamBefore?.[1]) {
    const name = extractNameFromKeNaamSePhrase(naamBefore[1]);
    if (isValidEntityName(name)) return { projectName: name };
  }

  const patterns = [
    /(?:delete|remove|hatao|hata do|mitao|drop)\s+(?:project|proj)\s+(.+)/,
    /(?:project|proj)\s+(.+?)\s+(?:delete|remove|hatao|mitao|drop|kar do|kardo)/,
    /(.+?)\s+(?:project|proj)\s+(?:delete|hatao|remove|mitao)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const name = sanitizeProjectName(m[1]);
      if (isValidEntityName(name)) return { projectName: name };
    }
  }

  if (/\b(isiko|isko|usko|ye|ya|wahi|jo abhi|abhi bana|just created|jo project|project jo|bana hua|banaa hua)\b/.test(t)) {
    return { useLastCreated: true };
  }

  return { useLastCreated: true };
}

/**
 * Extract people from Roman Urdu "X ko add karo" patterns.
 * @param {string} raw
 * @returns {string[]}
 */
export function extractVoiceMemberNames(raw) {
  if (isDeleteIntent(raw)) return [];

  const t = preprocessVoiceTranscript(raw);
  if (/\b(announcement|announcements|update|updates|note|notes|notepad|meeting|meetings|leave|chutti|message|messages|dm)\b/.test(t)) {
    return [];
  }
  const members = [];

  if (/\bsuper\s+admin\b/.test(t)) {
    members.push('super admin');
  }

  const koAddRe =
    /([a-z][a-z0-9\s]*?)\s+ko\s+(?:add|assign|jodo|shamil|include|dal|daal|dalo|daalo|lagao|rakho)\s*(?:karo|kro|krdo|kardo|kar do|karein|kre|do|de)?/gi;
  let m;
  while ((m = koAddRe.exec(t)) !== null) {
    let name = m[1]
      .replace(/^(se|sy|par|pe|mein|in)\s+/i, '')
      .trim();
    if (!name || name.length < 2 || name.length > 45) continue;
    if (/\b(project|bnao|banao|bana|create|naam|name|ke naam|k naam|karo|kro)\b/.test(name)) continue;

    if (/^super\s+admin$/i.test(name) || /^superadmin$/i.test(name)) {
      if (!members.includes('super admin')) members.push('super admin');
      continue;
    }

    name = name.replace(/^(ek|aik|one|iss|us|is|the|a)\s+/i, '').trim();
    if (!name || name.length < 2) continue;
    if (/^super\s+admin$/i.test(name)) {
      if (!members.includes('super admin')) members.push('super admin');
      continue;
    }
    members.push(name);
  }

  const nameKaroRe =
    /\b(?!create|project|task|banao|bnao|bana|naya|new|super|admin|please|help|yes|haan|open|search|check|add|karo|kro)([a-z][a-z0-9]{2,}(?:\s+[a-z][a-z0-9]{2,})?)\s+(?:karo|kro|krdo|kardo|kar do)\b/gi;
  while ((m = nameKaroRe.exec(t)) !== null) {
    const name = m[1].trim();
    if (name.length >= 2 && name.length <= 45 && !/\b(project|task|naam)\b/.test(name)) {
      members.push(name);
    }
  }

  const skipMember = /^(add|karo|kro|create|project|task|naam|name|super|admin|karo muhammad|muhammad karo)$/i;

  const seen = new Set();
  return members.filter((name) => {
    const key = name.toLowerCase();
    if (skipMember.test(key)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function extractProjectTitle(raw) {
  if (isDeleteIntent(raw) && !isExplicitCreateIntent(raw)) return null;

  const t = preprocessVoiceTranscript(raw);
  if (/\b(announcement|announcements|update|updates|note|notes|notepad|meeting|meetings)\b/.test(t)) return null;
  const hasProjectWord = /\b(project|proj)\b/.test(t);
  const hasCreateVerb = /\b(create|banao|bnao|bana|banaye|banana|new|naya|add|bana do|bana de|bna de|bna do)\b/.test(t);

  if (!hasProjectWord && !hasCreateVerb) return null;
  if (/\b(bana hua|banaa hua|banaya hua|bana hai|bani hui)\b/.test(t) && !hasCreateVerb) return null;

  const naamBefore = t.match(
    /(?:project\s+(?:bnao|bnao|banao|bana do|bana de|bna de|bna do|create|bana|banaye)\s+(?:new\s+)?|(?:bnao|banao|bana do|create|banaye)\s+(?:new\s+)?project\s+(?:new\s+)?|(?:create|bana do|bna do)\s+(?:new\s+)?project\s+(?:new\s+)?)(.+?)\s+(?:ke|k)\s+naam\s+(?:se|sy|par|pe)\b/,
  );
  if (naamBefore?.[1]) {
    const cleaned = cleanProjectTitle(naamBefore[1]);
    if (isValidEntityName(cleaned)) return cleaned;
  }

  const naamAfter = t.match(/(?:naam\s+(?:se|sy|par|pe)\s+)(.+?)(?:\s+super|\s+[a-z]+\s+ko\s+(?:add|assign)|$)/);
  if (naamAfter?.[1]) {
    const cleaned = cleanProjectTitle(naamAfter[1]);
    if (isValidEntityName(cleaned)) return cleaned;
  }

  const namedPatterns = [
    /(?:named|called|name is|name)\s+(.+?)(?:\s+super|\s+[a-z]+\s+ko\s+(?:add|assign)|$)/,
    /(?:new\s+)?project\s+(?:bnao|bnao|banao|create)\s+(?:new\s+)?(.+?)(?:\s+(?:ke|k)\s+naam|\s+super|\s+[a-z]+\s+ko\s+(?:add|assign)|$)/,
    /(?:test|proj)\s+(\d+[a-z0-9\s]*?)(?:\s+(?:ke|k)\s+naam|\s+super|\s+[a-z]+\s+ko|\s+add|$)/,
    /\b([a-z0-9][a-z0-9\s-]{1,30}?)\s+(?:ke|k)\s+naam\s+(?:se|sy|par|pe)\b/,
  ];
  for (const re of namedPatterns) {
    const match = t.match(re);
    if (match?.[1]) {
      const cleaned = cleanProjectTitle(match[1]);
      if (isValidEntityName(cleaned)) return cleaned;
    }
  }

  return null;
}
