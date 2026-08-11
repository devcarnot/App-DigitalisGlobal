import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';

export const runtime = 'nodejs';

/** GET: current user's merged RBAC matrix (for sidebar + actions). */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const roleKey = profile?.role || 'team_member';
  const merged = await fetchMergedRbacGrantsForUser(roleKey, user.id);
  return NextResponse.json({ ok: true, roleKey, grants: merged });
}
