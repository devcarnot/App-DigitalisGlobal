import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const withId = typeof body?.withId === 'string' ? body.withId.trim() : null;
  const groupId = typeof body?.groupId === 'string' ? body.groupId.trim() : null;
  if (!withId && !groupId) return NextResponse.json({ error: 'withId or groupId required' }, { status: 400 });
  if (withId) {
    if (!UUID_RE.test(withId)) return NextResponse.json({ error: 'Invalid withId' }, { status: 400 });
    if (withId === user.id) return NextResponse.json({ error: 'Invalid peer' }, { status: 400 });
  }
  if (groupId && !UUID_RE.test(groupId)) return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createSupabaseUserClient(accessToken);
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const now = new Date().toISOString();

  if (groupId) {
    const { error: upErr } = await supabase.from('erp_group_thread_clears').upsert(
      {
        user_id: user.id,
        group_id: groupId,
        cleared_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,group_id' },
    );
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    // Also mark as read "now" to reset unread counts (best-effort if schema exists).
    await supabase.from('erp_group_read_state').upsert(
      { user_id: user.id, group_id: groupId, last_read_at: now, updated_at: now },
      { onConflict: 'user_id,group_id' },
    );

    return NextResponse.json({ ok: true, cleared: true });
  }

  const { error: dmErr } = await supabase.from('erp_dm_thread_clears').upsert(
    {
      user_id: user.id,
      peer_id: withId,
      cleared_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id,peer_id' },
  );
  if (dmErr) return NextResponse.json({ error: dmErr.message }, { status: 400 });

  await supabase.from('erp_dm_read_state').upsert(
    { user_id: user.id, peer_id: withId, last_read_at: now, updated_at: now },
    { onConflict: 'user_id,peer_id' },
  );

  return NextResponse.json({ ok: true, cleared: true });
}

