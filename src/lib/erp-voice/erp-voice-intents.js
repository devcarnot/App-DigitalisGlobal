/**
 * Parse Roman Urdu / English voice transcripts into structured ERP intents.
 */

import {
  extractProjectTitle,
  extractVoiceMemberNames,
  extractDeleteProjectTarget,
  isDeleteIntent,
  isExplicitCreateIntent,
  normalizeTranscript,
  preprocessVoiceTranscript,
} from './erp-voice-intents-shared';
import {
  detectVoiceFeature,
  extractAnnouncementContent,
  extractNoteContent,
  isAnnouncementVoiceCommand,
  isNoteVoiceCommand,
  isProjectVoiceCommand,
} from './erp-voice-features';
import { parseVoiceWorkflow } from './erp-voice-workflow';
import { matchAdminAndFeatureActions, parseVoicePersonPickResponse } from './erp-voice-action-intents';
import { ROMAN_CANCEL, ROMAN_CONFIRM } from './erp-voice-roman-urdu';

export { extractVoiceMemberNames } from './erp-voice-intents-shared';

/** @typedef {'navigate' | 'search' | 'create_task' | 'create_project' | 'create_announcement' | 'create_note' | 'create_client' | 'create_meeting' | 'open_project' | 'open_dm' | 'attendance_in' | 'attendance_out' | 'attendance_break_start' | 'attendance_break_end' | 'confirm' | 'cancel' | 'person_picked' | 'help' | 'unknown' | 'workflow' | 'delete_project' | 'delete_task' | 'delete_client' | 'delete_note' | 'delete_announcement' | 'add_project_members' | 'assign_task' | 'change_user_role' | 'change_member_team' | 'invite_user' | 'restore_project' | 'restore_trash_item' | 'approve_leave' | 'reject_leave' | 'approve_remote' | 'reject_remote' | 'apply_leave' | 'apply_remote' | 'cancel_leave_request' | 'cancel_remote_request' | 'send_dm' | 'send_project_message' | 'grant_user_access' | 'remove_project_member' | 'remove_workspace_user' | 'complete_task' | 'cancel_meeting' | 'reinvite_user'} ErpVoiceIntentType */

/**
 * @typedef {object} ErpVoiceIntent
 * @property {ErpVoiceIntentType} type
 * @property {string} [href]
 * @property {string} [label]
 * @property {string} [module]
 * @property {string} [query]
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [scheduledAt]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {number} [dayCount]
 * @property {string} [leaveType]
 * @property {string} [moduleKey]
 * @property {Record<string, boolean>} [grants]
 * @property {string} [email]
 * @property {string} [targetRole]
 * @property {string} [targetMemberTeam]
 * @property {string} [personName]
 * @property {string} [personId]
 * @property {boolean} [awaitingPersonPick]
 * @property {Array<{ id: string, full_name: string, subtitle: string }>} [personCandidates]
 * @property {string} [projectName]
 * @property {string[]} [memberNames]
 * @property {string[]} [assigneeNames]
 * @property {string} [raw]
 * @property {string} [messageEn] — user-facing English summary
 */

