import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../../lib/erp-project-id';
import { movePathsToTrash } from '../../../../../../../lib/erp-trash-server';
import { canEditChatMessageByAge } from '../../../../../../../lib/erp-message-edit-window';
import { ERP_CHAT_DELETED_PLACEHOLDER } from '../../../../../../../lib/erp-chat-deleted-copy';

export async function PATCH(request, { params }) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  const messageId = typeof params?.messageId === 'string' ? params.messageId : null;
  if (!projectId || !messageId || !isValidErpProjectId(projectId) || !isValidErpProjectId(messageId)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  let bodyJson;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof bodyJson?.body !== 'string') {
    return NextResponse.json({ error: 'body must be a string' }, { status: 400 });
  }
  const nextBody = bodyJson.body.trim();

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: msg, error: selErr } = await admin
    .from('erp_messages')
    .select('id, project_id, user_id, created_at, body, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!msg || msg.project_id !== projectId) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (msg.deleted_at) {
    return NextResponse.json({ error: 'This message was deleted' }, { status: 400 });
  }
  if (msg.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canEditChatMessageByAge(msg.created_at)) {
    return NextResponse.json({ error: 'This message can no longer be edited (30 minute limit).' }, { status: 400 });
  }

  const editedAt = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from('erp_messages')
    .update({ body: nextBody, edited_at: editedAt })
    .eq('id', messageId)
    .select('id,project_id,channel_id,user_id,body,attachments,created_at,reply_to_id,edited_at,deleted_at')
    .maybeSingle();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, message: updated });
}

export async function DELETE(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!profile) {
    return NextResponse.json({ error: 'Profile required' }, { status: 403 });
  }

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  const messageId = typeof params?.messageId === 'string' ? params.messageId : null;
  if (!projectId || !messageId || !isValidErpProjectId(projectId) || !isValidErpProjectId(messageId)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: msg, error: selErr } = await admin
    .from('erp_messages')
    .select('id, project_id, user_id, attachments, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!msg || msg.project_id !== projectId) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const isSuperAdmin = profile.role === 'admin';
  const isAuthor = msg.user_id === user.id;
  if (!isSuperAdmin && !isAuthor) {
    return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
  }
  if (msg.deleted_at) {
    const { data: row } = await admin
      .from('erp_messages')
      .select('id,project_id,channel_id,user_id,body,attachments,created_at,reply_to_id,edited_at,deleted_at')
      .eq('id', messageId)
      .maybeSingle();
    return NextResponse.json({ ok: true, message: row });
  }

  const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
  const trashItems = atts
    .filter((a) => a?.path)
    .map((a) => ({
      path: String(a.path),
      display_name: typeof a?.name === 'string' ? a.name : String(a.path).split('/').pop(),
      mime: typeof a?.mime === 'string' ? a.mime : null,
      source_kind: 'project_chat_attachment',
      source_meta: { project_id: projectId, message_id: messageId },
    }));
  if (trashItems.length > 0) {
    await movePathsToTrash(admin, { deletedById: user.id, items: trashItems });
  }

  // Reactions table has FK cascade but may be denormalized; delete explicitly.
  await admin.from('erp_message_reactions').delete().eq('message_id', messageId);

  const deletedAt = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from('erp_messages')
    .update({
      deleted_at: deletedAt,
      body: ERP_CHAT_DELETED_PLACEHOLDER,
      attachments: [],
      edited_at: null,
    })
    .eq('id', messageId)
    .select('id,project_id,channel_id,user_id,body,attachments,created_at,reply_to_id,edited_at,deleted_at')
    .maybeSingle();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: updated });
}

