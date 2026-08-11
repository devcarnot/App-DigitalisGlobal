import {
  isErpGlobalAdmin,
  isErpManagerRole,
  isErpWorkspaceRosterEditor,
  isErpAdminEquivalent,
  erpWorkspaceRoleLabel,
} from '../erp-roles';
import { ERP_NOTE_DEFAULT_COLUMN } from '../../components/erp/notes/erpNotesConstants';
import { voiceIntentNeedsConfirm } from './erp-voice-intents';
import { summarizeWorkflowSteps } from './erp-voice-workflow';
import {
  clearVoiceLastProject,
  getVoiceLastProject,
  rememberVoiceLastProject,
} from './erp-voice-last-project';
import { attachResolvedPerson, findProjectByName, findTaskByTitle, resolvePeopleByNames } from './erp-voice-resolvers';

const PERSON_INTENTS = [
  'change_user_role',
  'change_member_team',
  'approve_leave',
  'reject_leave',
  'approve_remote',
  'reject_remote',
  'send_dm',
  'open_dm',
  'grant_user_access',
  'remove_project_member',
  'remove_workspace_user',
];

/**
 * Resolve ambiguous person names before confirm / execute.
 * @param {object} intent
 * @param {object} ctx
 * @param {{ setPendingIntent?: (i: object | null) => void }} [opts]
 */
async function enrichIntentWithResolvedPeople(intent, ctx, opts = {}) {
  if (!intent || intent.awaitingPersonPick) return intent;
  if (!PERSON_INTENTS.includes(intent.type)) return intent;
  if (intent.personId) return intent;

  const { intent: enriched, blocked } = await attachResolvedPerson(intent, ctx.erpAuthorizedFetch);
  if (blocked?.needsChoice) {
    return {
      ...enriched,
      __blocked: { ...blocked, pendingIntent: enriched },
    };
  }
  if (blocked) {
    return { ...intent, __blocked: blocked };
  }

  const next = { ...enriched };
  if (next.type === 'change_user_role') {
    next.messageEn = `Change ${next.personName}'s role to ${erpWorkspaceRoleLabel(next.targetRole)}?`;
  } else if (next.type === 'change_member_team') {
    next.messageEn = `Set ${next.personName}'s team to ${next.targetMemberTeam?.replace(/_/g, ' ')}?`;
  } else if (next.type === 'approve_leave' || next.type === 'reject_leave') {
    const verb = next.type === 'approve_leave' ? 'Approve' : 'Reject';
    next.messageEn = `${verb} ${next.personName}'s leave request?`;
  } else if (next.type === 'approve_remote' || next.type === 'reject_remote') {
    const verb = next.type === 'approve_remote' ? 'Approve' : 'Reject';
    next.messageEn = `${verb} ${next.personName}'s remote work request?`;
  } else if (next.type === 'send_dm') {
    next.messageEn = `Send message to ${next.personName}: "${String(next.body || '').slice(0, 80)}"?`;
  } else if (next.type === 'open_dm') {
    next.messageEn = `Open chat with ${next.personName}?`;
  } else if (next.type === 'grant_user_access') {
    next.messageEn = `Grant ${next.personName} access to ${String(next.moduleKey || '').replace(/_/g, ' ')}?`;
  } else if (next.type === 'remove_project_member') {
    next.messageEn = `Remove ${next.personName} from project "${next.projectName}"?`;
  } else if (next.type === 'remove_workspace_user') {
    next.messageEn = `Remove user ${next.personName} from workspace?`;
  }
  return next;
}

/**
 * Execute parsed voice intents against ERP APIs / navigation.
 */
