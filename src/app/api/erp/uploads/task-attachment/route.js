import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB, guessErpFileMime } from '../../../../../lib/erp-upload-limits';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCOPES = new Set(['task-main', 'brief', 'subtask', 'task-detail', 'chat']);

function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
}

/**
 * Generic server-side file upload for ERP project-scoped attachments.
 * Validates project membership via the user's RLS-scoped client (admins bypass),
 * then uploads with the service-role client so storage RLS / token-refresh races
 * can't silently drop files. Returns { path, name, mime } which the client forwards
 * to the task/project create endpoints.
 *
 * FormData fields:
 *  - projectId  (required, UUID)
 *  - file       (required, <= 10 MB)
 *  - scope      (optional: task-main | brief | subtask | task-detail: defaults to task-main)
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const projectId = String(form.get('projectId') || '').trim();
  const scopeRaw = String(form.get('scope') || 'task-main').trim();
  const scope = ALLOWED_SCOPES.has(scopeRaw) ? scopeRaw : 'task-main';
  const file = form.get('file');

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (typeof file.size !== 'number' || file.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > ERP_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Max ${ERP_MAX_UPLOAD_MB} MB per file.` },
      { status: 413 },
    );
  }

  const userClient = createSupabaseUserClient(token);
  if (!userClient) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!isErpGlobalAdmin(profile?.role)) {
    const { data: membership, error: memErr } = await userClient
      .from('erp_project_members')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 400 });
    }
    if (!membership) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
    }
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const cleanName = safeName(file.name);
  // randomUUID() guarantees uniqueness even when multiple files race through in the same ms.
  const key = randomUUID();
  const path = `${projectId}/${user.id}/${scope}/${key}_${cleanName}`;
  const contentType = guessErpFileMime(file);

  let buffer;
  try {
    const ab = await file.arrayBuffer();
    buffer = Buffer.from(ab);
  } catch {
    return NextResponse.json({ error: 'Could not read file' }, { status: 400 });
  }

  const { error: upErr } = await admin.storage.from('erp-files').upload(path, buffer, {
    upsert: false,
    contentType,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message || 'Upload failed' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    path,
    name: typeof file.name === 'string' ? file.name.slice(0, 200) : cleanName,
    mime: contentType,
    scope,
  });
}
