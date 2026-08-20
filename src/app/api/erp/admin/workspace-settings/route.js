import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';
import { erpRbacCan } from '../../../../../lib/erp-rbac-modules';
import {
  fetchWorkspaceSettingsFromDb,
  saveWorkspaceAttendancePolicy,
} from '../../../../../lib/erp-workspace-settings-server';
import { normalizeAttendancePolicy } from '../../../../../lib/erp-workspace-settings';

export const runtime = 'nodejs';

/** GET — full workspace settings for admin UI. */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'settings', 'view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = await fetchWorkspaceSettingsFromDb();
  return NextResponse.json({ ok: true, ...settings });
}

/**
 * PATCH body: { attendancePolicy: { ... } }
 */
export async function PATCH(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'settings', 'edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const attendancePolicy = normalizeAttendancePolicy(body?.attendancePolicy || body?.attendance_policy);
  const result = await saveWorkspaceAttendancePolicy(attendancePolicy, user.id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result.settings });
}
