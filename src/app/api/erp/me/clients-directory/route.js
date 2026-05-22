import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpRbacCan } from '../../../../../lib/erp-rbac-modules';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';
import { ERP_WORKSPACE_ROLE_LABELS } from '../../../../../lib/erp-roles';

export const runtime = 'nodejs';

const CHUNK = 80;

const AUDIENCES = {
  client: {
    workspaceRole: 'client',
    projectMemberRole: 'client',
    defaultName: 'Client',
  },
  client_team_member: {
    workspaceRole: 'client_team_member',
    projectMemberRole: null,
    defaultName: 'Client team member',
  },
};

async function fetchInChunksAdmin(admin, table, column, ids, select) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin.from(table).select(select).in(column, slice);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {'client' | 'client_team_member'} audience
 */
async function buildClientDirectoryRows(admin, audience) {
  const cfg = AUDIENCES[audience];
  const { data: roleProfiles, error: allErr } = await admin
    .from('erp_profiles')
    .select('id, full_name, role, phone, contact_email, avatar_path')
    .eq('role', cfg.workspaceRole);
  if (allErr) throw new Error(allErr.message);

  const userProjects = new Map();
  for (const p of roleProfiles || []) {
    if (p?.id) userProjects.set(p.id, new Set());
  }

  const { data: allProjs, error: apErr } = await admin
    .from('erp_projects')
    .select('id')
    .order('name', { ascending: true })
    .limit(500);
  if (apErr) throw new Error(apErr.message);
  const projectIds = (allProjs || []).map((p) => p.id).filter(Boolean);

  if (projectIds.length > 0) {
    const memberRows = await fetchInChunksAdmin(
      admin,
      'erp_project_members',
      'project_id',
      projectIds,
      'user_id, role, project_id',
    );
    for (const m of memberRows || []) {
      if (!m.user_id || !m.project_id) continue;
      if (!userProjects.has(m.user_id)) continue;
      if (cfg.projectMemberRole && m.role !== cfg.projectMemberRole) continue;
      userProjects.get(m.user_id).add(m.project_id);
    }
  }

  const userIds = [...userProjects.keys()];
  if (userIds.length === 0) {
    return [];
  }

  const profileById = Object.fromEntries((roleProfiles || []).map((p) => [p.id, p]));

  const allPid = new Set();
  for (const set of userProjects.values()) {
    for (const pid of set) allPid.add(pid);
  }
  const pidList = [...allPid];
  let projectNames = [];
  for (let i = 0; i < pidList.length; i += CHUNK) {
    const slice = pidList.slice(i, i + CHUNK);
    const { data: prs, error: prErr } = await admin.from('erp_projects').select('id, name').in('id', slice);
    if (prErr) throw new Error(prErr.message);
    projectNames.push(...(prs || []));
  }
  const nameByProjectId = Object.fromEntries((projectNames || []).map((p) => [p.id, p.name || 'Project']));

  const rows = userIds.map((userId) => {
    const pids = [...(userProjects.get(userId) || [])];
    const prof = profileById[userId];
    const projects = pids
      .map((id) => ({ id, name: nameByProjectId[id] || 'Project' }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return {
      userId,
      workspaceRole: cfg.workspaceRole,
      name: prof?.full_name?.trim() || cfg.defaultName,
      email: prof?.contact_email?.trim() || null,
      phone: prof?.phone?.trim() || null,
      avatarProfile: {
        full_name: prof?.full_name?.trim() || cfg.defaultName,
        role: prof?.role || cfg.workspaceRole,
        avatar_path: prof?.avatar_path || null,
      },
      projects,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  if (audience === 'client_team_member') {
    const clientNameById = {};
    const clientsByProject = new Map();

    if (rows.length > 0 && projectIds.length > 0) {
      const { data: allClients, error: clientErr } = await admin
        .from('erp_profiles')
        .select('id, full_name')
        .eq('role', 'client');
      if (clientErr) throw new Error(clientErr.message);

      for (const c of allClients || []) {
        if (c?.id) clientNameById[c.id] = c.full_name?.trim() || 'Client';
      }

      for (let i = 0; i < projectIds.length; i += CHUNK) {
        const slice = projectIds.slice(i, i + CHUNK);
        const { data: pmRows, error: pmErr } = await admin
          .from('erp_project_members')
          .select('user_id, project_id, role')
          .in('project_id', slice)
          .eq('role', 'client');
        if (pmErr) throw new Error(pmErr.message);
        for (const m of pmRows || []) {
          if (!m.project_id || !m.user_id || !clientNameById[m.user_id]) continue;
          if (!clientsByProject.has(m.project_id)) clientsByProject.set(m.project_id, new Set());
          clientsByProject.get(m.project_id).add(m.user_id);
        }
      }
    }

    for (const row of rows) {
      const pids = [...(userProjects.get(row.userId) || [])];
      const ownerIds = new Set();
      for (const pid of pids) {
        for (const cid of clientsByProject.get(pid) || []) ownerIds.add(cid);
      }
      row.clientOf = [...ownerIds]
        .map((id) => clientNameById[id])
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
  }

  return rows;
}

/**
 * Workspace client directories (RBAC `clients` → view).
 * Query: `?audience=client` (default) | `client_team_member`
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'clients', 'view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rawAudience = String(request.nextUrl.searchParams.get('audience') || 'client')
    .trim()
    .toLowerCase();
  const audience = rawAudience === 'client_team_member' ? 'client_team_member' : 'client';

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const rows = await buildClientDirectoryRows(admin, audience);
    return NextResponse.json({
      ok: true,
      audience,
      audienceLabel: ERP_WORKSPACE_ROLE_LABELS[audience] || audience,
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load clients';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
