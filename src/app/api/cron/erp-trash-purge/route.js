import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { purgeExpiredTrash, purgeExpiredSoftDeletedProjects } from '../../../../lib/erp-trash-server';

export const runtime = 'nodejs';

function cronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const q = request.nextUrl?.searchParams?.get('secret');
  return header === secret || bearer === secret || q === secret;
}

async function runPurge() {
  const admin = createSupabaseAdmin();
  if (!admin) return { status: 500, body: { error: 'Server misconfigured' } };
  const out = await purgeExpiredTrash(admin);
  if (!out.ok) {
    return { status: 500, body: { error: out.error || 'Purge failed' } };
  }
  const projs = await purgeExpiredSoftDeletedProjects(admin);
  if (!projs.ok) {
    return { status: 500, body: { error: projs.error || 'Project purge failed' } };
  }
  return { status: 200, body: { ok: true, removed: out.removed, purgedProjects: projs.purged } };
}

/** POST or GET (Vercel Cron uses GET): header x-cron-secret, Bearer CRON_SECRET, or ?secret= */
export async function POST(request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { status, body } = await runPurge();
  return NextResponse.json(body, { status });
}

export async function GET(request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { status, body } = await runPurge();
  return NextResponse.json(body, { status });
}
