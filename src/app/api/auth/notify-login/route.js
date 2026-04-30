import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendLoginNotificationEmail } from '../../../../lib/erp-resend';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

const VALID_CONTEXTS = new Set(['admin', 'erp', 'invite']);

/** Fallback throttle when profile row is missing or column not migrated yet (fragile under serverless). */
const loginEmailThrottle = new Map();
const THROTTLE_MS = 12 * 60 * 60 * 1000;

/** Dedupe session_login activity rows (e.g. double notify from client). */
const loginActivityThrottle = new Map();
const LOGIN_ACTIVITY_THROTTLE_MS = 20 * 1000;

export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }
  const context = VALID_CONTEXTS.has(body.context) ? body.context : 'erp';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const supabaseAuth = createClient(url, anonKey);
  const {
    data: { user },
    error: userErr,
  } = await supabaseAuth.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  /** Profile row for throttle + activity (last_login_notify_at may be missing until migration runs). */
  let prof = null;
  if (admin) {
    let res = await admin
      .from('erp_profiles')
      .select('role,last_login_notify_at')
      .eq('id', user.id)
      .maybeSingle();
    if (
      res.error &&
      /last_login_notify_at|column/i.test(String(res.error.message || '').toLowerCase())
    ) {
      res = await admin.from('erp_profiles').select('role').eq('id', user.id).maybeSingle();
    }
    prof = res.data || null;
  }

  if (admin && prof?.role) {
    const nowAct = Date.now();
    const lastAct = loginActivityThrottle.get(user.id) || 0;
    if (nowAct - lastAct >= LOGIN_ACTIVITY_THROTTLE_MS) {
      const { error: actErr } = await admin.from('erp_activity_log').insert({
        project_id: null,
        user_id: user.id,
        action: 'session_login',
        meta: { context },
      });
      if (!actErr) loginActivityThrottle.set(user.id, nowAct);
      else console.warn('erp_activity_log session_login', actErr.message);
    }
  }

  const key = `${user.id}:${context}`;
  const now = Date.now();

  const lastNotifyIso = prof?.last_login_notify_at ? String(prof.last_login_notify_at) : null;
  if (lastNotifyIso) {
    const last = new Date(lastNotifyIso).getTime();
    if (Number.isFinite(last) && now - last < THROTTLE_MS) {
      return NextResponse.json({ ok: true, skipped: 'throttled_db' });
    }
  }

  const lastMem = loginEmailThrottle.get(key) || 0;
  if (!lastNotifyIso && now - lastMem < THROTTLE_MS) {
    return NextResponse.json({ ok: true, skipped: 'throttled' });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
  const userAgent = request.headers.get('user-agent') || null;

  const formattedWhen = new Date().toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const r = await sendLoginNotificationEmail({
    to: user.email,
    context,
    formattedWhen,
    ip,
    userAgent,
  });

  if (r.ok) {
    loginEmailThrottle.set(key, now);
    if (admin) {
      const up = await admin
        .from('erp_profiles')
        .update({ last_login_notify_at: new Date().toISOString() })
        .eq('id', user.id);
      if (
        up.error &&
        /last_login_notify_at|column/i.test(String(up.error.message || '').toLowerCase())
      ) {
        /* migration not applied yet */
      } else if (up.error) {
        console.warn('[notify-login] last_login_notify_at not saved:', up.error.message);
      }
    }
  } else if (r.error) {
    console.warn('[notify-login] email not sent:', r.error);
  }

  return NextResponse.json({ ok: r.ok, emailed: r.ok, error: r.error || undefined });
}
