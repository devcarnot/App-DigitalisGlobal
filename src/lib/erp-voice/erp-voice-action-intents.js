/**
 * Voice commands for ERP admin / member actions beyond projects.
 */

import { preprocessVoiceTranscript, normalizeTranscript } from './erp-voice-intents-shared';
import { parseVoicePersonChoice } from './erp-voice-disambiguation';
import { matchExtraFeatureActions } from './erp-voice-extra-intents';
import { matchRemainingFeatureActions } from './erp-voice-remaining-intents';

/** @typedef {'change_user_role' | 'change_member_team' | 'invite_user' | 'create_client' | 'delete_client' | 'delete_note' | 'restore_project' | 'approve_leave' | 'reject_leave' | 'approve_remote' | 'reject_remote' | 'open_page'} VoiceActionIntentType */

const ROLE_VOICE_MAP = [
  ['super admin', 'admin'],
  ['superadmin', 'admin'],
  ['team manager', 'team_lead'],
  ['team lead', 'team_lead'],
  ['team member', 'team_member'],
  ['business developer', 'bd'],
  ['client team member', 'client_team_member'],
  ['client team', 'client_team_member'],
  ['admin', 'admin'],
  ['manager', 'team_lead'],
  ['member', 'team_member'],
  ['hr', 'hr'],
  ['bd', 'bd'],
  ['client', 'client'],
];

const MEMBER_TEAM_VOICE_MAP = [
  ['graphic designer', 'graphic_designer'],
  ['graphic design', 'graphic_designer'],
  ['developer', 'developer'],
  ['marketing team', 'marketing'],
  ['marketing', 'marketing'],
];

/**
 * @param {string} phrase
 * @returns {string | null}
 */
export function parseVoiceWorkspaceRole(phrase) {
  const t = preprocessVoiceTranscript(phrase);
  const sorted = [...ROLE_VOICE_MAP].sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, key] of sorted) {
    if (t === spoken || t.includes(spoken)) return key;
  }
  return null;
}

/**
 * @param {string} phrase
 * @returns {string | null}
 */
