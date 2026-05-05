-- Optional break tracking for self check-in (pause working-time clock).
-- Safe to run after erp_attendance_days and erp_work_date_pk exist.

ALTER TABLE public.erp_attendance_days
  ADD COLUMN IF NOT EXISTS break_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_seconds_total integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.erp_attendance_days.break_started_at IS 'Start of current unpaid break; NULL when not on break.';
COMMENT ON COLUMN public.erp_attendance_days.break_seconds_total IS 'Accumulated break duration in seconds for this day.';

CREATE OR REPLACE FUNCTION public.erp_attendance_break_start_pk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wd date := (public.erp_work_date_pk())::date;
  v_id uuid;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_id
  FROM public.erp_attendance_days
  WHERE user_id = v_uid AND work_date = v_wd
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not checked in';
  END IF;

  UPDATE public.erp_attendance_days d
  SET break_started_at = now()
  WHERE d.id = v_id
    AND d.user_id = v_uid
    AND d.check_out_at IS NULL
    AND d.break_started_at IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Cannot start break (already on break, checked out, or wrong day)';
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_break_end_pk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wd date := (public.erp_work_date_pk())::date;
  v_id uuid;
  v_add int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - break_started_at)))::int)
  INTO v_id, v_add
  FROM public.erp_attendance_days
  WHERE user_id = v_uid AND work_date = v_wd AND break_started_at IS NOT NULL
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not on break';
  END IF;

  UPDATE public.erp_attendance_days
  SET
    break_started_at = NULL,
    break_seconds_total = COALESCE(break_seconds_total, 0) + COALESCE(v_add, 0)
  WHERE id = v_id AND user_id = v_uid;

  RETURN json_build_object('ok', true, 'id', v_id, 'added_seconds', v_add);
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_attendance_break_start_pk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_break_end_pk() TO authenticated;