/** @type {Array<{ module: string, href: string, label: string, aliases: string[] }>} */
export const ERP_VOICE_NAV_TARGETS = [
  { module: 'dashboard', href: '/erp/dashboard', label: 'Home', aliases: ['home', 'dashboard', 'ghar', 'main', 'home page', 'asli page', 'mera dashboard'] },
  { module: 'projects', href: '/erp/projects', label: 'Projects', aliases: ['projects', 'project', 'project list', 'sare project', 'project wala'] },
  { module: 'tasks', href: '/erp/my-tasks', label: 'My tasks', aliases: ['tasks', 'task', 'my tasks', 'my task', 'kaam', 'mere kaam', 'meray kaam', 'task list'] },
  { module: 'notes', href: '/erp/notes', label: 'Notes', aliases: ['notes', 'note', 'notepad', 'yaad dash', 'yad dash', 'cheet', 'notepad wala'] },
  { module: 'files', href: '/erp/files', label: 'Files', aliases: ['files', 'file', 'documents', 'document', 'docs', 'fails', 'file wala'] },
  { module: 'messages', href: '/erp/messages', label: 'Messages', aliases: ['messages', 'message', 'chat', 'dm', 'inbox chat', 'paigham', 'paigam', 'chat wala'] },
  { module: 'meetings', href: '/erp/meetings', label: 'Meetings', aliases: ['meetings', 'meeting', 'calendar meetings', 'mulakaat', 'meeting wala', 'calendar'] },
  {
    module: 'announcements',
    href: '/erp/announcements',
    label: 'Announcements',
    aliases: ['announcements', 'announcement', 'updates', 'news', 'elan', 'elaan', 'ilaan', 'khabar', 'update wala'],
  },
  { module: 'clients', href: '/erp/admin/clients', label: 'Clients', aliases: ['clients', 'client', 'crm', 'customer', 'client wala'] },
  { module: 'members', href: '/erp/admin/members', label: 'Members', aliases: ['members', 'member', 'team members', 'banday', 'bande', 'log', 'staff', 'team wala'] },
  { module: 'attendance', href: '/erp/attendance', label: 'Attendance', aliases: ['attendance', 'attendance page', 'hazri', 'hazri page'] },
  {
    module: 'attendance_admin',
    href: '/erp/admin/attendance',
    label: 'Attendance admin',
    aliases: ['attendance admin', 'admin attendance', 'hazri admin'],
  },
  { module: 'leave', href: '/erp/leave', label: 'Leave', aliases: ['leave', 'chutti', 'holiday leave', 'chutti page', 'chutti wala'] },
  { module: 'remote', href: '/erp/remote', label: 'Remote', aliases: ['remote', 'remote work', 'wfh', 'ghar se kaam', 'ghar se', 'remote wala'] },
  { module: 'performance', href: '/erp/admin/performance', label: 'Performance', aliases: ['performance', 'performance wala', 'kaarkardagi'] },
  { module: 'statistics', href: '/erp/admin/statistics', label: 'Statistics', aliases: ['statistics', 'stats', 'statistics wala'] },
  { module: 'finance', href: '/erp/admin/finance', label: 'Finance', aliases: ['finance', 'money', 'finance wala', 'paisa', 'accounts'] },
  { module: 'inbox', href: '/erp/inbox', label: 'Recent activity', aliases: ['inbox', 'activity', 'notifications', 'recent activity', 'activity wala'] },
  { module: 'trash', href: '/erp/admin/trash', label: 'Trash', aliases: ['trash', 'deleted', 'kachra', 'recycle', 'trash wala'] },
  { module: 'settings_roles', href: '/erp/admin/roles', label: 'Users & Roles', aliases: ['roles', 'users and roles', 'permissions', 'user roles', 'access', 'role wala', 'permission wala'] },
  { module: 'members', href: '/erp/admin/invites', label: 'Invites & users', aliases: ['invites', 'invite users', 'invite user', 'new user', 'dawat', 'invite wala'] },
  { module: 'members', href: '/erp/admin/users', label: 'Users', aliases: ['users', 'user list', 'user wala'] },
  { module: 'dashboard', href: '/erp/account', label: 'Account', aliases: ['account', 'profile', 'settings', 'mera account', 'meri profile'] },
  { module: 'dashboard', href: '/erp/search', label: 'Search', aliases: ['search page', 'global search', 'talash page', 'search wala'] },
];

function stripOpenVerbs(s) {
  return s
    .replace(/^(please\s+)?(open|go to|goto|navigate to|show|kholo|khol|jao|le jao|le chalo|chalo|dikhao|display)\s+/i, '')
    .replace(/\s+(kholo|khol|page|par jao|pe jao)$/i, '')
    .trim();
}

/**
 * @param {string} raw
 * @returns {ErpVoiceIntent | null}
 */
