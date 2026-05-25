/**
 * Additional voice parsers: messages, meetings, leave/remote apply, permissions, trash, etc.
 */

import { preprocessVoiceTranscript } from './erp-voice-intents-shared';
import { parseVoiceDateRange, parseVoiceDateTime } from './erp-voice-datetime';

const MODULE_VOICE = /** @type {Record<string, RegExp>} */ ({
  dashboard: /\b(dashboard|home)\b/,
  projects: /\b(projects?|proj)\b/,
  tasks: /\b(tasks?|kaam)\b/,
  notes: /\b(notes?|notepad)\b/,
  files: /\b(files?|documents?)\b/,
  messages: /\b(messages?|chat|dm)\b/,
  clients: /\b(clients?|crm)\b/,
  meetings: /\b(meetings?|calendar)\b/,
  announcements: /\b(announcements?|updates?)\b/,
  members: /\b(members?|roster)\b/,
  attendance: /\b(attendance)\b/,
  attendance_admin: /\b(attendance admin)\b/,
  leave: /\b(leave|chutti)\b/,
  remote: /\b(remote|wfh)\b/,
  performance: /\b(performance)\b/,
  statistics: /\b(statistics|stats)\b/,
  finance: /\b(finance|money)\b/,
  inbox: /\b(inbox|activity)\b/,
  trash: /\b(trash)\b/,
  settings_roles: /\b(roles?|permissions?|access control)\b/,
});

/**
 * @param {string} phrase
 */
function parseModuleFromVoice(phrase) {
  const t = preprocessVoiceTranscript(phrase);
  const entries = Object.entries(MODULE_VOICE).sort((a, b) => b[1].source.length - a[1].source.length);
  for (const [mod, re] of entries) {
    if (re.test(t)) return mod;
  }
  return null;
}

/**
 * @param {string} phrase
 */
function parseAccessGrants(phrase) {
  const t = preprocessVoiceTranscript(phrase);
  if (/\b(full access|poora access|sara access|all access|sab access)\b/.test(t)) {
    return { view: true, create: true, edit: true, delete: true };
  }
  if (/\b(delete access|delete permission)\b/.test(t)) {
    return { view: true, create: false, edit: false, delete: true };
  }
  if (/\b(edit access|edit permission)\b/.test(t)) {
    return { view: true, create: false, edit: true, delete: false };
  }
  if (/\b(create access|create permission)\b/.test(t)) {
    return { view: true, create: true, edit: false, delete: false };
  }
  if (/\b(view access|view permission|dekh|dikha)\b/.test(t)) {
    return { view: true, create: false, edit: false, delete: false };
  }
  return { view: true, create: true, edit: true, delete: false };
}

/** @param {string} raw */
export function matchSendDm(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(message|messages|dm|bhejo|bhej do|send)\b/.test(t)) return null;
  if (/\b(project|proj|announcement|meeting schedule)\b/.test(t)) return null;

  const patterns = [
    /(?:message|dm)\s+(.+?)\s+ko\s+(.+)/,
    /(.+?)\s+ko\s+(?:message|dm)\s+(.+)/,
    /(?:send|bhejo|bhej do)\s+(?:message|dm)\s+(?:to\s+)?(.+?)\s+(.+)/,
    /(.+?)\s+ko\s+(.+?)\s+(?:bhejo|bhej do|send karo|send)/,
    /(?:message|dm)\s+(?:to\s+)?(.+?)\s+(?:message|matlab|text|ke\s+)?(.+)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const personName = cleanPerson(m[1]);
    const body = cleanMessageBody(m[2]);
    if (personName.length >= 2 && body.length >= 1) {
      return {
        type: 'send_dm',
        personName,
        body,
        raw,
        messageEn: `Send message to ${personName}: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"?`,
      };
    }
  }
  return null;
}

/** @param {string} raw */
export function matchSendProjectMessage(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(message|msg|bhejo|send)\b/.test(t)) return null;
  if (!/\b(project|proj)\b/.test(t)) return null;

  const patterns = [
    /(?:project|proj)\s+(.+?)\s+(?:mein|in|par|pe)\s+(?:message|msg)\s+(.+)/,
    /(?:message|msg)\s+(?:bhejo|send)\s+(?:project|proj)\s+(.+?)\s+(?:mein|in)\s+(.+)/,
    /(.+?)\s+(?:project|proj)\s+(?:mein|in)\s+(?:message|msg)\s+(.+)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const projectName = cleanEntity(m[1]);
    const body = cleanMessageBody(m[2]);
    if (projectName.length >= 2 && body.length >= 1) {
      return {
        type: 'send_project_message',
        projectName,
        body,
        raw,
        messageEn: `Send message in project "${projectName}": "${body.slice(0, 60)}…"?`,
      };
    }
  }
  return null;
}

