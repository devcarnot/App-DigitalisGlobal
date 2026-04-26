import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isPushConfigured } from '../../../../../lib/erp-push-server';

export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subscription = body?.subscription;
  if (!subscription || typeof subscription !== 'object') {
    return NextResponse.json({ error: 'subscription required' }, { status: 400 });
  }
  const endpoint = subscription?.endpoint;
  if (!endpoint || typeof endpoint !== 'string') {
    return NextResponse.json({ error: 'subscription.endpoint required' }, { status: 400 });
  }

  const keys = subscription?.keys || {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : null;
  const auth = typeof keys.auth === 'string' ? keys.auth : null;

  const ua = request.headers.get('user-agent') || null;

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  // Upsert with admin to avoid any RLS edge cases.
  const { error: upErr } = await admin.from('erp_push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      subscription,
      user_agent: ua,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  );

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Touch profile last_active_at via user client (keeps semantics consistent).
  const supabase = createSupabaseUserClient(accessToken);
  await supabase.from('erp_profiles').update({ last_active_at: new Date().toISOString() }).eq('id', user.id);

  return NextResponse.json({ ok: true });
}

