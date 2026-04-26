import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../../lib/erp-project-id';
import { movePathsToTrash } from '../../../../../../../lib/erp-trash-server';

export async function DELETE(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete project chat messages' }, { status: 403 });
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
    .select('id, project_id, attachments')
    .eq('id', messageId)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!msg || msg.project_id !== projectId) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

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

  const { error: delErr } = await admin.from('erp_messages').delete().eq('id', messageId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

