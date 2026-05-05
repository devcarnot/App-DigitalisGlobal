import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpRbacCan } from '../../../../../lib/erp-rbac-modules';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';

export const runtime = 'nodejs';

const CHUNK = 80;

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
 * Full workspace client directory (same data Super Admin sees).
 * Authorized by RBAC module `clients` → view, not by sharing a project with each client.
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

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const { data: allClients, error: allErr } = await admin
      .from('erp_profiles')
      .select('id, full_name, role, phone, contact_email, avatar_path')
      .eq('role', 'client');
    if (allErr) throw new Error(allErr.message);

    const clientByUser = new Map();
    for (const p of allClients || []) {
      if (p?.id) clientByUser.set(p.id, new Set());
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
        if (m?.role !== 'client' || !m.user_id || !m.project_id) continue;
        if (!clientByUser.has(m.user_id)) clientByUser.set(m.user_id, new Set());
        clientByUser.get(m.user_id).add(m.project_id);
      }
    }

    const clientIds = [...clientByUser.keys()];
    if (clientIds.length === 0) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const directProfileById = Object.fromEntries((allClients || []).map((p) => [p.id, p]));
    const idsNeedingProfile = clientIds.filter((id) => !directProfileById[id]);
    let profiles = [...(allClients || [])];
    for (let i = 0; i < idsNeedingProfile.length; i += CHUNK) {
      const slice = idsNeedingProfile.slice(i, i + CHUNK);
      const { data: profs, error: pErr } = await admin
        .from('erp_profiles')
        .select('id, full_name, role, phone, contact_email, avatar_path')
        .in('id', slice);
      if (pErr) throw new Error(pErr.message);
      profiles.push(...(profs || []));
    }
    const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

    const allPid = new Set();
    for (const set of clientByUser.values()) {
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

    const rows = clientIds.map((userId) => {
      const pids = [...(clientByUser.get(userId) || [])];
      const prof = profileById[userId];
      const projects = pids
        .map((id) => ({ id, name: nameByProjectId[id] || 'Project' }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      return {
        userId,
        name: prof?.full_name?.trim() || 'Client',
        email: prof?.contact_email?.trim() || null,
        phone: prof?.phone?.trim() || null,
        avatarProfile: {
          full_name: prof?.full_name?.trim() || 'Client',
          role: 'client',
          avatar_path: prof?.avatar_path || null,
        },
        projects,
      };
    });

    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load clients';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
