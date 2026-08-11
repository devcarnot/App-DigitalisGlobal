import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../lib/erp-project-id';
import { sanitizeRichBodyForPersist } from '../../../../../../lib/rich-text/rich-text-server';

function normalizeChatAttachments(raw, projectId, userId) {
  if (!Array.isArray(raw)) return [];
  const prefix = `${projectId}/${userId}/chat/`;
  const out = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const path = String(a.path || '').trim();
    if (!path.startsWith(prefix)) continue;
    out.push({
      path,
      name: String(a.name || path.split('/').pop() || 'file').slice(0, 200),
      mime: a.mime ? String(a.mime).slice(0, 120) : null,
    });
    if (out.length >= 20) break;
  }
  return out;
}

/** POST: send a project channel message (service-role insert after access check). */
export async function POST(request, { params }) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  if (!projectId || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channelId = typeof body?.channelId === 'string' ? body.channelId.trim() : '';
  const text = typeof body?.body === 'string' ? body.body : '';
  const bodyFormat = body?.body_format ?? body?.bodyFormat ?? 'markdown';
  const { body: sanitizedBody, format: sanitizedFormat } = sanitizeRichBodyForPersist(text, bodyFormat);
  const replyToId = typeof body?.replyToId === 'string' ? body.replyToId.trim() : null;
  const attachments = normalizeChatAttachments(body?.attachments, projectId, user.id);

  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }
  if (!sanitizedBody.trim() && attachments.length === 0) {
    return NextResponse.json({ error: 'Message body or attachment required' }, { status: 400 });
  }

  const userClient = createSupabaseUserClient(token);
  if (!userClient) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: channel, error: chErr } = await userClient
    .from('erp_project_channels')
    .select('id, project_id')
    .eq('id', channelId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (chErr) {
    return NextResponse.json({ error: chErr.message }, { status: 400 });
  }
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found or access denied' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const insertRow = {
    project_id: projectId,
    channel_id: channelId,
    user_id: user.id,
    body: sanitizedBody,
    body_format: sanitizedFormat,
    attachments,
    ...(replyToId ? { reply_to_id: replyToId } : {}),
  };

  const { data: row, error: insErr } = await admin
    .from('erp_messages')
    .insert(insertRow)
    .select('id,project_id,channel_id,user_id,body,body_format,attachments,created_at,reply_to_id,edited_at,deleted_at')
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message || 'Could not send message' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: row });
}
