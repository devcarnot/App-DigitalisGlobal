import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent, isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import {
  createInvitationAndSendEmail,
  erpInvitePublicBaseUrl,
  parseEmailList,
} from '../../../../../lib/erp-invite-server';
import { fetchResolvedWorkspaceRoleKeySet } from '../../../../../lib/erp-workspace-role-keys-server';

const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBatchInviteEmail(raw) {
  const e = String(raw ?? '')
    .trim()
    .toLowerCase();
  return INVITE_EMAIL_RE.test(e) ? e : null;
}

export const runtime = 'nodejs';

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
  if (!profile || !isErpAdminEquivalent(profile.role)) {
    return NextResponse.json({ error: 'Only workspace admins or team leads can send invitations' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body.projectId || null;

  const adminSvc = createSupabaseAdmin();
  const validRoleKeys = await fetchResolvedWorkspaceRoleKeySet(adminSvc);
  const viewerIsGlobalAdmin = isErpGlobalAdmin(profile.role);

  /** @type {{ email: string, globalRole: string }[]} */
  let jobs = [];

  const rawInvites = body.invites;
  if (Array.isArray(rawInvites) && rawInvites.length > 0) {
    for (const row of rawInvites) {
      const email = normalizeBatchInviteEmail(row?.email);
      const globalRole = String(row?.globalRole ?? row?.global_role ?? '')
        .trim()
        .toLowerCase();
      if (!email || !globalRole) {
        return NextResponse.json(
          { error: 'Each invite needs a valid email and a workspace role (globalRole).' },
          { status: 400 },
        );
      }
      if (!validRoleKeys.has(globalRole)) {
        return NextResponse.json({ error: `Unknown workspace role: ${globalRole}` }, { status: 400 });
      }
      if (globalRole === 'admin' && !viewerIsGlobalAdmin) {
        return NextResponse.json({ error: 'Only Super Admins may invite with the Admin role.' }, { status: 403 });
      }
      jobs.push({ email, globalRole });
    }
  } else {
    const teamMembers = parseEmailList(body.teamMemberEmails ?? '');
    const managers = parseEmailList(body.managerEmails ?? '');
    const clients = parseEmailList(body.clientEmails ?? '');
    jobs = [
      ...teamMembers.map((email) => ({ email, globalRole: 'team_member' })),
      ...managers.map((email) => ({ email, globalRole: 'team_lead' })),
      ...clients.map((email) => ({ email, globalRole: 'client' })),
    ];
  }

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one email (use invites[], or legacy team/manager/client lists).' },
      { status: 400 },
    );
  }

  const seen = new Set();
  const deduped = [];
  for (const j of jobs) {
    if (seen.has(j.email)) continue;
    seen.add(j.email);
    deduped.push(j);
  }

  const supabase = createSupabaseUserClient(accessToken);
  const results = [];
  let sent = 0;
  let failed = 0;

  for (const { email, globalRole } of deduped) {
    const r = await createInvitationAndSendEmail({
      supabase,
      user,
      profile,
      email,
      globalRole,
      projectId,
    });
    if (r.ok) {
      sent++;
      results.push({
        email,
        globalRole,
        ok: true,
        ...(r.flow ? { flow: r.flow } : {}),
      });
    } else {
      failed++;
      // NOTE: We deliberately do NOT echo `r.inviteUrl` for failed rows.
      // The previous shape leaked the live invite link in the admin response
      // even when the email send had already failed (e.g. SMTP outage), which
      // is captured in browser history / extension telemetry. The link is
      // still active in `erp_invitations` and admins can copy it from the
      // dedicated invitations admin screen if they need to retry.
      results.push({
        email,
        globalRole,
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
