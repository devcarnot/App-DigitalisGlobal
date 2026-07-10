import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import {
  buildForwardedBody,
  forwardDestinationPrefix,
  normalizeForwardAttachments,
} from '../../../../lib/erp-forward-message';

const BUCKET = 'erp-files';

function safeFileBase(name) {
  const s = String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 100);
  return s || 'file';
}

function buildDestPath(prefix, name) {
  return `${prefix}/${randomUUID()}_${safeFileBase(name)}`;
}

async function copyAttachment(admin, sourcePath, destPrefix, name, mime) {
  const destPath = buildDestPath(destPrefix, name);
  const { error: copyErr } = await admin.storage.from(BUCKET).copy(sourcePath, destPath);
  if (!copyErr) {
    return {
      path: destPath,
      name: String(name || 'file').slice(0, 200),
      mime: mime ? String(mime).slice(0, 120) : null,
    };
  }

  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(sourcePath);
  if (dlErr || !blob) {
    throw new Error(dlErr?.message || 'Could not read attachment');
  }

  const contentType = mime || blob.type || 'application/octet-stream';
  const { error: upErr } = await admin.storage.from(BUCKET).upload(destPath, blob, {
    upsert: false,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  return {
    path: destPath,
    name: String(name || 'file').slice(0, 200),
    mime: contentType.slice(0, 120),
  };
}

async function copyForwardAttachments(admin, attachments, destPrefix) {
  const copied = [];
  for (const att of attachments) {
    try {
      const row = await copyAttachment(admin, att.path, destPrefix, att.name, att.mime);
      copied.push(row);
    } catch {
      // Skip individual files that no longer exist or cannot be copied.
    }
  }
  return copied;
}

/** POST — forward a message to a DM, group, or project channel. */
export async function POST(request) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
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

  const destinationType = body?.destination?.type;
  const sourceBody = typeof body?.source?.body === 'string' ? body.source.body : '';
  const senderName = typeof body?.source?.senderName === 'string' ? body.source.senderName : '';
  const sourceAttachments = normalizeForwardAttachments(body?.source?.attachments);

  if (!['person', 'group', 'channel'].includes(destinationType)) {
    return NextResponse.json({ error: 'Invalid destination type' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const userClient = createSupabaseUserClient(token);
  if (!userClient) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let destPrefix = null;
  let insertTable = null;
  let insertRow = null;

  if (destinationType === 'person') {
    const recipientId = typeof body?.destination?.recipientId === 'string' ? body.destination.recipientId : '';
    if (!recipientId || recipientId === user.id) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
    }
    const { data: recipient, error: rErr } = await admin
      .from('erp_profiles')
      .select('id')
      .eq('id', recipientId)
      .maybeSingle();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });
    if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

    destPrefix = forwardDestinationPrefix({ type: 'person', userId: user.id, recipientId });
    insertTable = 'erp_direct_messages';
    insertRow = {
      sender_id: user.id,
      recipient_id: recipientId,
    };
  } else if (destinationType === 'group') {
    const groupId = typeof body?.destination?.groupId === 'string' ? body.destination.groupId : '';
    if (!groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 });

    const { data: membership, error: mErr } = await userClient
      .from('erp_message_group_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
    if (!membership) return NextResponse.json({ error: 'Not a group member' }, { status: 403 });

    destPrefix = forwardDestinationPrefix({ type: 'group', groupId });
    insertTable = 'erp_group_messages';
    insertRow = {
      group_id: groupId,
      sender_id: user.id,
    };
  } else {
    const projectId = typeof body?.destination?.projectId === 'string' ? body.destination.projectId : '';
    const channelId = typeof body?.destination?.channelId === 'string' ? body.destination.channelId : '';
    if (!projectId || !channelId) {
      return NextResponse.json({ error: 'projectId and channelId required' }, { status: 400 });
    }

    const { data: membership, error: pErr } = await userClient
      .from('erp_project_members')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
    if (!membership) return NextResponse.json({ error: 'Not a project member' }, { status: 403 });

    const { data: channel, error: chErr } = await userClient
      .from('erp_project_channels')
      .select('id, project_id')
      .eq('id', channelId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (chErr) return NextResponse.json({ error: chErr.message }, { status: 400 });
    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 403 });

    destPrefix = forwardDestinationPrefix({ type: 'channel', userId: user.id, projectId });
    insertTable = 'erp_messages';
    insertRow = {
      project_id: projectId,
      channel_id: channelId,
      user_id: user.id,
    };
  }

  const forwardedBody = buildForwardedBody({ body: sourceBody, senderName });
  const copiedAttachments = sourceAttachments.length
    ? await copyForwardAttachments(admin, sourceAttachments, destPrefix)
    : [];

  if (!String(sourceBody || '').trim() && copiedAttachments.length === 0) {
    return NextResponse.json({ error: 'Nothing to forward' }, { status: 400 });
  }

  insertRow.body = forwardedBody;
  if (copiedAttachments.length) {
    insertRow.attachments = copiedAttachments;
  }

  const { data: inserted, error: insErr } = await admin
    .from(insertTable)
    .insert(insertRow)
    .select('id')
    .maybeSingle();

  if (insErr) {
    if (copiedAttachments.length) {
      const paths = copiedAttachments.map((a) => a.path).filter(Boolean);
      if (paths.length) {
        await admin.storage.from(BUCKET).remove(paths).catch(() => {});
      }
    }
    return NextResponse.json({ error: insErr.message || 'Could not forward message' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    messageId: inserted?.id || null,
    destinationType,
  });
}
