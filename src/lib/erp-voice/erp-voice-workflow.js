/**
 * Multi-step voice workflows — one command, several actions in order.
 */

import {
  extractVoiceMemberNames,
  preprocessVoiceTranscript,
  extractProjectTitle,
  cleanProjectTitle,
  extractDeleteProjectTarget,
  isDeleteIntent,
  isExplicitCreateIntent,
  isValidEntityName,
  sanitizeProjectName,
} from './erp-voice-intents-shared';
import { isAnnouncementVoiceCommand, isNoteVoiceCommand } from './erp-voice-features';

/** @typedef {'create_project' | 'add_project_members' | 'create_task' | 'assign_task' | 'delete_project' | 'delete_task'} VoiceWorkflowStepType */

/**
 * @typedef {object} VoiceWorkflowStep
 * @property {VoiceWorkflowStepType} type
 * @property {string} [title]
 * @property {string} [taskTitle]
 * @property {string} [projectName]
 * @property {boolean} [useLastProject]
 * @property {string[]} [memberNames]
 * @property {string[]} [assigneeNames]
 */

/**
 * @param {string} raw
 * @returns {string[]}
 */
function splitSegments(raw) {
  const t = preprocessVoiceTranscript(raw);
  const parts = t.split(/\s+(?:aur|and|then|phir|uske baad|after that|also|plus|,\s*aur|,\s*and)\s+/i);
  const segments = parts.map((s) => s.trim()).filter((s) => s.length > 2);
  return segments.length > 0 ? segments : [t];
}

/**
 * @param {string} s
 */
function cleanTaskTitle(s) {
  return String(s || '')
    .replace(/\b(task|kaam|assign|assignee|ko|karo|kro|create|banao|bnao|project|proj|in|mein)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} seg
 */
function segmentLooksLikeMemberOnly(seg) {
  const t = preprocessVoiceTranscript(seg);
  const hasMemberCue = /\bko\s+(?:add|assign|jodo|shamil)|\b(add|jodo|shamil)\b|\bkaro\b|\bkro\b/.test(t);
  const hasProjectCreate =
    /\b(project|proj)\b/.test(t) && /\b(banao|bnao|create|bana do|bana de|naya|new)\b/.test(t);
  const hasTask = /\b(task|kaam)\b/.test(t);
  const hasDelete = /\b(delete|remove|hatao|hata do|mitao|khatam)\b/.test(t);
  return hasMemberCue && !hasProjectCreate && !hasTask && !hasDelete;
}

/**
 * @param {string} seg
 * @returns {VoiceWorkflowStep | null}
 */
function extractTaskStep(seg) {
  const t = preprocessVoiceTranscript(seg);
  const hasTaskWord = /\b(task|kaam)\b/.test(t);
  const hasCreateVerb = /\b(banao|bnao|create|add|bana do|bana de)\b/.test(t);
  if (!hasTaskWord && !hasCreateVerb) return null;

  const patterns = [
    /(?:task|kaam)\s+(?:banao|bnao|create|add|bana do)\s+(?:named|called|title)?\s*(.+?)(?:\s+(?:in|inside|project|proj|mein)\s+(.+?))?$/,
    /(?:create|add|banao|bnao)\s+(?:task|kaam)\s+(?:named|called|title)?\s*(.+?)(?:\s+(?:in|project|proj|mein)\s+(.+?))?$/,
    /(.+?)\s+(?:ka|ki)\s+(?:task|kaam)\s+(?:banao|bnao|create)/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const title = cleanTaskTitle(m[1]);
      if (title.length < 2) continue;
      const projectName = m[2] ? cleanProjectTitle(m[2]) : undefined;
      const assigneeNames = extractVoiceMemberNames(seg);
      return {
        type: 'create_task',
        title,
        taskTitle: title,
        projectName: projectName || undefined,
        assigneeNames,
      };
    }
  }

  if (hasTaskWord && hasCreateVerb) {
    const loose = t.match(/(?:task|kaam)\s+(?:banao|create|add)\s+(.+)/);
    if (loose?.[1]) {
      const title = cleanTaskTitle(loose[1]);
      if (title.length >= 2) {
        return {
          type: 'create_task',
          title,
          taskTitle: title,
          assigneeNames: extractVoiceMemberNames(seg),
        };
      }
    }
  }

  return null;
}

