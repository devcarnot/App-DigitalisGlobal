/**
 * Server-side OpenAI voice stack. Whisper (speech-to-text) + ChatGPT (intent parsing).
 */

import { ERP_VOICE_NAV_TARGETS } from './erp-voice-intents';

const ALLOWED_TYPES = new Set([
  'navigate',
  'search',
  'create_task',
  'create_project',
  'create_announcement',
  'create_note',
  'create_client',
  'create_meeting',
  'open_project',
  'open_dm',
  'attendance_in',
  'attendance_out',
  'attendance_break_start',
  'attendance_break_end',
  'confirm',
  'cancel',
  'help',
  'unknown',
  'delete_project',
  'delete_task',
  'delete_client',
  'delete_note',
  'delete_announcement',
  'add_project_members',
  'assign_task',
  'change_user_role',
  'change_member_team',
  'invite_user',
  'restore_project',
  'restore_trash_item',
  'approve_leave',
  'reject_leave',
  'approve_remote',
  'reject_remote',
  'apply_leave',
  'apply_remote',
  'cancel_leave_request',
  'cancel_remote_request',
  'send_dm',
  'send_project_message',
  'grant_user_access',
  'remove_project_member',
  'remove_workspace_user',
  'complete_task',
  'cancel_meeting',
  'reinvite_user',
]);

const NAV_MODULES = [...new Set(ERP_VOICE_NAV_TARGETS.map((t) => t.module))];
const ROLE_KEYS = ['admin', 'team_lead', 'team_member', 'client', 'hr', 'bd'];
const MEMBER_TEAMS = ['developer', 'marketing', 'graphic_designer', 'bd'];

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

function openAiNotConfigured() {
  return { error: 'OpenAI is not configured. Set OPENAI_API_KEY.', status: 503 };
}

/**
 * @param {'command' | 'confirm' | 'person_pick'} mode
 */
function buildSystemPrompt(mode = 'command') {
  const pages = ERP_VOICE_NAV_TARGETS.map((t) => `${t.module} → ${t.label} (${t.href})`).join('\n');

  let modeRules = '';
  if (mode === 'confirm') {
    modeRules = `
MODE: confirm/cancel only.
User is answering yes/no for a pending ERP action.
Return ONLY { type: "confirm" | "cancel", messageEn }.
Roman Urdu: haan/han/jee/theek hai/kar do → confirm. nahi/nhi/mat/ruko → cancel.`;
  } else if (mode === 'person_pick') {
    modeRules = `
MODE: person_pick only.
User is choosing one person from personCandidates in the user JSON.
Return ONLY { type: "person_picked", selectedIndex: 1-based number, messageEn }.
Match number ("1", "2"), team subtitle ("developer", "marketing"), or spoken name.`;
  }

  return `You parse voice commands for a Digitalis ERP workspace. Users speak Roman Urdu, Urdu, Hindi, or English.

Return ONLY valid JSON. Never wrap in markdown. Never invent user IDs.
${modeRules}

Rules:
- If user only wants DELETE, type must be delete_*: never create_project/create_task together.
- "jo project bana hua isko delete" → delete_project (extract project name).
- Roman Urdu: krdo/kardo = do it, elaan = announcement, paigham = message, hazri = attendance, chutti = leave.
- help = user asks what you can do.
- unknown = gibberish or unsupported (file upload not supported).
- messageEn = short English confirmation question or reply.

Intent types: ${[...ALLOWED_TYPES].join(', ')}, person_picked (person_pick mode only)

Navigate modules (use module key): ${NAV_MODULES.join(', ')}
Pages:
${pages}

Roles (targetRole): ${ROLE_KEYS.join(', ')}
Member teams (targetMemberTeam): ${MEMBER_TEAMS.join(', ')}

Fields by type (include only when relevant):
- navigate: module
- search: query
- create_project: title, memberNames[]
- create_task: title, projectName, assigneeNames[]
- create_announcement: title, body
- create_note: title, body
- create_client: title (company name)
- create_meeting: title, scheduledAt (ISO 8601), memberNames[] (attendees)
- open_project: projectName
- open_dm: personName
- send_dm: personName, body
- send_project_message: projectName, body
- delete_* / restore_* / approve_* / reject_* / apply_* / complete_task / cancel_meeting / reinvite_user / remove_*: use fields from prior examples

Examples:
"ali ko hello message bhejo" → send_dm
"ali se chat karo" → open_dm
"project test banao" → create_project
"jo project test bana hua delete kar do" → delete_project
"projects dikhao" → navigate module projects
"hazri lagao" → attendance_in`;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 12);
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} transcript
 * @returns {object | null}
 */
