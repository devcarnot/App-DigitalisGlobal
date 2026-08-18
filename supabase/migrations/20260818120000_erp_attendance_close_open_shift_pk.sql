-- Allow members to close their own forgotten open shift from a prior work_date.

CREATE OR REPLACE FUNCTION public.erp_attendance_close_open_shift_pk(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.erp_attendance_days%ROWTYPE;
  v_add int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Missing attendance day id';
  END IF;

  SELECT * INTO v_row
  FROM public.erp_attendance_days
  WHERE id = p_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance day not found';
  END IF;

  IF v_row.check_in_at IS NULL THEN
    RAISE EXCEPTION 'Not checked in';
  END IF;

  IF v_row.check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already checked out';
  END IF;

  IF v_row.break_started_at IS NOT NULL THEN
    v_add := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_row.break_started_at)))::int);
    UPDATE public.erp_attendance_days
    SET
      break_started_at = NULL,
      break_seconds_total = COALESCE(break_seconds_total, 0) + COALESCE(v_add, 0)
    WHERE id = v_row.id AND user_id = v_uid;
  END IF;

  UPDATE public.erp_attendance_days
  SET check_out_at = now()
  WHERE id = v_row.id AND user_id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'id', v_row.id,
    'work_date', v_row.work_date
  );
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_close_open_shift_pk(uuid) IS
  'Member closes their own forgotten open shift from a prior work_date.';

GRANT EXECUTE ON FUNCTION public.erp_attendance_close_open_shift_pk(uuid) TO authenticated;
