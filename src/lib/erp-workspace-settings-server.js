import { createSupabaseAdmin } from './supabase-admin';
import { workspaceSettingsFromRow } from './erp-workspace-settings';

/**
 * @returns {Promise<{ attendancePolicy: import('./erp-workspace-settings').ErpAttendancePolicy }>}
 */
export async function fetchWorkspaceSettingsFromDb() {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return workspaceSettingsFromRow(null);
  }

  const { data, error } = await admin
    .from('erp_workspace_settings')
    .select('attendance_policy')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('fetchWorkspaceSettingsFromDb', error.message);
    return workspaceSettingsFromRow(null);
  }

  return workspaceSettingsFromRow(data);
}

/**
 * @param {import('./erp-workspace-settings').ErpAttendancePolicy} attendancePolicy
 * @param {string | undefined | null} updatedBy
 */
export async function saveWorkspaceAttendancePolicy(attendancePolicy, updatedBy) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { error: 'Server misconfigured' };
  }

  const { data, error } = await admin
    .from('erp_workspace_settings')
    .upsert(
      {
        id: 1,
        attendance_policy: attendancePolicy,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || null,
      },
      { onConflict: 'id' },
    )
    .select('attendance_policy')
    .single();

  if (error) {
    return { error: error.message };
  }

  return { settings: workspaceSettingsFromRow(data) };
}
