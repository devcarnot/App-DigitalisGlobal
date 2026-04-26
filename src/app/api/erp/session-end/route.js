import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';

/** Dedupe session_logout rows if the client posts twice in a row. */
const logoutActivityThrottle = new Map();
const LOGOUT_ACTIVITY_THROTTLE_MS = 5000;

/** Records best-effort sign-out time on the ERP profile (before client clears session). */
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { user, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !token) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseUserClient(token);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase.from('erp_profiles').update({ last_sign_out_at: now }).eq('id', user.id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const admin = createSupabaseAdmin();
  if (admin) {
    const t = Date.now();
    const last = logoutActivityThrottle.get(user.id) || 0;
    if (t - last >= LOGOUT_ACTIVITY_THROTTLE_MS) {
      const { data: prof } = await admin.from('erp_profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role) {
        const { error: actErr } = await admin.from('erp_activity_log').insert({
          project_id: null,
          user_id: user.id,
          action: 'session_logout',
          meta: {},
        });
        if (!actErr) logoutActivityThrottle.set(user.id, t);
        else console.warn('erp_activity_log session_logout', actErr.message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
