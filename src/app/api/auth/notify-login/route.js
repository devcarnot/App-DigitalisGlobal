import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendLoginNotificationEmail } from '../../../../lib/erp-resend';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

const VALID_CONTEXTS = new Set(['admin', 'erp', 'invite']);

/** Best-effort throttle per user + context (serverless instances may not share memory). */
const loginEmailThrottle = new Map();
const THROTTLE_MS = 12 * 60 * 1000;

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
  if (admin) {
    const { data: prof } = await admin.from('erp_profiles').select('role').eq('id', user.id).maybeSingle();
    if (prof?.role) {
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
  }

  const key = `${user.id}:${context}`;
  const now = Date.now();
  const last = loginEmailThrottle.get(key) || 0;
  if (now - last < THROTTLE_MS) {
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
  }

  return NextResponse.json({ ok: r.ok, emailed: r.ok, error: r.error || undefined });
}
