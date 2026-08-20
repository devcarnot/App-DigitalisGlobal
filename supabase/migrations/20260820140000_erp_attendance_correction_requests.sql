-- Member-raised attendance corrections (missing checkout, absent explain).
-- Admin / team lead approves and applies check-out time.

CREATE TABLE IF NOT EXISTS public.erp_attendance_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  attendance_day_id uuid REFERENCES public.erp_attendance_days (id) ON DELETE SET NULL,
  work_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('missing_checkout', 'absent_explain')),
  requested_check_out_at timestamptz,
  member_note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_attendance_correction_requests_user_id_idx
  ON public.erp_attendance_correction_requests (user_id);

CREATE INDEX IF NOT EXISTS erp_attendance_correction_requests_status_idx
  ON public.erp_attendance_correction_requests (status);

CREATE INDEX IF NOT EXISTS erp_attendance_correction_requests_work_date_idx
  ON public.erp_attendance_correction_requests (work_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS erp_attendance_correction_requests_pending_uniq
  ON public.erp_attendance_correction_requests (user_id, work_date, kind)
  WHERE status = 'pending';

ALTER TABLE public.erp_attendance_correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_att_corr_select"
  ON public.erp_attendance_correction_requests FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.erp_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('admin', 'team_lead')
    )
  );

CREATE POLICY "erp_att_corr_insert_own"
  ON public.erp_attendance_correction_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "erp_att_corr_update_own_cancel"
  ON public.erp_attendance_correction_requests FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status = 'pending')
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'cancelled');

CREATE POLICY "erp_att_corr_update_reviewer"
  ON public.erp_attendance_correction_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('admin', 'team_lead')
    )
    AND status = 'pending'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('admin', 'team_lead')
    )
    AND status IN ('approved', 'rejected')
  );

GRANT SELECT, INSERT, UPDATE ON public.erp_attendance_correction_requests TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_attendance_submit_correction_pk(
  p_work_date date,
  p_kind text,
  p_requested_check_out_at timestamptz DEFAULT NULL,
  p_member_note text DEFAULT NULL,
  p_attendance_day_id uuid DEFAULT NULL
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

  IF p_kind NOT IN ('missing_checkout', 'absent_explain') THEN
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
  END IF;

  INSERT INTO public.erp_attendance_correction_requests (
    user_id,
    attendance_day_id,
    work_date,
    kind,
    requested_check_out_at,
    member_note,
    status
  )
  VALUES (
    v_uid,
    p_attendance_day_id,
    p_work_date,
    p_kind,
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
    'attendance_day_id', v_req.attendance_day_id,
    'user_id', v_req.user_id,
    'work_date', v_req.work_date
  );
END;
$$;

COMMENT ON TABLE public.erp_attendance_correction_requests IS
  'Member-raised attendance corrections; admin approves and applies times.';

GRANT EXECUTE ON FUNCTION public.erp_attendance_submit_correction_pk(date, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_review_correction_pk(uuid, text, text) TO authenticated;
