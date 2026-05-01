/**
 * Profile fields needed across the ERP client (session context). Avoids `select('*')` on every load/refresh.
 * If you add a new `profile?.field` in the app, add the column here.
 */
export const ERP_PROFILE_SESSION_COLUMNS =
  'id,role,full_name,avatar_path,phone,contact_email,member_team,last_active_at,notify_sound,notify_push_dm,notify_push_project_mention';

/** For shallow equality checks (avoids JSON.stringify on every profile refresh). */
export const ERP_PROFILE_SESSION_COLUMN_KEYS = ERP_PROFILE_SESSION_COLUMNS.split(',').map((s) => s.trim());
