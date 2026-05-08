import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { movePathsToTrash } from '../../../../../../lib/erp-trash-server';
import { isValidErpProjectId } from '../../../../../../lib/erp-project-id';
import { canEditChatMessageByAge } from '../../../../../../lib/erp-message-edit-window';

export async function PATCH(request, { params }) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  const messageId = typeof params?.messageId === 'string' ? params.messageId : null;
  if (!messageId || !isValidErpProjectId(messageId)) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });
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
    .from('erp_group_messages')
    .select('id, sender_id, created_at, kind, body, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (msg.deleted_at) {
    return NextResponse.json({ error: 'This message was deleted' }, { status: 400 });
  }
  if (msg.kind === 'call') return NextResponse.json({ error: 'This message cannot be edited' }, { status: 400 });
  if (msg.sender_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canEditChatMessageByAge(msg.created_at)) {
    return NextResponse.json({ error: 'This message can no longer be edited (30 minute limit).' }, { status: 400 });
  }

  const editedAt = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from('erp_group_messages')
    .update({ body: nextBody, edited_at: editedAt })
    .eq('id', messageId)
    .select('id, group_id, sender_id, body, created_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, edited_at, deleted_at')
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

  const messageId = typeof params?.messageId === 'string' ? params.messageId : null;
  if (!messageId) return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: msg, error: selErr } = await admin
    .from('erp_group_messages')
    .select('id, sender_id, attachment_path, attachment_name, attachment_mime, attachments, kind, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const isSuperAdmin = profile.role === 'admin';
  const isAuthor = msg.sender_id === user.id;
  if (!isSuperAdmin && !isAuthor) {
    return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
  }

  if (msg.kind === 'call') {
    const items = [];
    const seenCall = new Set();
    const pushCall = (path, nameHint, mimeHint) => {
      const p = path ? String(path).trim() : '';
      if (!p || seenCall.has(p)) return;
      seenCall.add(p);
      items.push({
        path: p,
        display_name: (nameHint && String(nameHint).trim()) || p.split('/').pop() || 'attachment',
        mime: mimeHint || null,
        source_kind: 'group_dm_attachment',
        source_meta: { message_id: messageId },
      });
    };
    if (Array.isArray(msg.attachments)) {
      for (const a of msg.attachments) {
        if (a && typeof a === 'object') {
          pushCall(a.path, a.name, a.mime);
        }
      }
    }
    pushCall(msg.attachment_path, msg.attachment_name, msg.attachment_mime);
    if (items.length) {
      await movePathsToTrash(admin, { deletedById: user.id, items });
    }
    const { error: delErr } = await admin.from('erp_group_messages').delete().eq('id', messageId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (msg.deleted_at) {
    const { data: row } = await admin
      .from('erp_group_messages')
      .select('id, group_id, sender_id, body, created_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, edited_at, deleted_at')
      .eq('id', messageId)
      .maybeSingle();
    return NextResponse.json({ ok: true, message: row });
  }

  const items = [];
  const seen = new Set();
  const pushPath = (path, nameHint, mimeHint) => {
    const p = path ? String(path).trim() : '';
    if (!p || seen.has(p)) return;
    seen.add(p);
    items.push({
      path: p,
      display_name: (nameHint && String(nameHint).trim()) || p.split('/').pop() || 'attachment',
      mime: mimeHint || null,
      source_kind: 'group_dm_attachment',
      source_meta: { message_id: messageId },
    });
  };
  if (Array.isArray(msg.attachments)) {
    for (const a of msg.attachments) {
      if (a && typeof a === 'object') {
        pushPath(a.path, a.name, a.mime);
      }
    }
  }
  pushPath(msg.attachment_path, msg.attachment_name, msg.attachment_mime);
  if (items.length) {
    await movePathsToTrash(admin, { deletedById: user.id, items });
  }

  const deletedAt = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from('erp_group_messages')
    .update({
      deleted_at: deletedAt,
      body: '',
      attachment_path: null,
      attachment_name: null,
      attachment_mime: null,
      attachments: [],
      edited_at: null,
    })
    .eq('id', messageId)
    .select('id, group_id, sender_id, body, created_at, attachment_path, attachment_name, attachment_mime, attachments, kind, meta, edited_at, deleted_at')
    .maybeSingle();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: updated });
}

