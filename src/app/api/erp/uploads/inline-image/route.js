import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../../../../lib/erp-upload-limits';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INLINE_SIGN_SECONDS = 60 * 60 * 24 * 365;

function safeFolder(raw) {
  const s = String(raw || 'inline')
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9_\-/]/g, '')
    .replace(/^\/+|\/+$/g, '');
  return s.slice(0, 120) || 'inline';
}

function safeImageExt(file) {
  const fromName = String(file?.name || '').split('.').pop() || '';
  const cleaned = fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned) return cleaned.slice(0, 8);
  const mime = String(file?.type || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'png';
}

/**
 * Server-side inline image upload for description editors (paste / drop).
 * Uses service role so storage RLS cannot block authenticated ERP users.
 *
 * FormData: file (required), folder (optional), projectId (optional UUID)
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

  const file = form.get('file');
  const folder = safeFolder(form.get('folder'));
  const projectId = String(form.get('projectId') || '').trim();

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (typeof file.size !== 'number' || file.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > ERP_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Image is too large. Max ${ERP_MAX_UPLOAD_MB} MB.` },
      { status: 413 },
    );
  }
  const contentType = typeof file.type === 'string' && file.type ? file.type : '';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  if (projectId) {
    if (!UUID_RE.test(projectId)) {
      return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
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
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const ext = safeImageExt(file);
  const key = randomUUID();
  const path = projectId
    ? `${projectId}/${user.id}/inline/${folder}/${key}.${ext}`
    : `inline/${user.id}/${folder}/${key}.${ext}`;

  let buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
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

  const { data: signed, error: signErr } = await admin.storage
    .from('erp-files')
    .createSignedUrl(path, INLINE_SIGN_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'Could not sign image URL' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl, path });
}
