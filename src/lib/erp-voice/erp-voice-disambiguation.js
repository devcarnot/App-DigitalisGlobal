/**
 * Voice assistant: pick the right person when names are ambiguous (e.g. two "Ali").
 */

import { normalizeTranscript } from './erp-voice-intents-shared';
import { erpMemberTeamLabel, erpWorkspaceRoleLabel } from '../erp-roles';

/**
 * @param {{ full_name?: string | null, role?: string | null, member_team?: string | null }} person
 */
export function formatPersonCandidateSubtitle(person) {
  const team = erpMemberTeamLabel(person?.member_team);
  if (team) return team;
  return erpWorkspaceRoleLabel(person?.role || '');
}

/**
 * @param {{ id: string, full_name?: string | null, role?: string | null, member_team?: string | null }} person
 */
export function enrichPersonCandidate(person) {
  return {
    id: person.id,
    full_name: person.full_name || 'User',
    role: person.role || '',
    member_team: person.member_team || null,
    subtitle: formatPersonCandidateSubtitle(person),
  };
}

/**
 * @param {string} query
 * @param {ReturnType<typeof enrichPersonCandidate>[]} candidates
 */
export function formatPersonChoiceMessage(query, candidates) {
  const lines = candidates.map((c, i) => `${i + 1}. ${c.full_name}, ${c.subtitle}`);
  return `Which "${query}"?\n${lines.join('\n')}\n\nSay the number or team (e.g. "developer", "marketing").`;
}

/**
 * @param {string} text
 * @param {ReturnType<typeof enrichPersonCandidate>[]} candidates
 */
export function parseVoicePersonChoice(text, candidates) {
  if (!candidates?.length) return null;
  const t = normalizeTranscript(text);
  if (!t) return null;

  const numOnly = t.match(/^(\d+)$/);
  if (numOnly) {
    const idx = parseInt(numOnly[1], 10) - 1;
    if (idx >= 0 && idx < candidates.length) return candidates[idx];
  }

  const numWord = t.match(/^(?:option|number|no\.?)\s*(\d+)$/);
  if (numWord) {
    const idx = parseInt(numWord[1], 10) - 1;
    if (idx >= 0 && idx < candidates.length) return candidates[idx];
  }

  if (/^(first|pehla|pehle|one|1st)$/.test(t)) return candidates[0];
  if (/^(second|doosra|dusra|two|2nd)$/.test(t) && candidates[1]) return candidates[1];
  if (/^(third|teesra|three|3rd)$/.test(t) && candidates[2]) return candidates[2];

  for (const c of candidates) {
    const sub = (c.subtitle || '').toLowerCase();
    const name = (c.full_name || '').toLowerCase();
    if (sub && (t === sub || t.includes(sub) || sub.includes(t))) return c;
    const subFirst = sub.split(/\s+/)[0];
    if (subFirst && subFirst.length > 3 && t.includes(subFirst)) return c;
    if (name === t) return c;
    const words = t.split(/\s+/).filter((w) => w.length > 1);
    if (words.length && words.every((w) => name.includes(w))) return c;
  }

  for (const c of candidates) {
    const name = (c.full_name || '').toLowerCase();
    if (name.includes(t) || t.includes(name.split(/\s+/)[0])) return c;
  }

  return null;
}