export async function executeVoiceIntent(intent, ctx, options = {}) {
  const { forceExecute = false } = options;
  const {
    router,
    erpCan,
    profile,
    erpAuthorizedFetch,
    supabase,
    pushToast,
    pendingIntent,
    setPendingIntent,
  } = ctx;

  try {
    if (!intent) return { ok: false, messageEn: 'No command received.' };

    if (intent.type === 'person_picked' && intent.resumeIntent) {
      const resume = intent.resumeIntent;
      setPendingIntent(null);
      return executeVoiceIntent(resume, ctx, { forceExecute: false });
    }

    if (intent.type === 'confirm' && pendingIntent) {
      const pending = pendingIntent;
      setPendingIntent(null);
      return executeVoiceIntent(pending, { ...ctx, pendingIntent: null }, { forceExecute: true });
    }

    if (intent.type === 'cancel') {
      setPendingIntent(null);
      return { ok: true, messageEn: 'Cancelled.' };
    }

    if (intent.type === 'confirm' && !pendingIntent) {
      return { ok: false, messageEn: 'Nothing to confirm.' };
    }

    intent = await enrichIntentWithResolvedPeople(intent, ctx, { setPendingIntent });
    if (intent.__blocked) {
      const blocked = intent.__blocked;
      delete intent.__blocked;
      if (blocked.needsChoice && blocked.pendingIntent) {
        setPendingIntent(blocked.pendingIntent);
      }
      return blocked;
    }

    if (!forceExecute && voiceIntentNeedsConfirm(intent)) {
      setPendingIntent(intent);
      return {
        ok: true,
        needsConfirm: true,
        messageEn: intent.messageEn || 'Please confirm this action.',
      };
    }

    switch (intent.type) {
      case 'workflow':
        return executeWorkflow(intent, ctx);

      case 'help':
        return { ok: true, messageEn: intent.messageEn || 'Voice help.' };

      case 'navigate': {
        if (intent.module && !erpCan(intent.module, 'view')) {
          return { ok: false, messageEn: `You don't have access to ${intent.label || 'that page'}.` };
        }
        if (intent.href) router.push(intent.href);
        return { ok: true, messageEn: intent.messageEn || `Opened ${intent.label}.` };
      }

      case 'search': {
        const q = intent.query?.trim();
        if (!q) return { ok: false, messageEn: 'What should I search for?' };
        router.push(`/erp/search?q=${encodeURIComponent(q)}`);
        return { ok: true, messageEn: intent.messageEn || `Searching for "${q}".` };
      }

      case 'open_project':
        return runOpenProject(intent, ctx);

      case 'create_task':
        return runCreateTask(intent, ctx);

      case 'create_project':
        return runCreateProject(intent, ctx);

      case 'create_announcement':
        return runCreateAnnouncement(intent, ctx);

      case 'create_note':
        return runCreateNote(intent, ctx);

      case 'add_project_members':
        return runAddProjectMembers(intent, ctx);

      case 'assign_task':
        return runAssignTask(intent, ctx);

      case 'delete_project':
        return runDeleteProject(intent, ctx);

      case 'delete_task':
        return runDeleteTask(intent, ctx);

      case 'change_user_role':
        return runChangeUserRole(intent, ctx);

      case 'change_member_team':
        return runChangeMemberTeam(intent, ctx);

      case 'invite_user':
        return runInviteUser(intent, ctx);

      case 'create_client':
        return runCreateClient(intent, ctx);

      case 'delete_client':
        return runDeleteClient(intent, ctx);

      case 'delete_note':
        return runDeleteNote(intent, ctx);

      case 'restore_project':
        return runRestoreProject(intent, ctx);

      case 'approve_leave':
        return runLeaveDecision(intent, ctx, 'approved');

      case 'reject_leave':
        return runLeaveDecision(intent, ctx, 'rejected');

      case 'approve_remote':
        return runRemoteDecision(intent, ctx, 'approved');

      case 'reject_remote':
        return runRemoteDecision(intent, ctx, 'rejected');

      case 'send_dm':
        return runSendDm(intent, ctx);

      case 'send_project_message':
        return runSendProjectMessage(intent, ctx);

      case 'create_meeting':
        return runCreateMeeting(intent, ctx);

      case 'apply_leave':
        return runApplyLeave(intent, ctx);

      case 'apply_remote':
        return runApplyRemote(intent, ctx);

      case 'grant_user_access':
        return runGrantUserAccess(intent, ctx);

      case 'delete_announcement':
        return runDeleteAnnouncement(intent, ctx);

      case 'restore_trash_item':
        return runRestoreTrashItem(intent, ctx);

      case 'remove_project_member':
        return runRemoveProjectMember(intent, ctx);

      case 'remove_workspace_user':
        return runRemoveWorkspaceUser(intent, ctx);

      case 'attendance_in': {
        if (!erpCan('attendance', 'view')) {
          return { ok: false, messageEn: "You don't have access to attendance." };
        }
        const { data, error } = await supabase.rpc('erp_attendance_check_in_pk');
        if (error) return { ok: false, messageEn: error.message || 'Check-in failed.' };
        pushToast({ title: 'Checked in', body: data?.message || 'Attendance marked.', tone: 'success' });
        router.push('/erp/attendance');
        return { ok: true, messageEn: 'Attendance check-in recorded.' };
      }

      case 'attendance_out': {
        if (!erpCan('attendance', 'view')) {
          return { ok: false, messageEn: "You don't have access to attendance." };
        }
        const { data, error } = await supabase.rpc('erp_attendance_check_out_pk');
        if (error) return { ok: false, messageEn: error.message || 'Check-out failed.' };
        pushToast({ title: 'Checked out', body: data?.message || 'Attendance marked.', tone: 'success' });
        router.push('/erp/attendance');
        return { ok: true, messageEn: 'Attendance check-out recorded.' };
      }

      case 'attendance_break_start': {
        if (!erpCan('attendance', 'view')) {
          return { ok: false, messageEn: "You don't have access to attendance." };
        }
        const { data, error } = await supabase.rpc('erp_attendance_break_start_pk');
        if (error) return { ok: false, messageEn: error.message || 'Could not start break.' };
        pushToast({ title: 'Break started', body: data?.message || 'Break recorded.', tone: 'success' });
        router.push('/erp/attendance');
        return { ok: true, messageEn: 'Break started.' };
      }

      case 'attendance_break_end': {
        if (!erpCan('attendance', 'view')) {
          return { ok: false, messageEn: "You don't have access to attendance." };
        }
        const { data, error } = await supabase.rpc('erp_attendance_break_end_pk');
        if (error) return { ok: false, messageEn: error.message || 'Could not end break.' };
        pushToast({ title: 'Break ended', body: data?.message || 'Break recorded.', tone: 'success' });
        router.push('/erp/attendance');
        return { ok: true, messageEn: 'Break ended.' };
      }

      case 'open_dm':
        return runOpenDm(intent, ctx);

      case 'complete_task':
        return runCompleteTask(intent, ctx);

      case 'cancel_meeting':
        return runCancelMeeting(intent, ctx);

      case 'cancel_leave_request':
        return runCancelOwnLeave(intent, ctx);

      case 'cancel_remote_request':
        return runCancelOwnRemote(intent, ctx);

      case 'reinvite_user':
        return runReinviteUser(intent, ctx);

      default:
        return { ok: false, messageEn: intent.messageEn || "Sorry, I didn't understand that." };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Something went wrong.';
    return { ok: false, messageEn: msg === 'Not signed in' ? 'Session expired: please sign in again.' : msg };
  }
}

/**
 * @param {{ steps?: import('./erp-voice-workflow').VoiceWorkflowStep[] }} intent
 * @param {object} ctx
 */
async function executeWorkflow(intent, ctx) {
  const steps = intent.steps || [];
  if (steps.length === 0) return { ok: false, messageEn: 'No workflow steps.' };

  /** @type {{ projectId?: string, projectName?: string }} */
  const runCtx = {};
  const log = [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = { ...steps[i] };
    if (step.useLastProject && runCtx.projectId) {
      step.projectName = runCtx.projectName;
    }

    let result;
    switch (step.type) {
      case 'create_project':
        result = await runCreateProject(step, ctx, { navigate: false });
        if (!result.ok) {
          return { ok: false, messageEn: `Step ${i + 1} failed: ${result.messageEn}`, stepLog: log };
        }
        runCtx.projectId = result.projectId;
        runCtx.projectName = step.title;
        log.push(result.messageEn);
        break;

      case 'add_project_members':
        result = await runAddProjectMembers(
          { ...step, projectName: step.projectName || runCtx.projectName },
          ctx,
          { projectId: runCtx.projectId },
        );
        if (!result.ok) {
          return { ok: false, messageEn: `Step ${i + 1} failed: ${result.messageEn}`, stepLog: log };
        }
        log.push(result.messageEn);
        break;

      case 'create_task':
        result = await runCreateTask(
          {
            type: 'create_task',
            title: step.title || step.taskTitle,
            projectName: step.projectName || runCtx.projectName,
            assigneeNames: step.assigneeNames || [],
          },
          ctx,
          { projectId: runCtx.projectId, navigate: false },
        );
        if (!result.ok) {
          return { ok: false, messageEn: `Step ${i + 1} failed: ${result.messageEn}`, stepLog: log };
        }
        log.push(result.messageEn);
        break;

      case 'assign_task':
        result = await runAssignTask(
          {
            type: 'assign_task',
            title: step.taskTitle,
            projectName: step.projectName || runCtx.projectName,
            assigneeNames: step.assigneeNames || [],
          },
          ctx,
          { projectId: runCtx.projectId },
        );
        if (!result.ok) {
          return { ok: false, messageEn: `Step ${i + 1} failed: ${result.messageEn}`, stepLog: log };
        }
        log.push(result.messageEn);
        break;

      case 'delete_task':
        result = await runDeleteTask(
          { type: 'delete_task', title: step.taskTitle, projectName: step.projectName || runCtx.projectName },
          ctx,
          { projectId: runCtx.projectId },
        );
        if (!result.ok) {
          return { ok: false, messageEn: `Step ${i + 1} failed: ${result.messageEn}`, stepLog: log };
        }
        log.push(result.messageEn);
        break;

      case 'delete_project':
        result = await runDeleteProject(
          { type: 'delete_project', projectName: step.projectName || runCtx.projectName },
          ctx,
        );
        if (!result.ok) {
          return { ok: false, messageEn: `Step ${i + 1} failed: ${result.messageEn}`, stepLog: log };
        }
        log.push(result.messageEn);
        break;

      default:
        return { ok: false, messageEn: `Unknown step type: ${step.type}` };
    }
  }

  if (runCtx.projectId) {
    ctx.router.push(`/erp/projects/${runCtx.projectId}`);
  }

  return {
    ok: true,
    messageEn: `Done (${steps.length} steps):\n${log.map((line, idx) => `${idx + 1}. ${line}`).join('\n')}`,
  };
}

async function runOpenProject(intent, ctx) {
  const { router, erpCan, erpAuthorizedFetch } = ctx;
  if (!erpCan('projects', 'view')) {
    return { ok: false, messageEn: "You don't have access to projects." };
  }
  const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
  if (!project) return { ok: false, messageEn: `Project "${intent.projectName}" not found.` };
  router.push(`/erp/projects/${project.id}`);
  return { ok: true, messageEn: `Opened project "${project.name}".` };
}

async function runCreateTask(intent, ctx, opts = {}) {
  const { erpCan, erpAuthorizedFetch } = ctx;
  const { projectId: forcedProjectId, navigate = true } = opts;

  if (!erpCan('tasks', 'create')) {
    return { ok: false, messageEn: "You don't have permission to create tasks." };
  }

  let projectId = forcedProjectId;
  let projectName = intent.projectName;
  if (!projectId) {
    const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
    if (!project) return { ok: false, messageEn: `Project "${intent.projectName || '?'}" not found.` };
    projectId = project.id;
    projectName = project.name;
  }

  const { ids: assigneeIds, notFound, ambiguous } = await resolvePeopleByNames(erpAuthorizedFetch, intent.assigneeNames || []);
  if (ambiguous) {
    return {
      ok: true,
      needsChoice: true,
      messageEn: ambiguous.messageEn,
      pendingIntent: {
        ...intent,
        awaitingPersonPick: true,
        personCandidates: ambiguous.candidates,
        personQuery: ambiguous.query,
        assigneeNames: [ambiguous.query],
      },
    };
  }
  if (notFound.length) return { ok: false, messageEn: `Could not find people: ${notFound.join(', ')}.` };

  const res = await erpAuthorizedFetch('/api/erp/tasks/create-main', {
    method: 'POST',
    body: JSON.stringify({ projectId, title: intent.title, assigneeIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not create task.' };

  if (navigate) ctx.router.push(`/erp/projects/${projectId}`);
  const assignNote = assigneeIds.length ? ` Assigned to ${(intent.assigneeNames || []).join(', ')}.` : '';
  return { ok: true, messageEn: `Task "${intent.title}" created in "${projectName}".${assignNote}`, projectId };
}

async function runCreateProject(intent, ctx, opts = {}) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  const { navigate = true } = opts;

  if (!isErpManagerRole(profile?.role) && !isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only admins and team leads can create projects.' };
  }

  const { ids: memberIds, notFound, resolved, ambiguous } = await resolvePeopleByNames(
    erpAuthorizedFetch,
    intent.memberNames || [],
  );
  if (ambiguous) {
    return {
      ok: true,
      needsChoice: true,
      messageEn: ambiguous.messageEn,
      pendingIntent: {
        ...intent,
        awaitingPersonPick: true,
        personCandidates: ambiguous.candidates,
        personQuery: ambiguous.query,
        memberNames: [ambiguous.query],
      },
    };
  }
  if (notFound.length) {
    return { ok: false, messageEn: `Could not find: ${notFound.join(', ')}. Use exact names from Members page.` };
  }

  const res = await erpAuthorizedFetch('/api/erp/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: intent.title,
      projectTypeIds: ['custom'],
      projectType: 'custom',
      projectLeadIds: profile?.id ? [profile.id] : undefined,
      memberIds,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || `Could not create project (HTTP ${res.status}).` };

  const projectId = data.project?.id;
  if (!projectId) return { ok: false, messageEn: 'Server did not return the new project id.' };

  rememberVoiceLastProject(projectId, intent.title);

  const memberNote = resolved.length > 0 ? ` Added ${resolved.map((r) => r.name).join(', ')}.` : '';
  if (navigate) router.push(`/erp/projects/${projectId}`);
  return { ok: true, messageEn: `Project "${intent.title}" created.${memberNote}`, projectId };
}

async function runCreateAnnouncement(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;

  if (!isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only Super Admin can post announcements.' };
  }

  const title = String(intent.title || '').trim();
  const body = String(intent.body || intent.title || '').trim();
  if (!title || !body) {
    return { ok: false, messageEn: 'Announcement needs a title and message.' };
  }

  const res = await erpAuthorizedFetch('/api/erp/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not post announcement.' };

  const sent = data.broadcast?.recipients ?? 0;
  router.push('/erp/announcements');
  return {
    ok: true,
    messageEn: `Announcement "${title}" posted and sent to ${sent} team member${sent === 1 ? '' : 's'}.`,
  };
}

async function runCreateNote(intent, ctx) {
  const { profile, supabase, router, erpCan } = ctx;

  if (!erpCan('notes', 'view')) {
    return { ok: false, messageEn: "You don't have access to notes." };
  }

  const userId = profile?.id;
  if (!userId) return { ok: false, messageEn: 'Not signed in.' };

  const title = String(intent.title || '').trim();
  const body = String(intent.body || '').trim() || null;
  if (!title) return { ok: false, messageEn: 'Note title is required.' };

  const { data, error } = await supabase
    .from('erp_notes')
    .insert({
      user_id: userId,
      title,
      body,
      column_key: ERP_NOTE_DEFAULT_COLUMN,
      pinned: false,
      sort_order: 0,
    })
    .select('id, title')
    .single();

  if (error) return { ok: false, messageEn: error.message || 'Could not create note.' };

  router.push('/erp/notes');
  return { ok: true, messageEn: `Note "${data?.title || title}" created.` };
}

async function runDeleteProject(intent, ctx) {
  const { erpAuthorizedFetch, router, profile } = ctx;
  if (!isErpManagerRole(profile?.role) && !isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only admins and team leads can delete projects.' };
  }

  let project = null;
  if (intent.useLastCreated) {
    const last = getVoiceLastProject();
    if (last?.id) {
      project = { id: last.id, name: last.name || 'last project' };
    } else {
      return {
        ok: false,
        messageEn: 'No recent voice-created project found. Say: delete project [name]: e.g. delete project test 2',
      };
    }
  } else {
    project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
  }

  if (!project) return { ok: false, messageEn: `Project "${intent.projectName || '?'}" not found.` };

  const res = await erpAuthorizedFetch(`/api/erp/projects/${project.id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not delete project.' };

  const last = getVoiceLastProject();
  if (last?.id === project.id) clearVoiceLastProject();

  router.push('/erp/projects');
  return { ok: true, messageEn: `Project "${project.name}" moved to trash.` };
}

async function runAddProjectMembers(intent, ctx, opts = {}) {
  const { erpAuthorizedFetch, supabase, profile } = ctx;
  const { projectId: forcedProjectId } = opts;

  if (!isErpManagerRole(profile?.role) && !isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only admins and team leads can add project members.' };
  }

  let projectId = forcedProjectId;
  let projectName = intent.projectName;
  if (!projectId) {
    const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
    if (!project) return { ok: false, messageEn: `Project "${intent.projectName || '?'}" not found.` };
    projectId = project.id;
    projectName = project.name;
  }

  const { ids: memberIds, notFound, resolved, ambiguous } = await resolvePeopleByNames(
    erpAuthorizedFetch,
    intent.memberNames || [],
  );
  if (ambiguous) {
    return {
      ok: true,
      needsChoice: true,
      messageEn: ambiguous.messageEn,
      pendingIntent: {
        ...intent,
        awaitingPersonPick: true,
        personCandidates: ambiguous.candidates,
        personQuery: ambiguous.query,
        memberNames: [ambiguous.query],
      },
    };
  }
  if (notFound.length) return { ok: false, messageEn: `Could not find: ${notFound.join(', ')}.` };
  if (memberIds.length === 0) return { ok: false, messageEn: 'No members to add.' };

  const added = [];
  const addedUserIds = [];
  for (const uid of memberIds) {
    const { data: existing } = await supabase
      .from('erp_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', uid)
      .maybeSingle();
    if (existing?.user_id) continue;

    const { error } = await supabase.from('erp_project_members').insert({
      project_id: projectId,
      user_id: uid,
      role: 'member',
    });
    if (error) return { ok: false, messageEn: `Could not add member: ${error.message}` };
    addedUserIds.push(uid);
    const person = resolved.find((r) => r.id === uid);
    added.push(person?.name || uid);
  }

  if (addedUserIds.length > 0) {
    try {
      await erpAuthorizedFetch(`/api/erp/projects/${projectId}/notify-members-added`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: addedUserIds }),
      });
    } catch {
      /* membership succeeded; notification is best-effort */
    }
  }

  if (added.length === 0) return { ok: true, messageEn: `Members already on "${projectName}".`, projectId };
  return { ok: true, messageEn: `Added ${added.join(', ')} to "${projectName}".`, projectId };
}

async function runAssignTask(intent, ctx, opts = {}) {
  const { erpAuthorizedFetch, supabase } = ctx;
  const { projectId: forcedProjectId } = opts;

  let projectId = forcedProjectId;
  if (!projectId && intent.projectName) {
    const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
    if (!project) return { ok: false, messageEn: `Project "${intent.projectName}" not found.` };
    projectId = project.id;
  }

  const task = await findTaskByTitle(supabase, intent.title || intent.taskTitle, projectId);
  if (!task) return { ok: false, messageEn: `Task "${intent.title || intent.taskTitle}" not found.` };

  const { ids: assigneeIds, notFound, ambiguous } = await resolvePeopleByNames(erpAuthorizedFetch, intent.assigneeNames || []);
  if (ambiguous) {
    return {
      ok: true,
      needsChoice: true,
      messageEn: ambiguous.messageEn,
      pendingIntent: {
        ...intent,
        awaitingPersonPick: true,
        personCandidates: ambiguous.candidates,
        personQuery: ambiguous.query,
        assigneeNames: [ambiguous.query],
      },
    };
  }
  if (notFound.length) return { ok: false, messageEn: `Could not find: ${notFound.join(', ')}.` };
  if (assigneeIds.length === 0) return { ok: false, messageEn: 'No assignee specified.' };

  const merged = [...new Set([...(task.assignee_ids || []), ...assigneeIds])];
  const { error } = await supabase
    .from('erp_tasks')
    .update({
      assignee_ids: merged,
      assignee_id: merged[0] || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  if (error) return { ok: false, messageEn: error.message || 'Could not assign task.' };

  if (assigneeIds.length) {
    erpAuthorizedFetch('/api/erp/notify-task-assignment', {
      method: 'POST',
      body: JSON.stringify({ taskId: task.id, assigneeIds, previousAssigneeId: null }),
    }).catch(() => {});
  }

  return {
    ok: true,
    messageEn: `Task "${task.title}" assigned to ${(intent.assigneeNames || []).join(', ')}.`,
    projectId: task.project_id,
  };
}

async function runDeleteTask(intent, ctx, opts = {}) {
  const { supabase, erpAuthorizedFetch } = ctx;
  const { projectId: forcedProjectId } = opts;

  let projectId = forcedProjectId;
  if (!projectId && intent.projectName) {
    const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
    if (project) projectId = project.id;
  }

  const task = await findTaskByTitle(supabase, intent.title || intent.taskTitle, projectId);
  if (!task) return { ok: false, messageEn: `Task "${intent.title || intent.taskTitle}" not found.` };

  const { error } = await supabase.from('erp_tasks').delete().eq('id', task.id);
  if (error) return { ok: false, messageEn: error.message || 'Could not delete task.' };

  return { ok: true, messageEn: `Task "${task.title}" deleted.`, projectId: task.project_id };
}

async function runChangeUserRole(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpWorkspaceRosterEditor(profile?.role)) {
    return { ok: false, messageEn: 'You cannot change user roles.' };
  }
  if (intent.targetRole === 'admin' && !isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only Super Admin can grant Super Admin role.' };
  }
  const userId = intent.personId;
  if (!userId) return { ok: false, messageEn: 'Which user?' };

  const res = await erpAuthorizedFetch(`/api/erp/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: intent.targetRole }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not change role.' };

  router.push('/erp/admin/members');
  return {
    ok: true,
    messageEn: `${intent.personName}'s role is now ${erpWorkspaceRoleLabel(intent.targetRole)}.`,
  };
}

async function runChangeMemberTeam(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpManagerRole(profile?.role)) {
    return { ok: false, messageEn: 'Only admins and team leads can change member teams.' };
  }
  const userId = intent.personId;
  if (!userId) return { ok: false, messageEn: 'Which user?' };

  const res = await erpAuthorizedFetch('/api/erp/admin/member-team', {
    method: 'PATCH',
    body: JSON.stringify({ userId, memberTeam: intent.targetMemberTeam }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not update team.' };

  router.push('/erp/admin/members');
  return { ok: true, messageEn: `${intent.personName}'s team updated.` };
}

async function runInviteUser(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpAdminEquivalent(profile?.role)) {
    return { ok: false, messageEn: 'Only admins and team leads can invite users.' };
  }
  if (intent.targetRole === 'admin' && !isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only Super Admin can invite Super Admin.' };
  }

  const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
    method: 'POST',
    body: JSON.stringify({ invites: [{ email: intent.email, globalRole: intent.targetRole || 'team_member' }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not send invite.' };

  router.push('/erp/admin/invites');
  return { ok: true, messageEn: `Invite sent to ${intent.email}.` };
}

async function runCreateClient(intent, ctx) {
  const { erpCan, erpAuthorizedFetch, router } = ctx;
  if (!erpCan('clients', 'create')) {
    return { ok: false, messageEn: "You don't have permission to create clients." };
  }

  const res = await erpAuthorizedFetch('/api/erp/crm/leads', {
    method: 'POST',
    body: JSON.stringify({ companyName: intent.title }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not create client.' };

  router.push('/erp/admin/clients');
  return { ok: true, messageEn: `Client "${intent.title}" created.` };
}

async function runDeleteClient(intent, ctx) {
  const { erpCan, erpAuthorizedFetch, supabase, router } = ctx;
  if (!erpCan('clients', 'delete')) {
    return { ok: false, messageEn: "You don't have permission to delete clients." };
  }

  const { data: leads } = await supabase
    .from('erp_crm_leads')
    .select('id, company_name')
    .ilike('company_name', `%${intent.title}%`)
    .limit(5);
  const lead = (leads || []).find((l) => l.company_name?.toLowerCase() === intent.title?.toLowerCase()) || leads?.[0];
  if (!lead) return { ok: false, messageEn: `Client "${intent.title}" not found.` };

  const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${lead.id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not delete client.' };

  router.push('/erp/admin/clients');
  return { ok: true, messageEn: `Client "${lead.company_name}" deleted.` };
}

async function runDeleteNote(intent, ctx) {
  const { profile, supabase, router, erpCan } = ctx;
  if (!erpCan('notes', 'view')) {
    return { ok: false, messageEn: "You don't have access to notes." };
  }

  const { data: notes } = await supabase
    .from('erp_notes')
    .select('id, title')
    .eq('user_id', profile.id)
    .ilike('title', `%${intent.title}%`)
    .limit(5);
  const note = (notes || []).find((n) => n.title?.toLowerCase() === intent.title?.toLowerCase()) || notes?.[0];
  if (!note) return { ok: false, messageEn: `Note "${intent.title}" not found.` };

  const { error } = await supabase.from('erp_notes').delete().eq('id', note.id);
  if (error) return { ok: false, messageEn: error.message || 'Could not delete note.' };

  router.push('/erp/notes');
  return { ok: true, messageEn: `Note "${note.title}" deleted.` };
}

async function runRestoreProject(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpManagerRole(profile?.role)) {
    return { ok: false, messageEn: 'Only admins and team leads can restore projects.' };
  }

  const { data: trashed } = await ctx.supabase
    .from('erp_projects')
    .select('id, name')
    .not('deleted_at', 'is', null)
    .ilike('name', `%${intent.projectName}%`)
    .limit(5);
  const project = (trashed || []).find((p) => p.name?.toLowerCase() === intent.projectName?.toLowerCase()) || trashed?.[0];
  if (!project) return { ok: false, messageEn: `Trashed project "${intent.projectName}" not found.` };

  const res = await erpAuthorizedFetch('/api/erp/trash/restore-project', {
    method: 'POST',
    body: JSON.stringify({ projectId: project.id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not restore project.' };

  router.push(`/erp/projects/${project.id}`);
  return { ok: true, messageEn: `Project "${project.name}" restored.` };
}

async function runLeaveDecision(intent, ctx, status) {
  const { profile, erpAuthorizedFetch, supabase } = ctx;
  const userId = intent.personId;
  if (!userId) return { ok: false, messageEn: 'Which person?' };

  const { data: rows } = await supabase
    .from('erp_leave_requests')
    .select('id, status, user_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, messageEn: `No pending leave request for ${intent.personName}.` };

  if (isErpGlobalAdmin(profile?.role)) {
    const res = await erpAuthorizedFetch(`/api/erp/admin/leave-requests/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, messageEn: data.error || 'Could not update leave request.' };
  } else {
    const { error } = await supabase.rpc('erp_leave_admin_set_request_status', {
      p_request_id: row.id,
      p_status: status,
    });
    if (error) return { ok: false, messageEn: error.message || 'Could not update leave request.' };
  }

  return {
    ok: true,
    messageEn: `${intent.personName}'s leave request ${status === 'approved' ? 'approved' : 'rejected'}.`,
  };
}

async function runRemoteDecision(intent, ctx, status) {
  const { supabase } = ctx;
  const userId = intent.personId;
  if (!userId) return { ok: false, messageEn: 'Which person?' };

  const { data: rows } = await supabase
    .from('erp_remote_work_requests')
    .select('id, status, user_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, messageEn: `No pending remote request for ${intent.personName}.` };

  const { error } = await supabase
    .from('erp_remote_work_requests')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) return { ok: false, messageEn: error.message || 'Could not update remote request.' };

  return {
    ok: true,
    messageEn: `${intent.personName}'s remote request ${status === 'approved' ? 'approved' : 'rejected'}.`,
  };
}

async function runSendDm(intent, ctx) {
  const { profile, supabase, router, erpAuthorizedFetch, erpCan } = ctx;
  if (!erpCan('messages', 'create')) {
    return { ok: false, messageEn: "You don't have permission to send messages." };
  }
  const recipientId = intent.personId;
  if (!recipientId) return { ok: false, messageEn: 'Which person?' };
  const body = String(intent.body || '').trim();
  if (!body) return { ok: false, messageEn: 'Message text is required.' };

  const { data: inserted, error } = await supabase
    .from('erp_direct_messages')
    .insert({ sender_id: profile.id, recipient_id: recipientId, body })
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, messageEn: error.message || 'Could not send message.' };

  if (inserted?.id) {
    erpAuthorizedFetch('/api/erp/notify-dm', {
      method: 'POST',
      body: JSON.stringify({ messageId: inserted.id }),
    }).catch(() => {});
  }

  router.push(`/erp/messages?with=${recipientId}`);
  return { ok: true, messageEn: `Message sent to ${intent.personName}.` };
}

async function runSendProjectMessage(intent, ctx) {
  const { profile, supabase, router, erpAuthorizedFetch, erpCan } = ctx;
  if (!erpCan('messages', 'create')) {
    return { ok: false, messageEn: "You don't have permission to send messages." };
  }

  const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
  if (!project) return { ok: false, messageEn: `Project "${intent.projectName}" not found.` };

  const chRes = await erpAuthorizedFetch(`/api/erp/projects/${project.id}/ensure-general-channel`, {
    method: 'POST',
  });
  const chData = await chRes.json().catch(() => ({}));
  if (!chRes.ok) return { ok: false, messageEn: chData.error || 'Could not open project chat.' };
  const channelId = chData.channel?.id || chData.channelId;
  if (!channelId) return { ok: false, messageEn: 'Project chat channel not found.' };

  const body = String(intent.body || '').trim();
  const { data: row, error } = await supabase
    .from('erp_messages')
    .insert({
      project_id: project.id,
      channel_id: channelId,
      user_id: profile.id,
      body,
      attachments: [],
    })
    .select('id')
    .single();
  if (error) return { ok: false, messageEn: error.message || 'Could not send message.' };

  if (row?.id) {
    erpAuthorizedFetch('/api/erp/notify-message', {
      method: 'POST',
      body: JSON.stringify({ messageId: row.id }),
    }).catch(() => {});
  }

  router.push(`/erp/projects/${project.id}?channel=${channelId}`);
  return { ok: true, messageEn: `Message sent in project "${project.name}".` };
}

async function runCreateMeeting(intent, ctx) {
  const { erpCan, erpAuthorizedFetch, router } = ctx;
  if (!erpCan('meetings', 'create')) {
    return { ok: false, messageEn: "You don't have permission to schedule meetings." };
  }

  const attendeeIds = [];
  for (const name of intent.memberNames || []) {
    const { ids, notFound, ambiguous } = await resolvePeopleByNames(erpAuthorizedFetch, [name]);
    if (ambiguous) {
      return {
        ok: true,
        needsChoice: true,
        messageEn: ambiguous.messageEn,
        pendingIntent: {
          ...intent,
          awaitingPersonPick: true,
          personCandidates: ambiguous.candidates,
          personQuery: ambiguous.query,
          memberNames: [ambiguous.query],
        },
      };
    }
    if (notFound.length) return { ok: false, messageEn: `Could not find: ${notFound.join(', ')}.` };
    attendeeIds.push(...ids);
  }

  const res = await erpAuthorizedFetch('/api/erp/meetings', {
    method: 'POST',
    body: JSON.stringify({
      title: intent.title,
      scheduledAt: intent.scheduledAt,
      attendeeIds: [...new Set(attendeeIds)],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not schedule meeting.' };

  router.push('/erp/meetings');
  return { ok: true, messageEn: `Meeting "${intent.title}" scheduled.` };
}

async function runApplyLeave(intent, ctx) {
  const { profile, supabase, router, erpCan } = ctx;
  if (!erpCan('leave', 'create')) {
    return { ok: false, messageEn: "You don't have permission to apply for leave." };
  }

  const { error } = await supabase.from('erp_leave_requests').insert({
    user_id: profile.id,
    leave_type: intent.leaveType || 'regular',
    start_date: intent.startDate,
    end_date: intent.endDate,
    day_count: intent.dayCount,
    status: 'pending',
    reason: null,
    attachment_path: null,
  });
  if (error) return { ok: false, messageEn: error.message || 'Could not apply for leave.' };

  router.push('/erp/leave');
  return { ok: true, messageEn: `Leave request submitted (${intent.startDate} → ${intent.endDate}).` };
}

async function runApplyRemote(intent, ctx) {
  const { profile, supabase, router, erpCan } = ctx;
  if (!erpCan('remote', 'create')) {
    return { ok: false, messageEn: "You don't have permission to apply for remote work." };
  }

  const { error } = await supabase.from('erp_remote_work_requests').insert({
    user_id: profile.id,
    start_date: intent.startDate,
    end_date: intent.endDate,
    day_count: intent.dayCount,
    status: 'pending',
    reason: null,
  });
  if (error) return { ok: false, messageEn: error.message || 'Could not apply for remote work.' };

  router.push('/erp/remote');
  return { ok: true, messageEn: `Remote work request submitted.` };
}

async function runGrantUserAccess(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only Super Admin can change user permissions.' };
  }
  const userId = intent.personId;
  if (!userId || !intent.moduleKey) return { ok: false, messageEn: 'Missing user or module.' };

  const res = await erpAuthorizedFetch('/api/erp/admin/user-permissions', {
    method: 'PATCH',
    body: JSON.stringify({
      userId,
      grants: { [intent.moduleKey]: intent.grants },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not update permissions.' };

  router.push('/erp/admin/roles');
  return { ok: true, messageEn: `${intent.personName}'s ${intent.moduleKey} access updated.` };
}

async function runDeleteAnnouncement(intent, ctx) {
  const { profile, erpAuthorizedFetch, supabase, router } = ctx;
  if (!isErpGlobalAdmin(profile?.role)) {
    return { ok: false, messageEn: 'Only Super Admin can delete announcements.' };
  }

  const { data: rows } = await supabase
    .from('erp_announcements')
    .select('id, title')
    .ilike('title', `%${intent.title}%`)
    .limit(5);
  const row = (rows || []).find((r) => r.title?.toLowerCase() === intent.title?.toLowerCase()) || rows?.[0];
  if (!row) return { ok: false, messageEn: `Announcement "${intent.title}" not found.` };

  const res = await erpAuthorizedFetch(`/api/erp/announcements/${row.id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not delete announcement.' };

  router.push('/erp/announcements');
  return { ok: true, messageEn: `Announcement "${row.title}" deleted.` };
}

async function runRestoreTrashItem(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpAdminEquivalent(profile?.role)) {
    return { ok: false, messageEn: 'Only admins can restore trash items.' };
  }

  const listRes = await erpAuthorizedFetch('/api/erp/trash');
  const listData = await listRes.json().catch(() => ({}));
  if (!listRes.ok) return { ok: false, messageEn: listData.error || 'Could not load trash.' };

  const q = intent.title?.toLowerCase();
  const item = (listData.items || []).find((i) => i.display_name?.toLowerCase().includes(q));
  if (!item) return { ok: false, messageEn: `Trash item "${intent.title}" not found.` };

  const res = await erpAuthorizedFetch(`/api/erp/trash/${item.id}/restore`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not restore item.' };

  router.push('/erp/admin/trash');
  return { ok: true, messageEn: `"${item.display_name}" restored from trash.` };
}

async function runRemoveProjectMember(intent, ctx) {
  const { profile, erpAuthorizedFetch, supabase } = ctx;
  if (profile?.role !== 'admin') {
    return { ok: false, messageEn: 'Only Super Admin can remove project members this way.' };
  }

  const project = await findProjectByName(erpAuthorizedFetch, intent.projectName);
  if (!project) return { ok: false, messageEn: `Project "${intent.projectName}" not found.` };

  const userId = intent.personId;
  if (!userId) return { ok: false, messageEn: 'Which person?' };

  const { data: member } = await supabase
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', project.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return { ok: false, messageEn: `${intent.personName} is not on project "${project.name}".` };

  const res = await erpAuthorizedFetch(`/api/erp/projects/${project.id}/members/${userId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not remove member.' };

  return { ok: true, messageEn: `Removed ${intent.personName} from "${project.name}".` };
}

async function runRemoveWorkspaceUser(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpAdminEquivalent(profile?.role)) {
    return { ok: false, messageEn: 'Only admins can remove workspace users.' };
  }

  const userId = intent.personId;
  if (!userId) return { ok: false, messageEn: 'Which user?' };
  if (userId === profile.id) return { ok: false, messageEn: 'You cannot remove yourself.' };

  const res = await erpAuthorizedFetch(`/api/erp/admin/users/${userId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not remove user.' };

  router.push('/erp/admin/members');
  return { ok: true, messageEn: `User ${intent.personName} removed from workspace.` };
}

async function runOpenDm(intent, ctx) {
  const { router, erpCan } = ctx;
  if (!erpCan('messages', 'view')) {
    return { ok: false, messageEn: "You don't have access to messages." };
  }
  const recipientId = intent.personId;
  if (!recipientId) return { ok: false, messageEn: 'Which person?' };

  router.push(`/erp/messages?with=${recipientId}`);
  return { ok: true, messageEn: `Opened chat with ${intent.personName}.` };
}

async function runCompleteTask(intent, ctx) {
  const { supabase, router } = ctx;
  const task = await findTaskByTitle(supabase, intent.title, intent.projectId);
  if (!task) return { ok: false, messageEn: `Task "${intent.title}" not found.` };

  const { error } = await supabase
    .from('erp_tasks')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', task.id);
  if (error) return { ok: false, messageEn: error.message || 'Could not complete task.' };

  if (task.project_id) {
    router.push(`/erp/projects/${task.project_id}`);
  } else {
    router.push('/erp/my-tasks');
  }
  return { ok: true, messageEn: `Task "${task.title}" marked as done.` };
}

async function runCancelMeeting(intent, ctx) {
  const { erpCan, erpAuthorizedFetch, router } = ctx;
  if (!erpCan('meetings', 'view')) {
    return { ok: false, messageEn: "You don't have access to meetings." };
  }

  const q = String(intent.title || '').trim().toLowerCase();
  if (!q) return { ok: false, messageEn: 'Which meeting?' };

  const listRes = await erpAuthorizedFetch('/api/erp/meetings?range=all&status=scheduled');
  const listData = await listRes.json().catch(() => ({}));
  if (!listRes.ok) return { ok: false, messageEn: listData.error || 'Could not load meetings.' };

  const meetings = listData.meetings || [];
  const exact = meetings.find((m) => m.title?.toLowerCase() === q);
  const partial = meetings.filter((m) => m.title?.toLowerCase().includes(q));
  const meeting = exact || partial[0];
  if (!meeting) return { ok: false, messageEn: `Meeting "${intent.title}" not found.` };
  if (partial.length > 1 && !exact) {
    return {
      ok: false,
      messageEn: `Multiple meetings match "${intent.title}". Please be more specific.`,
    };
  }

  const res = await erpAuthorizedFetch(`/api/erp/meetings/${encodeURIComponent(meeting.id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not cancel meeting.' };

  router.push('/erp/meetings');
  return { ok: true, messageEn: `Meeting "${meeting.title}" cancelled.` };
}

async function runCancelOwnLeave(intent, ctx) {
  const { profile, supabase, router, erpCan } = ctx;
  if (!erpCan('leave', 'view')) {
    return { ok: false, messageEn: "You don't have access to leave." };
  }

  const { data: rows } = await supabase
    .from('erp_leave_requests')
    .select('id')
    .eq('user_id', profile.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, messageEn: 'No pending leave request to cancel.' };

  const { error } = await supabase
    .from('erp_leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', row.id)
    .eq('user_id', profile.id)
    .eq('status', 'pending');
  if (error) return { ok: false, messageEn: error.message || 'Could not cancel leave request.' };

  router.push('/erp/leave');
  return { ok: true, messageEn: 'Your leave request was cancelled.' };
}

async function runCancelOwnRemote(intent, ctx) {
  const { profile, supabase, router, erpCan } = ctx;
  if (!erpCan('remote', 'view')) {
    return { ok: false, messageEn: "You don't have access to remote work." };
  }

  const { data: rows } = await supabase
    .from('erp_remote_work_requests')
    .select('id')
    .eq('user_id', profile.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, messageEn: 'No pending remote request to cancel.' };

  const { error } = await supabase
    .from('erp_remote_work_requests')
    .update({ status: 'cancelled' })
    .eq('id', row.id)
    .eq('user_id', profile.id)
    .eq('status', 'pending');
  if (error) return { ok: false, messageEn: error.message || 'Could not cancel remote request.' };

  router.push('/erp/remote');
  return { ok: true, messageEn: 'Your remote work request was cancelled.' };
}

async function runReinviteUser(intent, ctx) {
  const { profile, erpAuthorizedFetch, router } = ctx;
  if (!isErpAdminEquivalent(profile?.role)) {
    return { ok: false, messageEn: 'Only admins can re-invite trashed users.' };
  }

  const listRes = await erpAuthorizedFetch('/api/erp/trash');
  const listData = await listRes.json().catch(() => ({}));
  if (!listRes.ok) return { ok: false, messageEn: listData.error || 'Could not load trash.' };

  const trashedUsers = listData.trashedUsers || [];
  const emailQ = String(intent.email || '').trim().toLowerCase();
  const nameQ = String(intent.personName || '').trim().toLowerCase();

  let row = null;
  if (emailQ) {
    row = trashedUsers.find((u) => String(u.email || '').toLowerCase() === emailQ);
  } else if (nameQ) {
    const exact = trashedUsers.filter((u) => String(u.full_name || '').toLowerCase() === nameQ);
    const partial = trashedUsers.filter((u) => String(u.full_name || '').toLowerCase().includes(nameQ));
    row = exact[0] || (partial.length === 1 ? partial[0] : null);
    if (!row && partial.length > 1) {
      return {
        ok: false,
        messageEn: `Multiple trashed users match "${intent.personName}". Use their email instead.`,
      };
    }
  }

  if (!row) {
    return {
      ok: false,
      messageEn: `Trashed user "${intent.personName || intent.email}" not found.`,
    };
  }

  const res = await erpAuthorizedFetch(`/api/erp/trash/users/${row.id}/reinvite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, messageEn: data.error || 'Could not send invite.' };

  router.push('/erp/admin/trash');
  return {
    ok: true,
    messageEn: `Invite sent to ${row.full_name || row.email || 'user'}.`,
  };
}

export { summarizeWorkflowSteps };
