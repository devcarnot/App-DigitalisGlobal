import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { assertCanDisposeStoragePath, movePathsToTrash } from '../../../../../lib/erp-trash-server';

export const runtime = 'nodejs';

/**
 * Move storage objects to trash (validates path ownership / admin scope).
 */
export async function POST(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems
    .map((x) => ({
      path: typeof x?.path === 'string' ? x.path.trim() : '',
      display_name: typeof x?.display_name === 'string' ? x.display_name : undefined,
      mime: typeof x?.mime === 'string' ? x.mime : undefined,
      source_kind: typeof x?.source_kind === 'string' ? x.source_kind : 'unknown',
      source_meta: x?.source_meta && typeof x.source_meta === 'object' ? x.source_meta : {},
    }))
    .filter((x) => x.path);

  if (items.length === 0) {
    return NextResponse.json({ error: 'No items' }, { status: 400 });
  }
  if (items.length > 100) {
    return NextResponse.json({ error: 'Too many items (max 100)' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  for (const it of items) {
    const ok = await assertCanDisposeStoragePath(admin, profile, user.id, it.path);
    if (!ok) {
      return NextResponse.json({ error: `Not allowed to delete: ${it.path}` }, { status: 403 });
    }
  }

  const results = await movePathsToTrash(admin, { deletedById: user.id, items });
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    results,
    errors: failed.map((f) => ({ path: f.path, error: f.error })),
  });
}
