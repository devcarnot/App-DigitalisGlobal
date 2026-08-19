-- Simple attendance day rule (Asia/Karachi / GMT+5):
--   • work_date = calendar date in Asia/Karachi
--   • if you don't check out before midnight, the row stays check_in + NULL check_out → missing punch
--   • next calendar day: new check-in on the new work_date (no fake auto-checkout)

CREATE OR REPLACE FUNCTION public.erp_attendance_timezone()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'Asia/Karachi'::text;
$$;

COMMENT ON FUNCTION public.erp_attendance_timezone() IS
  'IANA timezone for ERP attendance calendar days (GMT+5).';

CREATE OR REPLACE FUNCTION public.erp_work_date_pk()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone(public.erp_attendance_timezone(), now()))::date;
$$;

COMMENT ON FUNCTION public.erp_work_date_pk() IS
  'Current ERP attendance work_date (midnight boundary in Asia/Karachi).';

CREATE OR REPLACE FUNCTION public.erp_attendance_work_day_end_at(p_work_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ((p_work_date + 1)::timestamp AT TIME ZONE public.erp_attendance_timezone());
$$;

COMMENT ON FUNCTION public.erp_attendance_work_day_end_at(date) IS
  'Instant when an attendance work_date ends (next midnight in Asia/Karachi).';

-- End an active break at p_at without checking out (missing punch stays missing).
CREATE OR REPLACE FUNCTION public.erp_attendance_finalize_break_at(
  p_row public.erp_attendance_days,
  p_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_add int;
BEGIN
  IF p_row.break_started_at IS NULL OR p_row.break_started_at >= p_at THEN
    RETURN;
  END IF;

  v_add := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (p_at - p_row.break_started_at)))::int
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
    p_at,
    COALESCE(v_add, 0)
  );

  UPDATE public.erp_attendance_days
  SET
    break_started_at = NULL,
    break_type = NULL,
    break_seconds_total = COALESCE(break_seconds_total, 0) + COALESCE(v_add, 0)
  WHERE id = p_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_close_open_row_at(
  p_row public.erp_attendance_days,
  p_check_out_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_row.check_in_at IS NULL OR p_row.check_out_at IS NOT NULL THEN
    RETURN;
  END IF;

  PERFORM public.erp_attendance_finalize_break_at(p_row, p_check_out_at);

  UPDATE public.erp_attendance_days
  SET check_out_at = p_check_out_at
  WHERE id = p_row.id
    AND check_out_at IS NULL;
END;
$$;

-- Prior open shifts: stop live break timers only — never fabricate check_out.
CREATE OR REPLACE FUNCTION public.erp_attendance_expire_stale_open_shifts(p_uid uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (public.erp_work_date_pk())::date;
  v_row public.erp_attendance_days%ROWTYPE;
  v_expired int := 0;
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
    IF v_row.break_started_at IS NOT NULL THEN
      v_day_end := public.erp_attendance_work_day_end_at(v_row.work_date);
      PERFORM public.erp_attendance_finalize_break_at(v_row, v_day_end);
    END IF;
    v_expired := v_expired + 1;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'work_date', v_today,
    'expired_count', v_expired
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_auto_close_stale_open_shifts(p_uid uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.erp_attendance_expire_stale_open_shifts(p_uid);
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
  v_expired int := 0;
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
    IF v_row.break_started_at IS NOT NULL THEN
      v_day_end := public.erp_attendance_work_day_end_at(v_row.work_date);
      PERFORM public.erp_attendance_finalize_break_at(v_row, v_day_end);
    END IF;
    v_expired := v_expired + 1;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'work_date', v_today,
    'expired_count', v_expired
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN public.erp_attendance_expire_stale_open_shifts(v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_check_out_pk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wd date := (public.erp_work_date_pk())::date;
  v_row public.erp_attendance_days%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.erp_attendance_days
  WHERE user_id = v_uid
    AND work_date = v_wd
    AND check_in_at IS NOT NULL
    AND check_out_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not checked in';
  END IF;

  PERFORM public.erp_attendance_close_open_row_at(v_row, now());

  RETURN json_build_object('ok', true, 'id', v_row.id, 'work_date', v_wd);
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
  v_day_end timestamptz;
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

  -- Past days stay missing punch — only stop a running break timer.
  IF v_row.work_date < v_today THEN
    IF v_row.break_started_at IS NOT NULL THEN
      v_day_end := public.erp_attendance_work_day_end_at(v_row.work_date);
      PERFORM public.erp_attendance_finalize_break_at(v_row, v_day_end);
    END IF;

    RETURN json_build_object(
      'ok', true,
      'id', v_row.id,
      'work_date', v_row.work_date,
      'missing_punch', true
    );
  END IF;

  PERFORM public.erp_attendance_close_open_row_at(v_row, now());

  RETURN json_build_object(
    'ok', true,
    'id', v_row.id,
    'work_date', v_row.work_date,
    'check_out_at', now()
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

  PERFORM public.erp_attendance_expire_stale_open_shifts(v_uid);

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
      check_out_at = NULL,
      break_started_at = NULL,
      break_type = NULL
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

COMMENT ON FUNCTION public.erp_attendance_expire_stale_open_shifts(uuid) IS
  'Finalize break timers on prior open shifts; leave check_out NULL (missing punch).';

COMMENT ON FUNCTION public.erp_attendance_sync_pk() IS
  'Sync attendance for the caller: expire stale open shifts and return today work_date.';

COMMENT ON FUNCTION public.erp_attendance_check_in_pk() IS
  'Check in for today (Asia/Karachi work_date). Prior days without checkout remain missing punch.';

COMMENT ON FUNCTION public.erp_attendance_check_out_pk() IS
  'Check out for today''s open shift.';

COMMENT ON FUNCTION public.erp_attendance_close_open_shift_pk(uuid) IS
  'Check out today''s shift, or finalize break only on a prior missing-punch day.';

GRANT EXECUTE ON FUNCTION public.erp_attendance_timezone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_check_out_pk() TO authenticated;

-- Remove synthetic midnight auto-checkouts (LA or Karachi) and other implausible spans.
DO $$
DECLARE
  v_max int := public.erp_attendance_max_plausible_gross_seconds();
  v_n int := 0;
  v_m int := 0;
BEGIN
  UPDATE public.erp_attendance_days d
  SET check_out_at = NULL
  WHERE d.check_in_at IS NOT NULL
    AND d.check_out_at IS NOT NULL
    AND (
      public.erp_attendance_gross_seconds(d.check_in_at, d.check_out_at) > v_max
      OR abs(
        EXTRACT(
          EPOCH FROM (
            d.check_out_at
            - ((d.work_date + 1)::timestamp AT TIME ZONE 'Asia/Karachi')
          )
        )
      ) <= 5
      OR abs(
        EXTRACT(
          EPOCH FROM (
            d.check_out_at
            - ((d.work_date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')
          )
        )
      ) <= 5
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.erp_attendance_days d
  SET
    break_started_at = NULL,
    break_type = NULL
  WHERE d.check_in_at IS NOT NULL
    AND d.check_out_at IS NULL
    AND d.work_date < (timezone('Asia/Karachi', now()))::date
    AND d.break_started_at IS NOT NULL;

  GET DIAGNOSTICS v_m = ROW_COUNT;

  RAISE NOTICE 'erp_attendance: cleared % synthetic/implausible check_out row(s); finalized % stale break(s)', v_n, v_m;
END;
$$;

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
    RAISE NOTICE 'pg_cron schema not available; skip attendance expire schedule';
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron functions not available; skip attendance expire schedule';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule attendance expire: %', SQLERRM;
END;
$cron$;