function matchDelete(raw) {
  if (!isDeleteIntent(raw)) return null;

  const trimmed = String(raw || '').trim();
  const target = extractDeleteProjectTarget(raw);
  if (target?.useLastCreated) {
    return {
      type: 'delete_project',
      useLastCreated: true,
      raw: trimmed,
      messageEn: 'Delete the last project you created by voice?',
    };
  }

  if (target?.projectName) {
    return {
      type: 'delete_project',
      projectName: target.projectName,
      raw: trimmed,
      messageEn: `Delete project "${target.projectName}"?`,
    };
  }

  const t = preprocessVoiceTranscript(raw);
  if (/\b(task|kaam)\b/.test(t)) {
    const patterns = [
      /(?:delete|remove|hatao|hata do|mitao|drop)\s+(?:task|kaam)\s+(.+?)(?:\s+(?:in|project|proj|mein)\s+(.+))?$/,
      /(?:task|kaam)\s+(.+?)\s+(?:delete|hatao|remove|mitao)/,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m?.[1]) {
        const taskTitle = m[1]
          .replace(/\b(task|kaam|delete|hatao)\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (taskTitle.length >= 2) {
          return {
            type: 'delete_task',
            title: taskTitle,
            projectName: m[2]?.trim(),
            raw,
            messageEn: `Delete task "${taskTitle}"?`,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Looser project-create when STT drops "project" or title words.
 * @param {string} raw
 * @returns {ErpVoiceIntent | null}
 */
function matchCreateProjectLoose(raw) {
  if (!isProjectVoiceCommand(raw)) return null;

  const t = preprocessVoiceTranscript(raw);
  const hasCreate =
    /\b(create|banao|bnao|bana|banaye|naya|new|bana do|bana de|bna do|project banao|project create|naya project)\b/.test(t);
  const hasProject = /\b(project|proj)\b/.test(t);
  const members = extractVoiceMemberNames(raw);
  const title = extractProjectTitle(raw);

  if (title) {
    return {
      type: 'create_project',
      title,
      memberNames: members,
      raw,
      messageEn: `Create project "${title}"${members.length ? ` with ${members.join(', ')}` : ''}?`,
    };
  }

  if ((hasCreate || hasProject) && members.length > 0) {
    return {
      type: 'unknown',
      raw,
      messageEn: `I heard add ${members.join(', ')} but not the project name. Say the full line with: …ke naam se…`,
    };
  }

  if (hasCreate && hasProject) {
    return {
      type: 'unknown',
      raw,
      messageEn: 'I heard create project but not the name. Say: project banao test 2 ke naam se…',
    };
  }

  return null;
}

/**
 * @param {string} raw
 * @returns {ErpVoiceIntent | null}
 */
function matchCreateAnnouncement(raw) {
  if (!isAnnouncementVoiceCommand(raw)) return null;

  const t = preprocessVoiceTranscript(raw);
  const hasMutate =
    /\b(add|create|post|publish|banao|bnao|new|naya|daalo|dalo|likho|send|bhejo|broadcast|notify|sabko)\b/.test(t);
  if (!hasMutate) return null;

  const content = extractAnnouncementContent(raw);
  if (!content) {
    return {
      type: 'unknown',
      raw,
      messageEn:
        'Say: new announcement add karo [title] message [details] aur sabko bhejo\nOr: announcement post karo Team meeting message All hands at 3pm',
    };
  }

  return {
    type: 'create_announcement',
    title: content.title,
    body: content.body,
    raw,
    messageEn: `Post announcement "${content.title}" and notify all staff?`,
  };
}

/**
 * @param {string} raw
 * @returns {ErpVoiceIntent | null}
 */
function matchCreateNote(raw) {
  if (!isNoteVoiceCommand(raw)) return null;

  const t = preprocessVoiceTranscript(raw);
  const hasMutate = /\b(add|create|banao|bnao|new|naya|likho|save|daalo|dalo)\b/.test(t);
  if (!hasMutate) return null;

  const content = extractNoteContent(raw);
  if (!content) {
    return {
      type: 'unknown',
      raw,
      messageEn: 'Say: note add karo [title] message [details]',
    };
  }

  return {
    type: 'create_note',
    title: content.title,
    body: content.body || '',
    raw,
    messageEn: `Create note "${content.title}"?`,
  };
}

/**
 * @param {string} raw
 * @returns {ErpVoiceIntent | null}
 */
function matchFeatureUnknown(raw) {
  const feature = detectVoiceFeature(raw);
  if (!feature || feature === 'project' || feature === 'task' || feature === 'attendance' || feature === 'search') {
    return null;
  }

  const hints = {
    announcement: 'Say: new announcement add karo [title] aur sabko bhejo',
    note: 'Say: note add karo [title] message [details]',
    meeting: 'Say: open meetings — or schedule from the Meetings page',
    message: 'Say: open messages',
    leave: 'Say: open leave',
  };

  return {
    type: 'unknown',
    raw,
    messageEn: hints[feature] || `Try "open ${feature}" or describe what you want to create.`,
  };
}

/**
 * @param {string} raw
 * @returns {ErpVoiceIntent | null}
 */
function matchNavigate(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (!t) return null;

  const openPatterns = [
    /^open\s+(.+)$/,
    /^go\s+to\s+(.+)$/,
    /^show\s+(.+)$/,
    /^(.+)\s+kholo$/,
    /^(.+)\s+khol$/,
    /^(.+)\s+par\s+jao$/,
    /^(.+)\s+pe\s+jao$/,
    /^(.+)\s+page$/,
  ];

  let targetPhrase = t;
  for (const re of openPatterns) {
    const m = t.match(re);
    if (m?.[1]) {
      targetPhrase = stripOpenVerbs(m[1]);
      break;
    }
  }
  targetPhrase = stripOpenVerbs(targetPhrase);

  for (const nav of ERP_VOICE_NAV_TARGETS) {
    for (const alias of nav.aliases) {
      const a = alias.toLowerCase();
      if (
        targetPhrase === a ||
        t === a ||
        t.includes(` ${a} `) ||
        t.startsWith(`${a} `) ||
        t.endsWith(` ${a}`) ||
        targetPhrase.includes(a)
      ) {
        return {
          type: 'navigate',
          href: nav.href,
          label: nav.label,
          module: nav.module,
          raw,
          messageEn: `Opening ${nav.label}.`,
        };
      }
    }
  }
  return null;
}

/**
 * @param {string} raw
 */
function matchSearch(raw) {
  const t = preprocessVoiceTranscript(raw);
  const patterns = [
    /^search\s+(?:for\s+)?(.+)$/,
    /^find\s+(?:me\s+)?(.+)$/,
    /^dhundo\s+(.+)$/,
    /^dhoondho\s+(.+)$/,
    /^dhoondh\s+(.+)$/,
    /^talash\s+(.+)$/,
    /^talaash\s+(.+)$/,
    /^khojo\s+(.+)$/,
    /^lookup\s+(.+)$/,
    /^(.+)\s+ko\s+dhundo$/,
    /^(.+)\s+ko\s+dhoondho$/,
    /^(.+)\s+search\s+karo$/,
    /^(.+)\s+ki\s+talash$/,
    /^(.+)\s+dhundho$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]?.trim()) {
      return {
        type: 'search',
        query: m[1].trim(),
        raw,
        messageEn: `Searching for "${m[1].trim()}".`,
      };
    }
  }
  return null;
}

/**
 * @param {string} raw
 */
function matchCreateTask(raw) {
  const t = preprocessVoiceTranscript(raw);
  const patterns = [
    /(?:create|add|banao|bnao|banao|new|naya)\s+task\s+(?:named|called|title)?\s*(.+?)\s+(?:in|inside|project|proj)\s+(.+?)(?:\s+(?:assign|add|ko assign)\s+(.+))?$/,
    /task\s+(?:banao|bnao|banao|create|add)\s+(.+?)\s+(?:project|proj)\s+(.+?)(?:\s+(?:assign|add|ko assign)\s+(.+))?$/,
    /(.+?)\s+ka\s+task\s+(?:banao|bnao|banao)\s+(?:project|proj)\s+(.+?)(?:\s+(?:assign|add)\s+(.+))?$/,
    /(?:create|add)\s+task\s+(.+?)\s+in\s+project\s+(.+?)(?:\s+assign\s+(.+))?$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1] && m?.[2]) {
      const assignRaw = m[3]?.trim();
      const assigneeNames = assignRaw
        ? assignRaw.split(/\s+(?:and|aur|,)\s+/).map((s) => s.replace(/^(to|ko)\s+/i, '').trim()).filter(Boolean)
        : [];
      return {
        type: 'create_task',
        title: m[1].trim(),
        projectName: m[2].trim(),
        assigneeNames,
        raw,
        messageEn: `Create task "${m[1].trim()}" in project "${m[2].trim()}"${assigneeNames.length ? ` for ${assigneeNames.join(', ')}` : ''}?`,
      };
    }
  }
  return null;
}

/**
 * @param {string} raw
 */
function matchCreateProject(raw) {
  const title = extractProjectTitle(raw);
  if (!title) return null;

  const memberNames = extractVoiceMemberNames(raw);
  return {
    type: 'create_project',
    title,
    memberNames,
    raw,
    messageEn: `Create project "${title}"${memberNames.length ? ` with ${memberNames.join(', ')}` : ''}?`,
  };
}

/**
 * @param {string} raw
 */
function matchOpenProject(raw) {
  const t = preprocessVoiceTranscript(raw);
  const patterns = [
    /^open\s+project\s+(.+)$/,
    /^project\s+(.+)\s+kholo$/,
    /^(.+)\s+project\s+kholo$/,
    /^(.+)\s+project\s+(?:par jao|pe jao|dikhao|open karo)$/,
    /^go\s+to\s+project\s+(.+)$/,
    /^(.+)\s+wala\s+project\s+kholo$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]?.trim()) {
      return {
        type: 'open_project',
        projectName: m[1].trim(),
        raw,
        messageEn: `Opening project "${m[1].trim()}".`,
      };
    }
  }
  return null;
}

