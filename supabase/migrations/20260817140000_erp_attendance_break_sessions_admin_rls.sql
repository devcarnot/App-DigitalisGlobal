-- Allow attendance admins / team leads to read team break sessions (member detail sheet).

DROP POLICY IF EXISTS erp_attendance_break_sessions_select_admin ON public.erp_attendance_break_sessions;
CREATE POLICY erp_attendance_break_sessions_select_admin
  ON public.erp_attendance_break_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.erp_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.erp_profiles p
      JOIN public.erp_project_members me ON me.user_id = p.id
      JOIN public.erp_project_members them ON them.project_id = me.project_id
      WHERE p.id = auth.uid()
        AND p.role = 'team_lead'
        AND them.user_id = erp_attendance_break_sessions.user_id
    )
  );