export function sanitizeOpenAiVoiceIntent(raw, transcript) {
  if (!raw || typeof raw !== 'object') return null;

  const type = String(raw.type || '').trim();
  if (!ALLOWED_TYPES.has(type)) return null;

  /** @type {Record<string, unknown>} */
  const intent = {
    type,
    raw: transcript,
    messageEn: String(raw.messageEn || '').trim() || 'Please confirm this action.',
  };

  const copy = (key) => {
    const v = raw[key];
    if (v == null || v === '') return;
    intent[key] = typeof v === 'string' ? v.trim() : v;
  };

  [
    'href',
    'label',
    'module',
    'query',
    'title',
    'body',
    'scheduledAt',
    'startDate',
    'endDate',
    'leaveType',
    'moduleKey',
    'email',
    'targetRole',
    'targetMemberTeam',
    'personName',
    'projectName',
  ].forEach(copy);

  if (raw.dayCount != null && Number.isFinite(Number(raw.dayCount))) {
    intent.dayCount = Number(raw.dayCount);
  }

  const memberNames = asStringArray(raw.memberNames);
  if (memberNames.length) intent.memberNames = memberNames;

  const assigneeNames = asStringArray(raw.assigneeNames);
  if (assigneeNames.length) intent.assigneeNames = assigneeNames;

  if (raw.grants && typeof raw.grants === 'object') {
    /** @type {Record<string, boolean>} */
    const grants = {};
    for (const action of ['view', 'create', 'edit', 'delete']) {
      if (typeof raw.grants[action] === 'boolean') grants[action] = raw.grants[action];
    }
    if (Object.keys(grants).length) intent.grants = grants;
  }

  if (type === 'navigate' && intent.module) {
    const mod = String(intent.module);
    const target = ERP_VOICE_NAV_TARGETS.find((t) => t.module === mod);
    if (target) {
      intent.href = target.href;
      intent.label = target.label;
      intent.module = target.module;
    } else {
      return null;
    }
  }

  if (type === 'change_user_role' && intent.targetRole && !ROLE_KEYS.includes(String(intent.targetRole))) {
    return null;
  }

  if (
    type === 'change_member_team' &&
    intent.targetMemberTeam &&
    !MEMBER_TEAMS.includes(String(intent.targetMemberTeam))
  ) {
    return null;
  }

  return intent;
}

/**
 * @param {object} parsed
 * @param {string} transcript
 * @param {object | null | undefined} pendingIntent
 */
function finalizeVoiceIntentFromOpenAi(parsed, transcript, pendingIntent) {
  if (pendingIntent?.awaitingPersonPick && pendingIntent.personCandidates?.length) {
    const idx = Number(parsed?.selectedIndex);
    if (Number.isFinite(idx) && idx >= 1 && idx <= pendingIntent.personCandidates.length) {
      const picked = pendingIntent.personCandidates[idx - 1];
      const resumeIntent = {
        ...pendingIntent,
        personId: picked.id,
        personName: picked.full_name,
        awaitingPersonPick: false,
        personCandidates: null,
      };
      delete resumeIntent.personQuery;
      return {
        type: 'person_picked',
        resumeIntent,
        raw: transcript,
        messageEn: String(parsed.messageEn || `Selected ${picked.full_name}.`),
      };
    }
    return {
      type: 'unknown',
      raw: transcript,
      messageEn: 'Pick a person: say the number (1, 2…) or team name (developer, marketing).',
    };
  }

  return sanitizeOpenAiVoiceIntent(parsed, transcript);
}