/** @param {string} raw */
export function matchCreateMeeting(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(meeting|meetings|schedule|calendar)\b/.test(t)) return null;
  if (!/\b(schedule|banao|create|add|set|fix|rakh|book)\b/.test(t)) return null;
  if (/\b(open|kholo|show)\b/.test(t) && !/\b(schedule|create|banao)\b/.test(t)) return null;

  const scheduledAt = parseVoiceDateTime(t);
  if (!scheduledAt) return null;

  let title = 'Meeting';
  const titlePatterns = [
    /(?:meeting|schedule)\s+(?:karo|banao|create|add)\s+(.+?)(?:\s+(?:kal|aaj|tomorrow|today|\d|\bat\b))/,
    /(?:meeting|schedule)\s+(.+?)\s+(?:kal|aaj|tomorrow|today|\d|at)/,
    /(.+?)\s+meeting\s+(?:schedule|banao|kal|aaj)/,
  ];
  for (const re of titlePatterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const cleaned = cleanEntity(m[1]).replace(/\b(meeting|schedule|karo|banao)\b/gi, ' ').trim();
      if (cleaned.length >= 2) {
        title = cleaned.slice(0, 120);
        break;
      }
    }
  }

  const memberNames = [];
  const inviteRe = /([a-z][a-z0-9\s]*?)\s+ko\s+(?:invite|bulao|add|shamil)/gi;
  let im;
  while ((im = inviteRe.exec(t)) !== null) {
    const n = cleanPerson(im[1]);
    if (n.length >= 2) memberNames.push(n);
  }

  return {
    type: 'create_meeting',
    title,
    scheduledAt,
    memberNames,
    raw,
    messageEn: `Schedule meeting "${title}"${memberNames.length ? ` with ${memberNames.join(', ')}` : ''}?`,
  };
}

/** @param {string} raw */
export function matchApplyLeave(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(leave|chutti|time off)\b/.test(t)) return null;
  if (/\b(approve|reject|manzoor|mana)\b/.test(t)) return null;
  if (!/\b(apply|request|chahiye|laga do|le lo|apply karo|apply kar do)\b/.test(t)) return null;

  let range = parseVoiceDateRange(t);
  if (!range) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const fmt = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    range = { startDate: fmt, endDate: fmt, dayCount: 1 };
  }

  return {
    type: 'apply_leave',
    startDate: range.startDate,
    endDate: range.endDate,
    dayCount: range.dayCount,
    leaveType: /\b(medical|doctor|sick)\b/.test(t) ? 'medical' : 'regular',
    raw,
    messageEn: `Apply ${range.dayCount}-day leave from ${range.startDate} to ${range.endDate}?`,
  };
}

/** @param {string} raw */
export function matchApplyRemote(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(remote|wfh|work from home|ghar se kaam)\b/.test(t)) return null;
  if (/\b(approve|reject|manzoor|mana)\b/.test(t)) return null;
  if (!/\b(apply|request|chahiye|laga do|apply karo|apply kar do)\b/.test(t)) return null;

  let range = parseVoiceDateRange(t);
  if (!range) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const fmt = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    range = { startDate: fmt, endDate: fmt, dayCount: 1 };
  }

  return {
    type: 'apply_remote',
    startDate: range.startDate,
    endDate: range.endDate,
    dayCount: range.dayCount,
    raw,
    messageEn: `Apply remote work ${range.startDate} to ${range.endDate}?`,
  };
}

/** @param {string} raw */
export function matchGrantUserAccess(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(access|permission|permissions|grants?|allow|ijazat)\b/.test(t)) return null;
  if (/\b(open|kholo)\b/.test(t) && !/\b(give|do|de|karo)\b/.test(t)) return null;

  const patterns = [
    /(.+?)\s+ko\s+(.+?)\s+(?:access|permission|permissions|ijazat)\s+(?:do|de|karo|dy do|de do)/,
    /(?:give|grant)\s+(.+?)\s+(?:access to|permission for|permissions for)\s+(.+)/,
    /(.+?)\s+ko\s+(.+?)\s+(?:module|page)\s+(?:access|permission)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const personName = cleanPerson(m[1]);
    const moduleKey = parseModuleFromVoice(m[2]);
    const grants = parseAccessGrants(m[2]);
    if (!personName || !moduleKey) continue;
    return {
      type: 'grant_user_access',
      personName,
      moduleKey,
      grants,
      raw,
      messageEn: `Grant ${personName} access to ${moduleKey.replace(/_/g, ' ')}?`,
    };
  }
  return null;
}

