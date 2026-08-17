-- Admin edit check-in/out with optional break total (seconds).

DROP FUNCTION IF EXISTS public.erp_attendance_admin_set_times(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.erp_attendance_admin_set_times(
  p_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz DEFAULT NULL,
  p_break_seconds_total integer DEFAULT NULL
)
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
  v_break int;
  v_gross int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_check_in_at IS NULL THEN
    RAISE EXCEPTION 'Check-in time is required';
  END IF;

  IF p_check_out_at IS NOT NULL AND p_check_out_at < p_check_in_at THEN
    RAISE EXCEPTION 'Check-out must be after check-in';
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

  IF p_break_seconds_total IS NOT NULL THEN
    v_break := GREATEST(0, p_break_seconds_total);
    IF p_check_out_at IS NOT NULL THEN
      v_gross := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_check_out_at - p_check_in_at)))::int);
      IF v_break > v_gross THEN
        RAISE EXCEPTION 'Break time cannot exceed shift duration';
      END IF;
    END IF;
  ELSE
    v_break := NULL;
  END IF;

  UPDATE public.erp_attendance_days
  SET
    check_in_at = p_check_in_at,
    check_out_at = p_check_out_at,
    break_seconds_total = COALESCE(v_break, break_seconds_total),
    break_started_at = CASE WHEN p_break_seconds_total IS NOT NULL THEN NULL ELSE break_started_at END
  WHERE id = p_id;

  RETURN json_build_object(
    'ok', true,
    'id', p_id,
    'user_id', v_row.user_id,
    'work_date', v_row.work_date
  );
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_admin_set_times(uuid, timestamptz, timestamptz, integer) IS
  'Super Admin or Team Manager updates check-in/out and optional break total (seconds). Clears active break when break total is set.';

GRANT EXECUTE ON FUNCTION public.erp_attendance_admin_set_times(uuid, timestamptz, timestamptz, integer) TO authenticated;
