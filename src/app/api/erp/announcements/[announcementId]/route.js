import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';
import { isSupabaseSchemaMissingError } from '../../../../../lib/supabase-errors';
import { sanitizeRichBodyForPersist } from '../../../../../lib/rich-text/rich-text-server';

export const runtime = 'nodejs';

const ANNOUNCEMENT_COLUMNS = 'id, title, body, body_format, created_by, created_at, updated_at';

function isMissingAnnouncementsTable(err) {
  if (isSupabaseSchemaMissingError(err)) return true;
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('erp_announcements');
}

function isMissingColumn(err, column) {
  if (!err) return false;
  if (err.code === '42703') return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes(`column "${column}"`) || msg.includes(`column ${column}`);
}

function parseAnnouncementFields(body) {
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const rawBody = typeof body?.body === 'string' ? body.body.trim().slice(0, 12000) : '';
  const fmt = body?.body_format === 'html' || rawBody.trimStart().startsWith('<') ? 'html' : 'markdown';
  const persisted = sanitizeRichBodyForPersist(rawBody, fmt);
  return { title, announcementBody: persisted.body, bodyFormat: persisted.format };
}

/**
 * PATCH /api/erp/announcements/[announcementId]
 * body: { title, body }
 */
export async function PATCH(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (!isErpGlobalAdmin(profile.role)) {
    return NextResponse.json({ error: 'Only Super Admin can edit announcements' }, { status: 403 });
  }

  const announcementId = params?.announcementId;
  if (!announcementId) {
    return NextResponse.json({ error: 'Missing announcement id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  const admin = createSupabaseAdmin();
  if (!supabase || !admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, announcementBody, bodyFormat } = parseAnnouncementFields(body);
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!announcementBody) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const patchWithUpdated = {
    title,
    body: announcementBody,
    body_format: bodyFormat,
    updated_at: nowIso,
  };
  const patchLegacy = {
    title,
    body: announcementBody,
  };

  let { data: updated, error: updErr } = await supabase
    .from('erp_announcements')
    .update(patchWithUpdated)
    .eq('id', announcementId)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();

  if (updErr && isMissingColumn(updErr, 'updated_at')) {
    ({ data: updated, error: updErr } = await supabase
      .from('erp_announcements')
      .update(patchLegacy)
      .eq('id', announcementId)
      .select('id, title, body, created_by, created_at')
      .single());
  }

  if (updErr) {
    if (isMissingAnnouncementsTable(updErr)) {
      return NextResponse.json({ error: 'Announcements table is not set up yet.' }, { status: 503 });
    }
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
  }

  await admin.from('erp_activity_log').insert({
    project_id: null,
    user_id: user.id,
    action: 'announcement_updated',
    meta: {
      announcement_id: updated.id,
      title,
    },
  });

  return NextResponse.json({ announcement: updated });
}

/**
 * DELETE /api/erp/announcements/[announcementId]
 */
export async function DELETE(request, { params }) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (!isErpGlobalAdmin(profile.role)) {
    return NextResponse.json({ error: 'Only Super Admin can delete announcements' }, { status: 403 });
  }

  const announcementId = params?.announcementId;
  if (!announcementId) {
    return NextResponse.json({ error: 'Missing announcement id' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { error } = await admin.from('erp_announcements').delete().eq('id', announcementId);
  if (error) {
    if (isMissingAnnouncementsTable(error)) {
      return NextResponse.json({ error: 'Announcements table is not set up yet.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
