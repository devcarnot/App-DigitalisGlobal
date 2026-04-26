import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { movePathsToTrash } from '../../../../../../lib/erp-trash-server';

export async function DELETE(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete messages' }, { status: 403 });
  }

  const messageId = typeof params?.messageId === 'string' ? params.messageId : null;
  if (!messageId) return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: msg, error: selErr } = await admin
    .from('erp_direct_messages')
    .select('id, attachment_path, attachment_name, attachment_mime, attachments')
    .eq('id', messageId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

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
      source_kind: 'dm_attachment',
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

  const { error: delErr } = await admin.from('erp_direct_messages').delete().eq('id', messageId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