/**
 * @param {string} raw
 */
function matchAttendance(raw) {
  const t = preprocessVoiceTranscript(raw);
  if (
    /\b(check in|checkin|check-in|clock in|mark in|attendance in|present lagao|check in karo|check in kar do|hazri lagao|hazri laga do|time in|aao office|office aaya)\b/.test(t)
  ) {
    return { type: 'attendance_in', raw, messageEn: 'Marking attendance check-in.' };
  }
  if (
    /\b(check out|checkout|check-out|clock out|mark out|attendance out|check out karo|check out kar do|time out|ja raha hun|office ja raha)\b/.test(t)
  ) {
    return { type: 'attendance_out', raw, messageEn: 'Marking attendance check-out.' };
  }
  return null;
}

/**
 * @param {string} raw
 * @param {{ awaitingConfirm?: boolean }} [opts]
 */
function matchConfirmCancel(raw, opts = {}) {
  const t = normalizeTranscript(raw);
  const trimmed = String(raw || '').trim();

  const strictConfirm = ROMAN_CONFIRM.test(t);
  const looseConfirm =
    opts.awaitingConfirm &&
    (/\b(yes|haan|han|ha|ok|okay|theek|thik|confirm|bilkul|theek hai|thik hai|kar do|kardo|krdo|jee|sahi hai)\b/.test(t) ||
      /^(ha+|han+|haan|jee)\b/.test(t));

  if (strictConfirm || looseConfirm) {
    return { type: 'confirm', raw: trimmed, messageEn: 'Confirmed.' };
  }

  if (ROMAN_CANCEL.test(t)) {
    return { type: 'cancel', raw: trimmed, messageEn: 'Cancelled.' };
  }

  if (opts.awaitingConfirm && /\b(no|nahi|nah|nhi|cancel|mat|ruko|rehne do)\b/.test(t) && t.length < 40) {
    return { type: 'cancel', raw: trimmed, messageEn: 'Cancelled.' };
  }

  return null;
}

