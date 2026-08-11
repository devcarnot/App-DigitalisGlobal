import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { broadcastErpAnnouncement } from '../../../../lib/erp-announcements-server';
import { fetchMergedRbacGrantsForUser } from '../../../../lib/erp-rbac-server';
import { erpRbacCan } from '../../../../lib/erp-rbac-modules';
import { isErpGlobalAdmin } from '../../../../lib/erp-roles';
import { isSupabaseSchemaMissingError } from '../../../../lib/supabase-errors';
import { sanitizeRichBodyForPersist } from '../../../../lib/rich-text/rich-text-server';

export const runtime = 'nodejs';

const ANNOUNCEMENT_COLUMNS = 'id, title, body, body_format, created_by, created_at, updated_at';

function isMissingAnnouncementsTable(err) {
  if (isSupabaseSchemaMissingError(err)) return true;
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('erp_announcements');
}

/**
 * GET /api/erp/announcements
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'announcements', 'view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('erp_announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingAnnouncementsTable(error)) {
      return NextResponse.json({ announcements: [], authorsById: {}, notProvisioned: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = data || [];
  const authorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  const admin = createSupabaseAdmin();
  const reader = admin || supabase;
  /** @type {Record<string, { full_name?: string | null }>} */
  const authorsById = {};

  if (authorIds.length > 0) {
    const { data: profiles } = await reader
      .from('erp_profiles')
      .select('id, full_name')
      .in('id', authorIds);
    for (const p of profiles || []) {
      authorsById[p.id] = { full_name: p.full_name };
    }
  }

  return NextResponse.json({ announcements: rows, authorsById });
}

/**
 * POST /api/erp/announcements
 * body: { title, body }
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  if (!isErpGlobalAdmin(profile.role)) {
    return NextResponse.json({ error: 'Only Super Admin can post announcements' }, { status: 403 });
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

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const rawBody = typeof body.body === 'string' ? body.body.trim().slice(0, 12000) : '';
  const fmt = body.body_format === 'html' || rawBody.trimStart().startsWith('<') ? 'html' : 'markdown';
  const persisted = sanitizeRichBodyForPersist(rawBody, fmt);

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!persisted.body) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('erp_announcements')
    .insert({
      title,
      body: persisted.body,
      body_format: persisted.format,
      created_by: user.id,
    })
    .select(ANNOUNCEMENT_COLUMNS)
    .single();

  if (insErr || !inserted) {
    if (isMissingAnnouncementsTable(insErr)) {
      return NextResponse.json(
        {
          error:
            'Announcements table is not set up yet. Run migration 20260601120000_erp_announcements.sql in Supabase.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: insErr?.message || 'Could not publish announcement' }, { status: 400 });
  }

  const authorName =
    (profile.full_name && String(profile.full_name).trim()) || user.email || 'Super Admin';

  const broadcast = await broadcastErpAnnouncement({
    admin,
    announcement: inserted,
    authorName,
    authorId: user.id,
  });

  await admin.from('erp_activity_log').insert({
    project_id: null,
    user_id: user.id,
    action: 'announcement_posted',
    meta: {
      announcement_id: inserted.id,
      title,
      recipient_count: broadcast.recipients,
      emails_sent: broadcast.emailsSent,
    },
  });

  return NextResponse.json({
    announcement: inserted,
    broadcast,
  });
}
