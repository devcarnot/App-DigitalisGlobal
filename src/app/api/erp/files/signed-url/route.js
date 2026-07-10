import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

function isSafeStoragePath(path) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) return false;
  return true;
}

/** POST — sign an erp-files path for the authenticated ERP user (service role). */
export async function POST(request) {
  const { user, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const path = typeof body?.path === 'string' ? body.path.trim() : '';
  if (!isSafeStoragePath(path)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data, error: signErr } = await admin.storage.from('erp-files').createSignedUrl(path, 3600);
  if (signErr || !data?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'Could not sign URL' }, { status: 400 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
