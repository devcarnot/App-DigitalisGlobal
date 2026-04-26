import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { restoreTrashItem } from '../../../../../../lib/erp-trash-server';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = typeof params?.id === 'string' ? params.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const out = await restoreTrashItem(admin, id);
  if (!out.ok) {
    return NextResponse.json({ error: out.error || 'Could not restore' }, { status: out.error === 'not_found' ? 404 : 400 });
  }

  return NextResponse.json({ ok: true });
}
