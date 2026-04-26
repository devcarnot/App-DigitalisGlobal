import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { normalizeErpProjectType } from '../../../../lib/erp-project-types';
import { createInvitationAndSendEmail } from '../../../../lib/erp-invite-server';

const ASSIGNABLE_MEMBER_ROLES = ['admin', 'team_lead', 'team_member'];

function normalizeOptionId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = normalizeOptionId(v);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function defaultProjectDateRange() {
  const a = new Date();
  const b = new Date(a);
  b.setDate(b.getDate() + 30);
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { startDate: fmt(a), deadlineDate: fmt(b) };
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'Complete your profile' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);

  if (isErpGlobalAdmin(profile.role)) {
    const { data: projects, error: pErr } = await supabase
      .from('erp_projects')
      .select('id, name, description, project_type, project_type_ids, created_at, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    return NextResponse.json({ projects: projects || [] });
  }

  const { data: members, error: mErr } = await supabase
    .from('erp_project_members')
    .select('project_id')
    .eq('user_id', user.id);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 400 });
  }

  const ids = (members || []).map((m) => m.project_id);
  if (ids.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const { data: projects, error: pErr } = await supabase
    .from('erp_projects')
    .select('id, name, description, project_type, project_type_ids, created_at, updated_at')
    .in('id', ids)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  return NextResponse.json({ projects: projects || [] });
}

