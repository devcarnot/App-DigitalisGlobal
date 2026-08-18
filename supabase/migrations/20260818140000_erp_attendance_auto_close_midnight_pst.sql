-- Attendance work day rolls at midnight America/Los_Angeles (PST/PDT).
-- Stale open shifts (work_date before today) auto-close at that day's end (midnight LA).

CREATE OR REPLACE FUNCTION public.erp_work_date_pk()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('America/Los_Angeles', now()))::date;
$$;

COMMENT ON FUNCTION public.erp_work_date_pk() IS
  'Current ERP attendance work_date in America/Los_Angeles (midnight boundary).';

CREATE OR REPLACE FUNCTION public.erp_attendance_work_day_end_at(p_work_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ((p_work_date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles');
$$;

COMMENT ON FUNCTION public.erp_attendance_work_day_end_at(date) IS
  'Instant when an attendance work_date ends (next midnight in America/Los_Angeles).';

CREATE OR REPLACE FUNCTION public.erp_attendance_close_open_row_at(
  p_row public.erp_attendance_days,
  p_check_out_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_add int;
BEGIN
  IF p_row.check_in_at IS NULL OR p_row.check_out_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF p_row.break_started_at IS NOT NULL AND p_row.break_started_at < p_check_out_at THEN
    v_add := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (p_check_out_at - p_row.break_started_at)))::int
    );

    INSERT INTO public.erp_attendance_break_sessions (
      attendance_day_id,
      user_id,
      break_type,
      started_at,
      ended_at,
      duration_seconds
    ) VALUES (
      p_row.id,
      p_row.user_id,
      COALESCE(p_row.break_type, 'general'),
      p_row.break_started_at,
      p_check_out_at,
      COALESCE(v_add, 0)
    );

    UPDATE public.erp_attendance_days
    SET
      break_started_at = NULL,
      break_type = NULL,
      break_seconds_total = COALESCE(break_seconds_total, 0) + COALESCE(v_add, 0)
    WHERE id = p_row.id;
  END IF;

  UPDATE public.erp_attendance_days
  SET check_out_at = p_check_out_at
  WHERE id = p_row.id
    AND check_out_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_auto_close_stale_open_shifts(p_uid uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (public.erp_work_date_pk())::date;
  v_row public.erp_attendance_days%ROWTYPE;
  v_closed int := 0;
  v_day_end timestamptz;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.erp_attendance_days
    WHERE user_id = p_uid
      AND check_in_at IS NOT NULL
      AND check_out_at IS NULL
      AND work_date < v_today
    ORDER BY work_date ASC
    FOR UPDATE
  LOOP
    v_day_end := public.erp_attendance_work_day_end_at(v_row.work_date);
    PERFORM public.erp_attendance_close_open_row_at(v_row, v_day_end);
    v_closed := v_closed + 1;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'work_date', v_today,
    'closed_count', v_closed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_auto_close_all_stale_open_shifts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (public.erp_work_date_pk())::date;
  v_row public.erp_attendance_days%ROWTYPE;
  v_closed int := 0;
  v_day_end timestamptz;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.erp_attendance_days
    WHERE check_in_at IS NOT NULL
      AND check_out_at IS NULL
      AND work_date < v_today
    ORDER BY work_date ASC
    FOR UPDATE
  LOOP
    v_day_end := public.erp_attendance_work_day_end_at(v_row.work_date);
    PERFORM public.erp_attendance_close_open_row_at(v_row, v_day_end);
    v_closed := v_closed + 1;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'work_date', v_today,
    'closed_count', v_closed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_sync_pk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result json;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_result := public.erp_attendance_auto_close_stale_open_shifts(v_uid);

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_close_open_shift_pk(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.erp_attendance_days%ROWTYPE;
  v_today date := (public.erp_work_date_pk())::date;
  v_check_out timestamptz;
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

  v_check_out := CASE
    WHEN v_row.work_date < v_today THEN public.erp_attendance_work_day_end_at(v_row.work_date)
    ELSE now()
  END;

  PERFORM public.erp_attendance_close_open_row_at(v_row, v_check_out);

  RETURN json_build_object(
    'ok', true,
    'id', v_row.id,
    'work_date', v_row.work_date,
    'check_out_at', v_check_out
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_check_in_pk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wd date := (public.erp_work_date_pk())::date;
  v_id uuid;
  v_row public.erp_attendance_days%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.erp_attendance_auto_close_stale_open_shifts(v_uid);

  SELECT * INTO v_row
  FROM public.erp_attendance_days
  WHERE user_id = v_uid AND work_date = v_wd
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.check_in_at IS NOT NULL AND v_row.check_out_at IS NULL THEN
      RAISE EXCEPTION 'Already checked in';
    END IF;

    UPDATE public.erp_attendance_days
    SET
      check_in_at = now(),
      check_out_at = NULL
    WHERE id = v_row.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.erp_attendance_days (user_id, work_date, check_in_at)
    VALUES (v_uid, v_wd, now())
    RETURNING id INTO v_id;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id, 'work_date', v_wd);
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_auto_close_stale_open_shifts(uuid) IS
  'Close the caller''s open shifts from prior work_dates at midnight America/Los_Angeles.';

COMMENT ON FUNCTION public.erp_attendance_auto_close_all_stale_open_shifts() IS
  'Close every member''s stale open shifts (for scheduled jobs).';

COMMENT ON FUNCTION public.erp_attendance_sync_pk() IS
  'Sync attendance for the caller: auto-close stale open shifts and return today work_date.';

COMMENT ON FUNCTION public.erp_attendance_close_open_shift_pk(uuid) IS
  'Member closes an open shift; prior work_dates close at that day''s midnight LA time.';

COMMENT ON FUNCTION public.erp_attendance_check_in_pk() IS
  'Check in for today (America/Los_Angeles work_date), auto-closing stale open shifts first.';

GRANT EXECUTE ON FUNCTION public.erp_work_date_pk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_work_day_end_at(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_auto_close_stale_open_shifts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_sync_pk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_close_open_shift_pk(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_check_in_pk() TO authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'erp-attendance-auto-close-stale') THEN
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'erp-attendance-auto-close-stale';
    END IF;

    PERFORM cron.schedule(
      'erp-attendance-auto-close-stale',
      '5 * * * *',
      'SELECT public.erp_attendance_auto_close_all_stale_open_shifts()'
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron schema not available; skip attendance auto-close schedule';
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron functions not available; skip attendance auto-close schedule';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule attendance auto-close: %', SQLERRM;
END;
$cron$;
