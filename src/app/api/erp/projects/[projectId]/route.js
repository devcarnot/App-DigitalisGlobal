import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { isValidErpProjectId } from '../../../../../lib/erp-project-id';
import { ERP_TRASH_RETENTION_DAYS } from '../../../../../lib/erp-trash-constants';
import { normalizeTaskPriority } from '../../../../../lib/erp-task-priority';

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

export async function DELETE(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }
  if (!profile || !['admin', 'team_lead'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only admins and team leads can delete projects' }, { status: 403 });
  }

  const projectId = params?.projectId;
  if (!projectId || typeof projectId !== 'string' || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: row, error: selErr } = await supabase.from('erp_projects').select('id, name').eq('id', projectId).maybeSingle();
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
  }

  const now = new Date();
  const retentionMs = Number(ERP_TRASH_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const purgeAt = new Date(now.getTime() + retentionMs).toISOString();
  const nowIso = now.toISOString();

  // Soft delete: keep DB row + file paths; appears in admin Trash; purge cron removes after retention.
  const { error: upErr } = await supabase
    .from('erp_projects')
    .update({ deleted_at: nowIso, deleted_by: user.id, purge_at: purgeAt, updated_at: nowIso })
    .eq('id', projectId)
    .is('deleted_at', null);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deletedId: projectId, trashed: true, purgeAt });
}

export async function PATCH(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const projectId = params?.projectId;
  if (!projectId || typeof projectId !== 'string' || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Allow: admins/team leads, or project_lead on this project.
  let allowed = Boolean(profile && ['admin', 'team_lead'].includes(profile.role));
  if (!allowed) {
    const { data: mem } = await supabase
      .from('erp_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    allowed = mem?.role === 'project_lead';
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Not allowed to edit this project' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const projectTypeIdsRaw = Array.isArray(body.projectTypeIds) ? body.projectTypeIds : null;
  const startDateRaw = body.start_date;
  const deadlineDateRaw = body.deadline_date;
  const priorityRaw = body.priority;

  const patch = { updated_at: new Date().toISOString() };
  if (priorityRaw !== undefined && priorityRaw !== null) {
    patch.priority = normalizeTaskPriority(String(priorityRaw));
  }
  if (name != null) {
    if (!name) return NextResponse.json({ error: 'Project name required' }, { status: 400 });
    if (name.length > 160) return NextResponse.json({ error: 'Project name too long' }, { status: 400 });
    patch.name = name;
  }
  if (description != null) {
    patch.description = description || null;
  }

  // Date-only fields (YYYY-MM-DD) — allow null/empty to clear.
  if (startDateRaw !== undefined) {
    if (startDateRaw === null || startDateRaw === '') {
      patch.start_date = null;
    } else if (typeof startDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDateRaw.trim())) {
      patch.start_date = startDateRaw.trim();
    } else {
      return NextResponse.json({ error: 'start_date must be YYYY-MM-DD or null' }, { status: 400 });
    }
  }
  if (deadlineDateRaw !== undefined) {
    if (deadlineDateRaw === null || deadlineDateRaw === '') {
      patch.deadline_date = null;
    } else if (typeof deadlineDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadlineDateRaw.trim())) {
      patch.deadline_date = deadlineDateRaw.trim();
    } else {
      return NextResponse.json({ error: 'deadline_date must be YYYY-MM-DD or null' }, { status: 400 });
    }
  }

  if (projectTypeIdsRaw != null) {
    let ids = uniqStrings(projectTypeIdsRaw);
    if (ids.length === 0) ids = ['custom'];
    try {
      const { data: typeRows, error: tErr } = await supabase
        .from('erp_project_type_options')
        .select('id')
        .in('id', ids)
        .limit(200);
      if (tErr) throw tErr;
      const allowed = new Set((typeRows || []).map((r) => String(r.id)));
      const finalIds = ids.filter((id) => allowed.has(id));
      patch.project_type_ids = finalIds.length ? finalIds : ['custom'];
      patch.project_type = (finalIds[0] || 'custom');
    } catch {
      // If options table isn't deployed yet, keep legacy behavior.
      patch.project_type_ids = ids;
      patch.project_type = (ids[0] || 'custom');
    }
  }

  const pathPrefix = `${projectId}/`;
  if (body.description_attachments !== undefined && body.description_attachments !== null) {
    const raw = body.description_attachments;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'description_attachments must be an array' }, { status: 400 });
    }
    if (raw.length > 30) {
      return NextResponse.json({ error: 'Too many brief attachments' }, { status: 400 });
    }
    const cleaned = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        return NextResponse.json({ error: 'Invalid attachment entry' }, { status: 400 });
      }
      const p = typeof item.path === 'string' ? item.path.trim() : '';
      const nm = typeof item.name === 'string' ? item.name.trim().slice(0, 240) : '';
      if (!p || !nm) {
        return NextResponse.json({ error: 'Each attachment needs path and name' }, { status: 400 });
      }
      if (p.includes('..') || !p.startsWith(pathPrefix)) {
        return NextResponse.json({ error: 'Invalid attachment path' }, { status: 400 });
      }
      const mime =
        typeof item.mime === 'string' && item.mime.trim()
          ? item.mime.trim().slice(0, 120)
          : 'application/octet-stream';
      cleaned.push({ path: p, name: nm, mime });
    }
    patch.description_attachments = cleaned;
  }

  const { data: updated, error: upErr } = await supabase
    .from('erp_projects')
    .update(patch)
    .eq('id', projectId)
    .select('*')
    .maybeSingle();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: updated });
}
