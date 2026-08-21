-- Allow members to request check-in/check-out time adjustments on days that already have punches.

ALTER TABLE public.erp_attendance_correction_requests
  DROP CONSTRAINT IF EXISTS erp_attendance_correction_requests_kind_check;

ALTER TABLE public.erp_attendance_correction_requests
  ADD CONSTRAINT erp_attendance_correction_requests_kind_check
  CHECK (kind IN ('missing_checkout', 'absent_explain', 'forgot_punch', 'adjust_times'));

CREATE OR REPLACE FUNCTION public.erp_attendance_submit_correction_pk(
  p_work_date date,
  p_kind text,
  p_requested_check_out_at timestamptz DEFAULT NULL,
  p_member_note text DEFAULT NULL,
  p_attendance_day_id uuid DEFAULT NULL,
  p_requested_check_in_at timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date;
  v_row public.erp_attendance_days%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_kind NOT IN ('missing_checkout', 'absent_explain', 'forgot_punch', 'adjust_times') THEN
    RAISE EXCEPTION 'Invalid correction kind';
  END IF;

  v_today := (timezone('Asia/Karachi', now()))::date;

  IF p_work_date IS NULL OR p_work_date >= v_today THEN
    RAISE EXCEPTION 'Corrections can only be raised for past work days';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.erp_attendance_correction_requests r
    WHERE r.user_id = v_uid
      AND r.work_date = p_work_date
      AND r.kind = p_kind
      AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending correction already exists for this day';
  END IF;

  IF p_kind = 'missing_checkout' THEN
    IF p_requested_check_out_at IS NULL THEN
      RAISE EXCEPTION 'Check-out time is required';
    END IF;

    IF p_attendance_day_id IS NOT NULL THEN
      SELECT * INTO v_row
      FROM public.erp_attendance_days d
      WHERE d.id = p_attendance_day_id AND d.user_id = v_uid;
    ELSE
      SELECT * INTO v_row
      FROM public.erp_attendance_days d
      WHERE d.user_id = v_uid AND d.work_date = p_work_date
      ORDER BY d.created_at DESC
      LIMIT 1;
    END IF;

    IF NOT FOUND OR v_row.check_in_at IS NULL THEN
      RAISE EXCEPTION 'No check-in found for this day';
    END IF;

    IF v_row.check_out_at IS NOT NULL THEN
      RAISE EXCEPTION 'This day already has a check-out';
    END IF;

    IF p_requested_check_out_at <= v_row.check_in_at THEN
      RAISE EXCEPTION 'Check-out must be after check-in';
    END IF;

    p_attendance_day_id := v_row.id;
  ELSIF p_kind = 'forgot_punch' THEN
    IF p_requested_check_in_at IS NULL OR p_requested_check_out_at IS NULL THEN
      RAISE EXCEPTION 'Check-in and check-out times are required';
    END IF;

    IF p_requested_check_out_at <= p_requested_check_in_at THEN
      RAISE EXCEPTION 'Check-out must be after check-in';
    END IF;

    SELECT * INTO v_row
    FROM public.erp_attendance_days d
    WHERE d.user_id = v_uid AND d.work_date = p_work_date
    ORDER BY d.created_at DESC
    LIMIT 1;

    IF FOUND AND v_row.check_in_at IS NOT NULL THEN
      RAISE EXCEPTION 'An attendance record already exists for this day';
    END IF;

    p_attendance_day_id := v_row.id;
  ELSIF p_kind = 'adjust_times' THEN
    IF p_requested_check_in_at IS NULL OR p_requested_check_out_at IS NULL THEN
      RAISE EXCEPTION 'Check-in and check-out times are required';
    END IF;

    IF p_requested_check_out_at <= p_requested_check_in_at THEN
      RAISE EXCEPTION 'Check-out must be after check-in';
    END IF;

    IF p_attendance_day_id IS NOT NULL THEN
      SELECT * INTO v_row
      FROM public.erp_attendance_days d
      WHERE d.id = p_attendance_day_id AND d.user_id = v_uid;
    ELSE
      SELECT * INTO v_row
      FROM public.erp_attendance_days d
      WHERE d.user_id = v_uid AND d.work_date = p_work_date
      ORDER BY d.created_at DESC
      LIMIT 1;
    END IF;

    IF NOT FOUND OR v_row.check_in_at IS NULL OR v_row.check_out_at IS NULL THEN
      RAISE EXCEPTION 'This day needs both check-in and check-out before adjusting times';
    END IF;

    p_attendance_day_id := v_row.id;
  END IF;

  INSERT INTO public.erp_attendance_correction_requests (
    user_id,
    attendance_day_id,
    work_date,
    kind,
    requested_check_in_at,
    requested_check_out_at,
    member_note,
    status
  )
  VALUES (
    v_uid,
    p_attendance_day_id,
    p_work_date,
    p_kind,
    p_requested_check_in_at,
    p_requested_check_out_at,
    NULLIF(trim(p_member_note), ''),
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_review_correction_pk(
  p_id uuid,
  p_action text,
  p_reviewer_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_req public.erp_attendance_correction_requests%ROWTYPE;
  v_row public.erp_attendance_days%ROWTYPE;
  v_new_day_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role INTO v_role FROM public.erp_profiles p WHERE p.id = v_uid;
  IF v_role NOT IN ('admin', 'team_lead') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT * INTO v_req
  FROM public.erp_attendance_correction_requests
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.erp_attendance_correction_requests
    SET
      status = 'rejected',
      reviewed_at = now(),
      reviewed_by = v_uid,
      reviewer_note = NULLIF(trim(p_reviewer_note), ''),
      updated_at = now()
    WHERE id = p_id;

    RETURN json_build_object('ok', true, 'status', 'rejected');
  END IF;

  IF v_req.kind = 'missing_checkout' THEN
    IF v_req.attendance_day_id IS NULL OR v_req.requested_check_out_at IS NULL THEN
      RAISE EXCEPTION 'Missing attendance row or check-out time';
    END IF;

    SELECT * INTO v_row
    FROM public.erp_attendance_days
    WHERE id = v_req.attendance_day_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Attendance row not found';
    END IF;

    IF v_row.check_out_at IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance row already has check-out';
    END IF;

    UPDATE public.erp_attendance_days
    SET
      check_out_at = v_req.requested_check_out_at,
      break_started_at = NULL
    WHERE id = v_row.id;
  ELSIF v_req.kind = 'forgot_punch' THEN
    IF v_req.requested_check_in_at IS NULL OR v_req.requested_check_out_at IS NULL THEN
      RAISE EXCEPTION 'Missing check-in or check-out time';
    END IF;

    IF v_req.attendance_day_id IS NOT NULL THEN
      SELECT * INTO v_row
      FROM public.erp_attendance_days
      WHERE id = v_req.attendance_day_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance row not found';
      END IF;

      IF v_row.check_in_at IS NOT NULL OR v_row.check_out_at IS NOT NULL THEN
        RAISE EXCEPTION 'Attendance record already exists for this day';
      END IF;

      UPDATE public.erp_attendance_days
      SET
        check_in_at = v_req.requested_check_in_at,
        check_out_at = v_req.requested_check_out_at,
        break_started_at = NULL
      WHERE id = v_row.id;
    ELSE
      SELECT * INTO v_row
      FROM public.erp_attendance_days
      WHERE user_id = v_req.user_id AND work_date = v_req.work_date
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND AND v_row.check_in_at IS NOT NULL THEN
        RAISE EXCEPTION 'Attendance record already exists for this day';
      END IF;

      IF FOUND THEN
        UPDATE public.erp_attendance_days
        SET
          check_in_at = v_req.requested_check_in_at,
          check_out_at = v_req.requested_check_out_at,
          break_started_at = NULL
        WHERE id = v_row.id;
        v_new_day_id := v_row.id;
      ELSE
        INSERT INTO public.erp_attendance_days (user_id, work_date, check_in_at, check_out_at)
        VALUES (v_req.user_id, v_req.work_date, v_req.requested_check_in_at, v_req.requested_check_out_at)
        RETURNING id INTO v_new_day_id;
      END IF;

      UPDATE public.erp_attendance_correction_requests
      SET attendance_day_id = COALESCE(v_new_day_id, attendance_day_id)
      WHERE id = p_id;
    END IF;
  ELSIF v_req.kind = 'adjust_times' THEN
    IF v_req.attendance_day_id IS NULL OR v_req.requested_check_in_at IS NULL OR v_req.requested_check_out_at IS NULL THEN
      RAISE EXCEPTION 'Missing attendance row or requested times';
    END IF;

    SELECT * INTO v_row
    FROM public.erp_attendance_days
    WHERE id = v_req.attendance_day_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Attendance row not found';
    END IF;

    UPDATE public.erp_attendance_days
    SET
      check_in_at = v_req.requested_check_in_at,
      check_out_at = v_req.requested_check_out_at,
      break_started_at = NULL
    WHERE id = v_row.id;
  END IF;

  UPDATE public.erp_attendance_correction_requests
  SET
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_uid,
    reviewer_note = NULLIF(trim(p_reviewer_note), ''),
    updated_at = now()
  WHERE id = p_id;

  RETURN json_build_object(
    'ok', true,
    'status', 'approved',
    'attendance_day_id', COALESCE(v_new_day_id, v_req.attendance_day_id),
    'user_id', v_req.user_id,
    'work_date', v_req.work_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_attendance_submit_correction_pk(date, text, timestamptz, text, uuid, timestamptz) TO authenticated;