/**
 * @param {string} raw
 * @param {{ awaitingConfirm?: boolean }} [opts]
 * @returns {ErpVoiceIntent}
 */
export function parseVoiceTranscript(raw, opts = {}) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { type: 'unknown', raw, messageEn: 'I did not catch that. Try again.' };
  }

  if (opts.pendingIntent?.awaitingPersonPick) {
    const picked = parseVoicePersonPickResponse(trimmed, opts.pendingIntent);
    if (picked) {
      return { type: 'person_picked', raw: trimmed, resumeIntent: picked, messageEn: picked.messageEn };
    }
    return {
      type: 'unknown',
      raw: trimmed,
      messageEn: 'Pick a person: say the number (1, 2…) or team name (developer, marketing).',
    };
  }

  const t = normalizeTranscript(trimmed);
  if (/^(help|madad|commands|kya kar sakte ho|kya kar sakta hai|what can you do|madad chahiye)$/.test(t)) {
    return {
      type: 'help',
      raw: trimmed,
      messageEn:
        'Roman Urdu examples:\n• ali ko message hello bhejo · ali se chat karo\n• meeting schedule karo standup kal 3 baje · meeting standup cancel karo\n• chutti apply karo kal se 2 din · meri chutti cancel karo · hazri lagao · break shuru karo\n• ali ko team lead banao · ali ko meetings access do · ali ko wapas invite karo\n• project test 2 mein message update bhejo · task logo design complete karo\n• elaan add karo test aur sabko bhejo · client add karo Acme\n• projects dikhao · chutti page kholo · approve leave ali · reject remote ali',
    };
  }

  const confirmCancel = matchConfirmCancel(trimmed, opts);
  if (confirmCancel) return confirmCancel;

  const attendance = matchAttendance(trimmed);
  if (attendance) return attendance;

  const adminAction = matchAdminAndFeatureActions(trimmed);
  if (adminAction) return adminAction;

  const createAnnouncement = matchCreateAnnouncement(trimmed);
  if (createAnnouncement) return createAnnouncement;

  const createNote = matchCreateNote(trimmed);
  if (createNote) return createNote;

  const workflow = parseVoiceWorkflow(trimmed);
  if (workflow) return workflow;

  const deleteIntent = matchDelete(trimmed);
  if (deleteIntent) return deleteIntent;

  const createTask = matchCreateTask(trimmed);
  if (createTask) return createTask;

  const createProject = matchCreateProject(trimmed);
  if (createProject) return createProject;

  const createProjectLoose = matchCreateProjectLoose(trimmed);
  if (createProjectLoose) return createProjectLoose;

  const openProject = matchOpenProject(trimmed);
  if (openProject) return openProject;

  const search = matchSearch(trimmed);
  if (search) return search;

  const navigate = matchNavigate(trimmed);
  if (navigate) return navigate;

  const featureUnknown = matchFeatureUnknown(trimmed);
  if (featureUnknown) return featureUnknown;

  return {
    type: 'unknown',
    raw: trimmed,
    messageEn: opts.awaitingConfirm
      ? `Say "yes" or tap Yes to confirm. Say "no" or tap No to cancel.`
      : `Samjha nahi. Roman Urdu ya English mein dubara bolein — jaise: "ali ko message hello bhejo" ya "projects dikhao".`,
  };
}

