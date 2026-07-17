-- Restrict undo checkout to 2 hours after check_out_at (security).

CREATE OR REPLACE FUNCTION public.erp_attendance_admin_undo_checkout_pk(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.erp_attendance_days%ROWTYPE;
  v_allowed boolean := false;
  v_undo_window interval := interval '2 hours';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role INTO v_role
  FROM public.erp_profiles p
  WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT * INTO v_row
  FROM public.erp_attendance_days
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance row not found';
  END IF;

  IF v_row.check_out_at IS NULL THEN
    RAISE EXCEPTION 'Member is not checked out';
  END IF;

  IF v_row.check_in_at IS NULL THEN
    RAISE EXCEPTION 'Missing check-in';
  END IF;

  IF now() > v_row.check_out_at + v_undo_window THEN
    RAISE EXCEPTION 'Undo checkout is only allowed within 2 hours of check-out';
  END IF;

  IF v_role = 'admin' THEN
    v_allowed := true;
  ELSIF v_role = 'team_lead' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.erp_project_members me
      JOIN public.erp_project_members them ON them.project_id = me.project_id
      WHERE me.user_id = v_uid
        AND them.user_id = v_row.user_id
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.erp_attendance_days
  SET
    check_out_at = NULL,
    break_started_at = NULL
  WHERE id = p_id;

  RETURN json_build_object(
    'ok', true,
    'id', p_id,
    'user_id', v_row.user_id,
    'work_date', v_row.work_date
  );
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_admin_undo_checkout_pk(uuid) IS
  'Super Admin or Team Manager clears check_out_at within 2 hours of checkout (shared-project scope for team leads).';