export function parseVoiceMemberTeam(phrase) {
  const t = preprocessVoiceTranscript(phrase);
  const sorted = [...MEMBER_TEAM_VOICE_MAP].sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, key] of sorted) {
    if (t === spoken || t.includes(spoken)) return key;
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {import('./erp-voice-intents').ErpVoiceIntent | null}
 */
export function matchChangeUserRole(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(role|access|permission|super admin|team lead|team member|hr|bd|client)\b/.test(t)) return null;
  if (/\b(member team|developer|graphic|marketing team)\b/.test(t) && !/\brole\b/.test(t)) return null;

  const patterns = [
    /(.+?)\s+(?:ka|ki|ko)\s+(?:role|access)\s+(.+?)\s+(?:banao|karo|set|kar do|change|update|do|de)/,
    /(.+?)\s+ko\s+(super admin|team lead|team manager|team member|hr|bd|client|admin|manager|member)\s+(?:banao|karo|role|ban do|kar do)/,
    /change\s+(.+?)\s+role\s+(?:to|ko)\s+(.+)/,
    /(.+?)\s+ka\s+role\s+(.+?)\s+(?:kar do|karo|change|set)/,
    /(.+?)\s+ko\s+(.+?)\s+role\s+(?:do|de|karo|banao)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const personName = cleanPersonFragment(m[1]);
    const roleKey = parseVoiceWorkspaceRole(m[2]);
    if (!personName || !roleKey) continue;
    const roleLabel = m[2].trim();
    return {
      type: 'change_user_role',
      personName,
      targetRole: roleKey,
      raw,
      messageEn: `Change ${personName}'s role to ${roleLabel}?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchChangeMemberTeam(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(developer|graphic|marketing|member team|team designation)\b/.test(t)) return null;

  const patterns = [
    /(.+?)\s+ko\s+(developer|graphic designer|graphic design|marketing|marketing team)\s+(?:banao|team|karo|kar do|set)/,
    /(.+?)\s+(?:ka|ki)\s+(?:team|designation)\s+(developer|graphic designer|marketing|marketing team)/,
    /(.+?)\s+ko\s+(developer|marketing|graphic designer)\s+team/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const personName = cleanPersonFragment(m[1]);
    const teamKey = parseVoiceMemberTeam(m[2]);
    if (!personName || !teamKey) continue;
    return {
      type: 'change_member_team',
      personName,
      targetMemberTeam: teamKey,
      raw,
      messageEn: `Set ${personName}'s team to ${m[2].trim()}?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchInviteUser(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(invite|invitation|bulao|daakhla|new user)\b/.test(t)) return null;

  const patterns = [
    /invite\s+([^\s@]+@[^\s]+)(?:\s+(?:as|ko|role)\s+(.+))?/,
    /new user invite\s+([^\s@]+@[^\s]+)(?:\s+(?:as|ko)\s+(.+))?/,
    /([^\s@]+@[^\s]+)\s+ko\s+invite\s+karo(?:\s+(?:as|role)\s+(.+))?/,
    /invite\s+karo\s+([^\s@]+@[^\s]+)(?:\s+(?:as|ko)\s+(.+))?/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const email = m[1].trim().toLowerCase();
    const roleKey = m[2] ? parseVoiceWorkspaceRole(m[2]) || 'team_member' : 'team_member';
    const roleLabel = m[2]?.trim() || 'team member';
    return {
      type: 'invite_user',
      email,
      targetRole: roleKey,
      raw,
      messageEn: `Invite ${email} as ${roleLabel}?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchCreateClient(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(client|clients|company|lead|crm)\b/.test(t)) return null;
  if (/\b(delete|remove|hatao|mitao)\b/.test(t)) return null;
  if (!/\b(add|create|banao|bnao|new|naya|daalo)\b/.test(t)) return null;

  const patterns = [
    /(?:client|company|lead)\s+(?:add|create|banao|bnao|new)\s+(.+)/,
    /(?:add|create|banao|bnao)\s+(?:client|company|lead)\s+(.+)/,
    /(.+?)\s+(?:client|company)\s+(?:add|banao|create|bnao)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const companyName = cleanEntityName(m[1]);
    if (companyName.length < 2) continue;
    return {
      type: 'create_client',
      title: companyName,
      raw,
      messageEn: `Create client "${companyName}"?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchDeleteClient(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(client|clients|company|lead)\b/.test(t)) return null;
  if (!/\b(delete|remove|hatao|mitao|drop)\b/.test(t)) return null;

  const patterns = [
    /(?:delete|remove|hatao|mitao)\s+(?:client|company|lead)\s+(.+)/,
    /(?:client|company|lead)\s+(.+?)\s+(?:delete|remove|hatao|mitao)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const name = cleanEntityName(m[1]);
    if (name.length < 2) continue;
    return {
      type: 'delete_client',
      title: name,
      raw,
      messageEn: `Delete client "${name}"?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchDeleteNote(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(note|notes)\b/.test(t)) return null;
  if (!/\b(delete|remove|hatao|mitao)\b/.test(t)) return null;

  const patterns = [
    /(?:delete|remove|hatao|mitao)\s+(?:note|notes)\s+(.+)/,
    /(?:note|notes)\s+(.+?)\s+(?:delete|remove|hatao|mitao)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const title = cleanEntityName(m[1]);
    if (title.length < 2) continue;
    return {
      type: 'delete_note',
      title,
      raw,
      messageEn: `Delete note "${title}"?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchRestoreProject(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(restore|recover|wapas|undo)\b/.test(t)) return null;
  if (!/\b(project|proj|trash)\b/.test(t)) return null;

  const patterns = [
    /restore\s+(?:project|proj)\s+(.+)/,
    /(?:project|proj)\s+(.+?)\s+restore/,
    /trash\s+(?:se|sy|from)\s+(?:project|proj)\s+(.+?)\s+restore/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const name = cleanEntityName(m[1]);
    if (name.length < 2) continue;
    return {
      type: 'restore_project',
      projectName: name,
      raw,
      messageEn: `Restore project "${name}" from trash?`,
    };
  }
  return null;
}

/**
 * @param {string} raw
 * @param {'approve' | 'reject'} decision
 */
function matchLeaveRemoteDecision(raw, decision) {
  const t = preprocessVoiceTranscript(raw);
  const isLeave = /\b(leave|chutti|time off)\b/.test(t);
  const isRemote = /\b(remote|wfh|work from home)\b/.test(t);
  if (!isLeave && !isRemote) return null;

  const approveRe = /\b(approve|manzoor|accept|ok kar do)\b/.test(t);
  const rejectRe = /\b(reject|decline|mana|refuse|na kar do)\b/.test(t);
  if (decision === 'approve' && !approveRe) return null;
  if (decision === 'reject' && !rejectRe) return null;

  const patterns = [
    /(?:approve|reject|manzoor|mana|accept|decline)\s+(?:leave|chutti|remote|wfh)\s+(?:for\s+|of\s+|ka\s+|ki\s+)?(.+)/,
    /(?:approve|reject|manzoor|mana)\s+(.+?)\s+(?:leave|chutti|remote|wfh)/,
    /(.+?)\s+(?:ki|ka)\s+(?:leave|chutti|remote|wfh)\s+(?:approve|reject|manzoor|mana)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const personName = cleanPersonFragment(m[1]);
    if (personName.length < 2) continue;
    const type = isRemote ? (decision === 'approve' ? 'approve_remote' : 'reject_remote') : decision === 'approve' ? 'approve_leave' : 'reject_leave';
    const label = isRemote ? 'remote work' : 'leave';
    const verb = decision === 'approve' ? 'Approve' : 'Reject';
    return {
      type,
      personName,
      raw,
      messageEn: `${verb} ${personName}'s ${label} request?`,
    };
  }
  return null;
}

/** @param {string} raw */
export function matchApproveLeave(raw) {
  return matchLeaveRemoteDecision(raw, 'approve');
}

/** @param {string} raw */
export function matchRejectLeave(raw) {
  return matchLeaveRemoteDecision(raw, 'reject');
}

/** @param {string} raw */
export function matchApproveRemote(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(remote|wfh)\b/.test(t)) return null;
  return matchLeaveRemoteDecision(raw, 'approve');
}

/** @param {string} raw */
export function matchRejectRemote(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(remote|wfh)\b/.test(t)) return null;
  return matchLeaveRemoteDecision(raw, 'reject');
}

/**
 * @param {string} raw
 * @returns {import('./erp-voice-intents').ErpVoiceIntent | null}
 */
export function matchAdminAndFeatureActions(raw) {
  return (
    matchExtraFeatureActions(raw) ||
    matchRemainingFeatureActions(raw) ||
    matchChangeUserRole(raw) ||
    matchChangeMemberTeam(raw) ||
    matchInviteUser(raw) ||
    matchCreateClient(raw) ||
    matchDeleteClient(raw) ||
    matchDeleteNote(raw) ||
    matchRestoreProject(raw) ||
    matchApproveLeave(raw) ||
    matchRejectLeave(raw) ||
    matchApproveRemote(raw) ||
    matchRejectRemote(raw)
  );
}

/** @param {string} s */
function cleanPersonFragment(s) {
  return String(s || '')
    .replace(/\b(jo|ye|ya|us|is|the|please|user|member|person|banday|bande|ko|ka|ki|ke)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} s */
function cleanEntityName(s) {
  return String(s || '')
    .replace(/\b(jo|ye|ya|the|please|ko|ka|ki|ke|se|sy|karo|kro|kar do|delete|remove|add|create|banao)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * @param {string} raw
 * @param {{ awaitingPersonPick?: boolean }} opts
 */
export function parseVoicePersonPickResponse(raw, pendingIntent) {
  if (!pendingIntent?.awaitingPersonPick || !pendingIntent.personCandidates?.length) return null;
  const picked = parseVoicePersonChoice(raw, pendingIntent.personCandidates);
  if (!picked) return null;
  return {
    ...pendingIntent,
    personId: picked.id,
    personName: picked.full_name,
    awaitingPersonPick: false,
    personCandidates: null,
  };
}