/**
 * @param {string} seg
 * @returns {VoiceWorkflowStep | null}
 */
function extractAssignStep(seg) {
  const t = preprocessVoiceTranscript(seg);
  if (!/\b(assign|assignee|allocate)\b/.test(t) && !/\bko\s+assign\b/.test(t) && !/\bassign\s+karo\b/.test(t)) {
    const loose = t.match(/(.+?)\s+ko\s+(.+?)\s+ko\s+(?:assign|allocate|de do)/);
    if (loose?.[1] && loose?.[2]) {
      return {
        type: 'assign_task',
        taskTitle: cleanTaskTitle(loose[1]),
        assigneeNames: [loose[2].trim()],
      };
    }
    return null;
  }

  const patterns = [
    /assign\s+(?:task\s+)?(.+?)\s+(?:to|ko)\s+(.+)/,
    /(.+?)\s+(?:task|kaam)\s+(?:ko\s+)?(.+?)\s+ko\s+(?:assign|allocate)/,
    /(.+?)\s+ko\s+(.+?)\s+(?:task|kaam)\s+assign/,
    /(.+?)\s+ko\s+assign\s+karo/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const taskTitle = cleanTaskTitle(m[1]);
      const assigneeNames = m[2] ? [m[2].trim()] : extractVoiceMemberNames(seg);
      if (taskTitle.length >= 2 && assigneeNames.length) {
        return {
          type: 'assign_task',
          taskTitle,
          assigneeNames,
          projectName: undefined,
        };
      }
    }
  }

  const assignees = extractVoiceMemberNames(seg);
  const taskMatch = t.match(/(?:task|kaam)\s+(.+?)\s+assign/);
  if (taskMatch?.[1] && assignees.length) {
    return {
      type: 'assign_task',
      taskTitle: cleanTaskTitle(taskMatch[1]),
      assigneeNames: assignees,
    };
  }

  return null;
}

/**
 * @param {string} seg
 * @returns {VoiceWorkflowStep | null}
 */
function extractDeleteStep(seg) {
  if (!isDeleteIntent(seg)) return null;

  const target = extractDeleteProjectTarget(seg);
  if (target?.useLastCreated) {
    return { type: 'delete_project', useLastCreated: true };
  }
  if (target?.projectName) {
    return { type: 'delete_project', projectName: target.projectName };
  }

  const t = preprocessVoiceTranscript(seg);
  if (/\b(task|kaam)\b/.test(t)) {
    const patterns = [
      /(?:delete|remove|hatao|hata do|mitao|drop)\s+(?:task|kaam)\s+(.+?)(?:\s+(?:in|project|proj|mein)\s+(.+))?$/,
      /(?:task|kaam)\s+(.+?)\s+(?:delete|hatao|remove|mitao)/,
      /(.+?)\s+(?:task|kaam)\s+(?:delete|hatao|remove)/,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m?.[1]) {
        const taskTitle = cleanTaskTitle(m[1]);
        if (taskTitle.length >= 2) {
          return {
            type: 'delete_task',
            taskTitle,
            projectName: m[2] ? cleanProjectTitle(m[2]) : undefined,
          };
        }
      }
    }
  }

  return null;
}

/**
 * @param {string} seg
 */
function extractProjectNameFromSegment(seg) {
  const t = preprocessVoiceTranscript(seg);
  const m =
    t.match(/(?:project|proj)\s+(.+?)\s+(?:mein|in|par|pe)\b/) ||
    t.match(/(?:in|inside|mein)\s+(?:project|proj)\s+(.+)/);
  return m?.[1] ? cleanProjectTitle(m[1]) : undefined;
}

/**
 * @param {VoiceWorkflowStep[]} steps
 */