/**
 * Intents that need yes/no confirmation before executing.
 * @param {ErpVoiceIntent} intent
 */
export function voiceIntentNeedsConfirm(intent) {
  if (intent?.type === 'workflow') return true;
  return (
    intent?.type === 'create_task' ||
    intent?.type === 'create_project' ||
    intent?.type === 'create_announcement' ||
    intent?.type === 'create_note' ||
    intent?.type === 'create_client' ||
    intent?.type === 'create_meeting' ||
    intent?.type === 'send_dm' ||
    intent?.type === 'add_project_members' ||
    intent?.type === 'send_project_message' ||
    intent?.type === 'apply_leave' ||
    intent?.type === 'apply_remote' ||
    intent?.type === 'grant_user_access' ||
    intent?.type === 'remove_project_member' ||
    intent?.type === 'remove_workspace_user' ||
    intent?.type === 'delete_announcement' ||
    intent?.type === 'restore_trash_item' ||
    intent?.type === 'change_user_role' ||
    intent?.type === 'change_member_team' ||
    intent?.type === 'invite_user' ||
    intent?.type === 'restore_project' ||
    intent?.type === 'approve_leave' ||
    intent?.type === 'reject_leave' ||
    intent?.type === 'approve_remote' ||
    intent?.type === 'reject_remote' ||
    intent?.type === 'delete_client' ||
    intent?.type === 'delete_note' ||
    intent?.type === 'delete_project' ||
    intent?.type === 'delete_task' ||
    intent?.type === 'complete_task' ||
    intent?.type === 'cancel_meeting' ||
    intent?.type === 'cancel_leave_request' ||
    intent?.type === 'cancel_remote_request' ||
    intent?.type === 'open_dm' ||
    intent?.type === 'reinvite_user' ||
    intent?.type === 'attendance_break_start' ||
    intent?.type === 'attendance_break_end' ||
    intent?.type === 'assign_task'
  );
}