/**
 * @param {object} opts
 * @param {string} opts.transcript
 * @param {boolean} [opts.awaitingConfirm]
 * @param {object | null} [opts.pendingIntent]
 */
export async function parseVoiceTranscriptWithOpenAi({ transcript, awaitingConfirm = false, pendingIntent = null }) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return openAiNotConfigured();

  const model = process.env.OPENAI_VOICE_MODEL?.trim() || 'gpt-4o-mini';
  const today = new Date().toISOString().slice(0, 10);

  let mode = 'command';
  if (pendingIntent?.awaitingPersonPick) mode = 'person_pick';
  else if (awaitingConfirm) mode = 'confirm';

  const userPayload = {
    transcript,
    today,
    mode,
    awaitingConfirm,
    pendingType: pendingIntent?.type || null,
    pendingMessageEn: pendingIntent?.messageEn || null,
    personCandidates: pendingIntent?.personCandidates || null,
    personQuery: pendingIntent?.personQuery || null,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(mode) },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI request failed (${res.status})`;
    return { error: msg, status: 502 };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    return { error: 'Empty response from OpenAI', status: 502 };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { error: 'Invalid JSON from OpenAI', status: 502 };
  }

  const intent = finalizeVoiceIntentFromOpenAi(parsed, transcript, pendingIntent);
  if (!intent) {
    return { error: 'Could not parse a valid intent', status: 502 };
  }

  return { intent, source: 'openai' };
}

/**
 * @param {Buffer | ArrayBuffer | Uint8Array} audioBuffer
 * @param {string} [filename]
 * @param {string} [mimeType]
 */
export async function transcribeVoiceAudioWithWhisper(audioBuffer, filename = 'voice.webm', mimeType = 'audio/webm') {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return openAiNotConfigured();

  const model = process.env.OPENAI_WHISPER_MODEL?.trim() || 'whisper-1';
  const bytes = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer);

  if (bytes.length < 100) {
    return { error: 'Audio too short. Speak longer and try again.', status: 400 };
  }

  if (bytes.length > 25 * 1024 * 1024) {
    return { error: 'Audio too long (max 25 MB).', status: 400 };
  }

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), filename);
  form.append('model', model);
  form.append('prompt', 'Roman Urdu, Urdu, Hindi, and English mixed ERP workspace voice commands.');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Whisper request failed (${res.status})`;
    return { error: msg, status: 502 };
  }

  const transcript = String(data.text || '').trim();
  if (!transcript) {
    return { error: 'No speech detected in recording.', status: 400 };
  }

  return { transcript, source: 'whisper' };
}

/**
 * Whisper + ChatGPT in one server call.
 * @param {object} opts
 * @param {Buffer} opts.audioBuffer
 * @param {string} [opts.filename]
 * @param {string} [opts.mimeType]
 * @param {boolean} [opts.awaitingConfirm]
 * @param {object | null} [opts.pendingIntent]
 */
export async function understandVoiceAudioWithOpenAi({
  audioBuffer,
  filename = 'voice.webm',
  mimeType = 'audio/webm',
  awaitingConfirm = false,
  pendingIntent = null,
}) {
  const transcribed = await transcribeVoiceAudioWithWhisper(audioBuffer, filename, mimeType);
  if ('error' in transcribed) return transcribed;

  const parsed = await parseVoiceTranscriptWithOpenAi({
    transcript: transcribed.transcript,
    awaitingConfirm,
    pendingIntent,
  });
  if ('error' in parsed) return parsed;

  return {
    transcript: transcribed.transcript,
    intent: parsed.intent,
    source: 'openai',
  };
}