export function summarizeWorkflowSteps(steps) {
  return steps
    .map((s, i) => {
      const n = i + 1;
      switch (s.type) {
        case 'create_project':
          return `${n}. Create project "${s.title}"${s.memberNames?.length ? ` + ${s.memberNames.join(', ')}` : ''}`;
        case 'add_project_members':
          return `${n}. Add ${s.memberNames?.join(', ')} to project`;
        case 'create_task':
          return `${n}. Create task "${s.taskTitle || s.title}"${s.assigneeNames?.length ? ` → ${s.assigneeNames.join(', ')}` : ''}`;
        case 'assign_task':
          return `${n}. Assign task "${s.taskTitle}" → ${s.assigneeNames?.join(', ')}`;
        case 'delete_project':
          return `${n}. Delete project "${s.useLastCreated ? '(last created)' : s.projectName}"`;
        case 'delete_task':
          return `${n}. Delete task "${s.taskTitle}"`;
        default:
          return `${n}. ${s.type}`;
      }
    })
    .join('\n');
}

/**
 * @param {VoiceWorkflowStep[]} steps
 */
function orderSteps(steps) {
  const rank = {
    create_project: 1,
    add_project_members: 2,
    create_task: 3,
    assign_task: 4,
    delete_task: 5,
    delete_project: 6,
  };
  return [...steps].sort((a, b) => (rank[a.type] || 99) - (rank[b.type] || 99));
}

/**
 * @param {string} raw
 * @returns {{ type: 'workflow', steps: VoiceWorkflowStep[], raw: string, messageEn: string } | null}
 */
export function parseVoiceWorkflow(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  if (isDeleteIntent(trimmed) && !isExplicitCreateIntent(trimmed)) {
    return null;
  }

  if (isAnnouncementVoiceCommand(trimmed) || isNoteVoiceCommand(trimmed)) {
    return null;
  }

  const segments = splitSegments(trimmed);
  const projectTitle = extractProjectTitle(trimmed);
  /** @type {VoiceWorkflowStep[]} */
  const steps = [];
  const seen = new Set();

  const pushStep = (step) => {
    if (!step) return;
    const key = `${step.type}:${step.title || step.taskTitle || step.projectName || ''}:${(step.memberNames || step.assigneeNames || []).join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push(step);
  };

  if (projectTitle) {
    const firstMembers = segments.length > 1 ? extractVoiceMemberNames(segments[0]) : extractVoiceMemberNames(trimmed);
    pushStep({
      type: 'create_project',
      title: projectTitle,
      memberNames: firstMembers,
    });
  }

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];

    pushStep(extractDeleteStep(seg));
    pushStep(extractTaskStep(seg));
    pushStep(extractAssignStep(seg));

    if (projectTitle && i > 0 && segmentLooksLikeMemberOnly(seg)) {
      const memb = extractVoiceMemberNames(seg);
      if (memb.length) {
        pushStep({ type: 'add_project_members', memberNames: memb, useLastProject: true });
      }
    }

    if (!projectTitle) {
      const subTitle = extractProjectTitle(seg);
      if (subTitle) {
        pushStep({
          type: 'create_project',
          title: subTitle,
          memberNames: extractVoiceMemberNames(seg),
        });
      } else if (segmentLooksLikeMemberOnly(seg)) {
        const memb = extractVoiceMemberNames(seg);
        const proj = extractProjectNameFromSegment(seg);
        if (memb.length) {
          pushStep({ type: 'add_project_members', memberNames: memb, projectName: proj });
        }
      }
    }
  }

  if (projectTitle) {
    const taskFromFull = extractTaskStep(trimmed);
    if (taskFromFull) {
      taskFromFull.useLastProject = true;
      pushStep(taskFromFull);
    }
    const assignFromFull = extractAssignStep(trimmed);
    if (assignFromFull) {
      assignFromFull.useLastProject = true;
      pushStep(assignFromFull);
    }
  }

  const ordered = orderSteps(steps);
  if (ordered.length <= 1) return null;

  return {
    type: 'workflow',
    steps: ordered,
    raw: trimmed,
    messageEn: `${summarizeWorkflowSteps(ordered)}\n\nRun all steps?`,
  };
}
