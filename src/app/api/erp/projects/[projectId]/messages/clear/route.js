import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../../lib/erp-project-id';
import { movePathsToTrash } from '../../../../../../../lib/erp-trash-server';

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function POST(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete project chat messages' }, { status: 403 });
  }

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  if (!projectId || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const channelId = typeof body?.channelId === 'string' && body.channelId ? body.channelId : null;

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  if (channelId) {
    const { data: ch } = await admin
      .from('erp_project_channels')
      .select('id, project_id')
      .eq('id', channelId)
      .maybeSingle();
    if (!ch || ch.project_id !== projectId) {
      return NextResponse.json({ error: 'Invalid channel for project' }, { status: 400 });
    }
  }

  let q = admin.from('erp_messages').select('id, attachments').eq('project_id', projectId);
  if (channelId) q = q.eq('channel_id', channelId);

  const { data: msgs, error: selErr } = await q.order('created_at', { ascending: false }).limit(5000);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  const ids = (msgs || []).map((m) => m.id).filter(Boolean);

  const trashItems = [];
  for (const m of msgs || []) {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    for (const a of atts) {
      if (!a?.path) continue;
      trashItems.push({
        path: String(a.path),
        display_name: typeof a?.name === 'string' ? a.name : String(a.path).split('/').pop(),
        mime: typeof a?.mime === 'string' ? a.mime : null,
        source_kind: 'project_chat_attachment',
        source_meta: { project_id: projectId, message_id: m.id },
      });
    }
  }

  if (trashItems.length > 0) {
    for (const part of chunk(trashItems, 50)) {
      await movePathsToTrash(admin, { deletedById: user.id, items: part });
    }
  }

  if (ids.length > 0) {
    for (const part of chunk(ids, 200)) {
      await admin.from('erp_message_reactions').delete().in('message_id', part);
    }
  }

  // Delete messages.
  let dq = admin.from('erp_messages').delete().eq('project_id', projectId);
  if (channelId) dq = dq.eq('channel_id', channelId);
  const { error: delErr } = await dq;
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, deleted: ids.length, deletedAttachments: paths.length });
}

