import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { fetchWorkspaceSettingsFromDb } from '../../../../lib/erp-workspace-settings-server';

export const runtime = 'nodejs';

/** GET — workspace settings readable by any signed-in ERP user (attendance UI needs shift hours). */
export async function GET(request) {
  const { profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const settings = await fetchWorkspaceSettingsFromDb();
  return NextResponse.json({ ok: true, ...settings });
}