/** @param {string} raw */
export function matchDeleteAnnouncement(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(announcement|announcements|update)\b/.test(t)) return null;
  if (!/\b(delete|remove|hatao|mitao)\b/.test(t)) return null;

  const patterns = [
    /(?:delete|remove|hatao|mitao)\s+(?:announcement|update)\s+(.+)/,
    /(?:announcement|update)\s+(.+?)\s+(?:delete|remove|hatao|mitao)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const title = cleanEntity(m[1]);
    if (title.length >= 2) {
      return {
        type: 'delete_announcement',
        title,
        raw,
        messageEn: `Delete announcement "${title}"?`,
      };
    }
  }
  return null;
}

/** @param {string} raw */
export function matchRestoreTrashItem(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(restore|recover|wapas|undo)\b/.test(t)) return null;
  if (/\b(project|proj)\b/.test(t)) return null;

  const patterns = [
    /restore\s+(?:file|document|item|trash)\s+(.+)/,
    /(?:file|document|item)\s+(.+?)\s+restore/,
    /trash\s+(?:se|sy|from)\s+(.+?)\s+restore/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const name = cleanEntity(m[1]);
    if (name.length >= 2) {
      return {
        type: 'restore_trash_item',
        title: name,
        raw,
        messageEn: `Restore "${name}" from trash?`,
      };
    }
  }
  return null;
}

/** @param {string} raw */
export function matchRemoveProjectMember(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(remove|hatao|hata do|nikalo|delete)\b/.test(t)) return null;
  if (!/\b(project|proj|member|se|sy)\b/.test(t)) return null;

  const patterns = [
    /(.+?)\s+ko\s+(?:project|proj)\s+(.+?)\s+(?:se|sy|from)\s+(?:hatao|remove|nikalo|delete)/,
    /(?:remove|hatao|nikalo)\s+(.+?)\s+(?:from|project|proj)\s+(.+)/,
    /(?:project|proj)\s+(.+?)\s+(?:se|sy)\s+(.+?)\s+(?:ko\s+)?(?:hatao|remove|nikalo)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    let personName;
    let projectName;
    if (/project|proj/.test(m[0]) && /ko/.test(m[0])) {
      personName = cleanPerson(m[1]);
      projectName = cleanEntity(m[2]);
    } else if (/project|proj/.test(m[1])) {
      projectName = cleanEntity(m[1]);
      personName = cleanPerson(m[2]);
    } else {
      personName = cleanPerson(m[1]);
      projectName = cleanEntity(m[2]);
    }
    if (personName.length >= 2 && projectName.length >= 2) {
      return {
        type: 'remove_project_member',
        personName,
        projectName,
        raw,
        messageEn: `Remove ${personName} from project "${projectName}"?`,
      };
    }
  }
  return null;
}

/** @param {string} raw */
export function matchRemoveWorkspaceUser(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!/\b(remove|delete|hatao|nikalo)\b/.test(t)) return null;
  if (!/\b(user|member|workspace|system)\b/.test(t)) return null;
  if (/\b(project|proj|note|client|task)\b/.test(t)) return null;

  const patterns = [
    /(?:remove|delete|hatao)\s+(?:user|member)\s+(.+)/,
    /(.+?)\s+(?:user|member)\s+(?:remove|delete|hatao|nikalo)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const personName = cleanPerson(m[1]);
    if (personName.length >= 2) {
      return {
        type: 'remove_workspace_user',
        personName,
        raw,
        messageEn: `Remove user ${personName} from workspace?`,
      };
    }
  }
  return null;
}

/**
 * @param {string} raw
 */
export function matchExtraFeatureActions(raw) {
  return (
    matchSendDm(raw) ||
    matchSendProjectMessage(raw) ||
    matchCreateMeeting(raw) ||
    matchApplyLeave(raw) ||
    matchApplyRemote(raw) ||
    matchGrantUserAccess(raw) ||
    matchDeleteAnnouncement(raw) ||
    matchRestoreTrashItem(raw) ||
    matchRemoveProjectMember(raw) ||
    matchRemoveWorkspaceUser(raw)
  );
}

function cleanPerson(s) {
  return String(s || '')
    .replace(/\b(jo|ye|ya|us|is|the|please|user|member|ko|ka|ki|ke|se|sy|message|dm|send|bhejo)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function cleanEntity(s) {
  return String(s || '')
    .replace(/\b(jo|ye|ya|the|please|ko|ka|ki|ke|se|sy|karo|project|proj|message|mein|in)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function cleanMessageBody(s) {
  return String(s || '')
    .replace(/\b(karo|kro|krdo|kardo|kar do|do|de|send|bhejo|bhej do|message|dm|matlab|text)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}
