import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { assertAdmin, duplicateInvoice, getAdminClient } from '../../../../../../../lib/erp-invoice-server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const id = typeof params?.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });

  try {
    const admin = getAdminClient();
    const bundle = await duplicateInvoice(admin, id, user.id);
    return NextResponse.json({ ok: true, ...bundle });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Duplicate failed' }, { status: ex?.status || 400 });
  }
}
