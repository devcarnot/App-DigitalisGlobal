import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../lib/erp-project-id';

const MAX_IDS = 200;

/**
 * Marks inbound DMs as delivered (recipient only). Idempotent.
 */
export async function POST(request) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  let bodyJson;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = Array.isArray(bodyJson?.messageIds) ? bodyJson.messageIds : [];
  const messageIds = [...new Set(raw.filter((id) => typeof id === 'string' && isValidErpProjectId(id)))];
  if (messageIds.length === 0) {
    return NextResponse.json({ error: 'messageIds must be a non-empty array of UUIDs' }, { status: 400 });
  }
  if (messageIds.length > MAX_IDS) {
    return NextResponse.json({ error: `At most ${MAX_IDS} message ids` }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data: rows, error: selErr } = await sb
    .from('erp_direct_messages')
    .select('id')
    .eq('recipient_id', user.id)
    .in('id', messageIds)
    .is('recipient_delivered_at', null);

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });

  const okIds = (rows || []).map((r) => r.id).filter(Boolean);
  if (okIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from('erp_direct_messages')
    .update({ recipient_delivered_at: now })
    .in('id', okIds)
    .eq('recipient_id', user.id)
    .is('recipient_delivered_at', null);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, updated: okIds.length });
}