export async function POST(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (!profile || !['admin', 'team_lead'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only admins and team leads can create projects' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const legacyProjectType = normalizeErpProjectType(body.projectType);
  let projectTypeIds = [];
  if (Array.isArray(body.projectTypeIds)) {
    projectTypeIds = uniqStrings(body.projectTypeIds);
  } else if (typeof body.projectTypeId === 'string') {
    projectTypeIds = uniqStrings([body.projectTypeId]);
  } else if (typeof body.projectType === 'string') {
    projectTypeIds = uniqStrings([body.projectType]);
  }
  if (projectTypeIds.length === 0) projectTypeIds = [legacyProjectType || 'custom'];
  let startDate = typeof body.startDate === 'string' ? body.startDate.trim() : '';
  let deadlineDate = typeof body.deadlineDate === 'string' ? body.deadlineDate.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Project name required' }, { status: 400 });
  }
  if (!startDate || !deadlineDate) {
    const d = defaultProjectDateRange();
    if (!startDate) startDate = d.startDate;
    if (!deadlineDate) deadlineDate = d.deadlineDate;
  }
  if (startDate > deadlineDate) {
    return NextResponse.json({ error: 'Deadline must be on or after start date' }, { status: 400 });
  }
  const today = todayIsoLocal();
  if (deadlineDate < today) {
    return NextResponse.json({ error: 'Deadline cannot be in the past' }, { status: 400 });
  }

  let projectLeadIds = [];
  if (Array.isArray(body.projectLeadIds) && body.projectLeadIds.length > 0) {
    projectLeadIds = [...new Set(body.projectLeadIds.filter((id) => typeof id === 'string' && id.trim()))];
  } else {
    const projectLeadIdRaw = typeof body.projectLeadId === 'string' ? body.projectLeadId.trim() : '';
    projectLeadIds = [projectLeadIdRaw || user.id];
  }
  if (projectLeadIds.length === 0) {
    projectLeadIds = [user.id];
  }

  const memberIdsRaw = Array.isArray(body.memberIds) ? body.memberIds : [];
  const leadSet = new Set(projectLeadIds);
  const memberIds = [...new Set(memberIdsRaw.filter((id) => typeof id === 'string' && id && !leadSet.has(id)))];

  const clientInviteRaw = typeof body.clientInviteEmail === 'string' ? body.clientInviteEmail.trim() : '';
  const clientInviteEmail =
    clientInviteRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientInviteRaw.toLowerCase())
      ? clientInviteRaw.toLowerCase()
      : '';
  if (clientInviteRaw && !clientInviteEmail) {
    return NextResponse.json({ error: 'Enter a valid client email or leave invitation blank' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const soleSelfNoExtras =
    projectLeadIds.length === 1 && projectLeadIds[0] === user.id && memberIds.length === 0;
  const needsRoster = !soleSelfNoExtras;

  if (needsRoster && !admin) {
    return NextResponse.json(
      { error: 'Assigning team requires server configuration (SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500 },
    );
  }

  if (admin) {
    const idsToValidate = [...new Set([...projectLeadIds, ...memberIds, user.id])];
    const { data: assignProfiles, error: apErr } = await admin
      .from('erp_profiles')
      .select('id, role')
      .in('id', idsToValidate);

    if (apErr) {
      return NextResponse.json({ error: apErr.message }, { status: 400 });
    }

    const assignableById = new Map(
      (assignProfiles || [])
        .filter((p) => p?.id && ASSIGNABLE_MEMBER_ROLES.includes(p.role))
        .map((p) => [p.id, p.role]),
    );

    const profileById = new Map((assignProfiles || []).filter((p) => p?.id).map((p) => [p.id, p]));
    for (const lid of projectLeadIds) {
      const p = profileById.get(lid);
      if (!p || !['admin', 'team_lead'].includes(p.role)) {
        return NextResponse.json({ error: 'Invalid team lead' }, { status: 400 });
      }
    }
    for (const mid of memberIds) {
      if (!assignableById.has(mid)) {
        return NextResponse.json({ error: 'Invalid team member' }, { status: 400 });
      }
    }
  }

  const projectWriter = admin ?? supabase;

  // Validate project types against dynamic options table if present; otherwise fall back to legacy.
  let finalProjectTypeIds = projectTypeIds;
  try {
    const { data: typeRows, error: tErr } = await projectWriter
      .from('erp_project_type_options')
      .select('id')
      .in('id', projectTypeIds)
      .limit(200);
    if (tErr) throw tErr;
    const allowed = new Set((typeRows || []).map((r) => String(r.id)));
    finalProjectTypeIds = projectTypeIds.filter((id) => allowed.has(id));
    if (finalProjectTypeIds.length === 0) finalProjectTypeIds = [legacyProjectType || 'custom'];
  } catch {
    finalProjectTypeIds = [legacyProjectType || 'custom'];
  }

  const { data: project, error: pErr } = await projectWriter
    .from('erp_projects')
    .insert({
      name,
      description: description || null,
      project_type: finalProjectTypeIds[0] || 'custom',
      project_type_ids: finalProjectTypeIds,
      created_by: user.id,
      start_date: startDate,
      deadline_date: deadlineDate,
    })
    .select()
    .single();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  const memberRows = [];
  for (const lid of projectLeadIds) {
    memberRows.push({ project_id: project.id, user_id: lid, role: 'project_lead' });
  }
  for (const mid of memberIds) {
    memberRows.push({ project_id: project.id, user_id: mid, role: 'member' });
  }
  if (!projectLeadIds.includes(user.id) && !memberIds.includes(user.id)) {
    memberRows.push({ project_id: project.id, user_id: user.id, role: 'member' });
  }

  if (admin) {
    const { error: mErr } = await admin.from('erp_project_members').insert(memberRows);
    if (mErr) {
      await admin.from('erp_projects').delete().eq('id', project.id);
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
  } else {
    const { error: mErr } = await supabase.from('erp_project_members').insert(memberRows[0]);
    if (mErr) {
      await supabase.from('erp_projects').delete().eq('id', project.id);
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
  }

  const { error: chErr } = await projectWriter.from('erp_project_channels').insert({
    project_id: project.id,
    name: 'General',
    sort_order: 0,
    is_general: true,
    created_by: user.id,
  });
  if (chErr) {
    if (admin) {
      await admin.from('erp_project_members').delete().eq('project_id', project.id);
      await admin.from('erp_projects').delete().eq('id', project.id);
    } else {
      await supabase.from('erp_project_members').delete().eq('project_id', project.id);
      await supabase.from('erp_projects').delete().eq('id', project.id);
    }
    return NextResponse.json({ error: chErr.message }, { status: 400 });
  }

  await supabase.from('erp_activity_log').insert({
    project_id: project.id,
    user_id: user.id,
    action: 'project_created',
    meta: { name },
  });

  let invite = null;
  if (clientInviteEmail) {
    invite = await createInvitationAndSendEmail({
      supabase,
      user,
      profile,
      email: clientInviteEmail,
      globalRole: 'client',
      projectId: project.id,
    });
  }

  return NextResponse.json({ project, ...(invite ? { invite } : {}) });
}
