import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { canInviteClientTeamMember, isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import {
  createInvitationAndSendEmail,
  erpInvitePublicBaseUrl,
  parseEmailList,
} from '../../../../../lib/erp-invite-server';
import { fetchResolvedWorkspaceRoleKeySet } from '../../../../../lib/erp-workspace-role-keys-server';

const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GLOBAL_ROLE = 'client_team_member';

function normalizeEmail(raw) {
  const e = String(raw ?? '')
    .trim()
    .toLowerCase();
  return INVITE_EMAIL_RE.test(e) ? e : null;
}

export const runtime = 'nodejs';

/**
 * Invite client team helpers to a single project (project sidebar only).
 * Allowed: super admin, team manager/member, primary client, or existing client team on the project.
 */
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (!profile || !canInviteClientTeamMember(profile)) {
    return NextResponse.json({ error: 'You cannot invite client team members.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
  }

  const rawInvites = body.invites;
  /** @type {string[]} */
  let emails = [];
  if (Array.isArray(rawInvites) && rawInvites.length > 0) {
    for (const row of rawInvites) {
      const email = normalizeEmail(row?.email);
      if (!email) {
        return NextResponse.json({ error: 'Each invite needs a valid email.' }, { status: 400 });
      }
      emails.push(email);
    }
  } else {
    emails = parseEmailList(body.emails ?? body.clientTeamEmails ?? '');
  }

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Add at least one email address.' }, { status: 400 });
  }

  const seen = new Set();
  const deduped = [];
  for (const e of emails) {
    if (seen.has(e)) continue;
    seen.add(e);
    deduped.push(e);
  }

  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!isErpGlobalAdmin(profile.role)) {
    const { data: onProject, error: pmErr } = await supabase
      .from('erp_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (pmErr) {
      return NextResponse.json({ error: pmErr.message }, { status: 400 });
    }
    if (!onProject) {
      return NextResponse.json({ error: 'You must be on this project to invite client team members.' }, { status: 403 });
    }
  } else {
    const adminCheck = createSupabaseAdmin();
    if (adminCheck) {
      const { data: proj, error: projErr } = await adminCheck
        .from('erp_projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();
      if (projErr) {
        return NextResponse.json({ error: projErr.message }, { status: 400 });
      }
      if (!proj) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
    }
  }

  const adminSvc = createSupabaseAdmin();
  const validRoleKeys = await fetchResolvedWorkspaceRoleKeySet(adminSvc);
  if (!validRoleKeys.has(GLOBAL_ROLE)) {
    return NextResponse.json({ error: 'Client team member role is not configured.' }, { status: 500 });
  }

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const email of deduped) {
    const r = await createInvitationAndSendEmail({
      supabase,
      user,
      profile,
      email,
      globalRole: GLOBAL_ROLE,
      projectId,
    });
    if (r.ok) {
      sent++;
      results.push({ email, globalRole: GLOBAL_ROLE, ok: true, ...(r.flow ? { flow: r.flow } : {}) });
    } else {
      failed++;
      results.push({
        email,
        globalRole: GLOBAL_ROLE,
        ok: false,
        step: r.step,
        error: r.error,
        invitationCreated: r.invitationCreated === true,
        ...(r.memberAdded === true ? { memberAdded: true } : {}),
        ...(r.flow ? { flow: r.flow } : {}),
      });
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    inviteBaseUrl: erpInvitePublicBaseUrl(),
    summary: { total: deduped.length, sent, failed },
    results,
  });
}
