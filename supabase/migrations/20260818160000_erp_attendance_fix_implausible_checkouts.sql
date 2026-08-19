-- Attendance rows with gross span > 11 hours are corrupt (stale auto-close / clock skew).
-- Super Admin may bulk-fix via RPC; one-time cleanup below.

CREATE OR REPLACE FUNCTION public.erp_attendance_gross_seconds(
  p_check_in timestamptz,
  p_check_out timestamptz
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_check_in IS NULL OR p_check_out IS NULL THEN 0
    WHEN p_check_out < p_check_in THEN 0
    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_check_out - p_check_in)))::int)
  END;
$$;

COMMENT ON FUNCTION public.erp_attendance_gross_seconds(timestamptz, timestamptz) IS
  'Gross seconds between check-in and check-out (0 when invalid).';

-- 11 hours — evening shift ends ~1 AM (9h) with buffer for breaks / edge cases.
CREATE OR REPLACE FUNCTION public.erp_attendance_max_plausible_gross_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 11 * 3600;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_admin_fix_implausible_checkouts_pk()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_max int := public.erp_attendance_max_plausible_gross_seconds();
  v_fixed int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role INTO v_role
  FROM public.erp_profiles p
  WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: Super Admin only';
  END IF;

  WITH targets AS (
    SELECT d.id
    FROM public.erp_attendance_days d
    WHERE d.check_in_at IS NOT NULL
      AND d.check_out_at IS NOT NULL
      AND public.erp_attendance_gross_seconds(d.check_in_at, d.check_out_at) > v_max
    FOR UPDATE
  ),
  cleared AS (
    UPDATE public.erp_attendance_days d
    SET check_out_at = NULL
    FROM targets t
    WHERE d.id = t.id
    RETURNING d.id
  )
  SELECT COUNT(*)::int INTO v_fixed FROM cleared;

  RETURN json_build_object(
    'ok', true,
    'fixed_count', v_fixed,
    'max_gross_seconds', v_max
  );
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_admin_fix_implausible_checkouts_pk() IS
  'Super Admin only: clears check_out_at on rows whose gross span exceeds 11 hours (missing punch).';

GRANT EXECUTE ON FUNCTION public.erp_attendance_admin_fix_implausible_checkouts_pk() TO authenticated;

-- One-time cleanup of existing corrupt rows.
DO $$
DECLARE
  v_max int := public.erp_attendance_max_plausible_gross_seconds();
  v_n int;
BEGIN
  UPDATE public.erp_attendance_days d
  SET check_out_at = NULL
  WHERE d.check_in_at IS NOT NULL
    AND d.check_out_at IS NOT NULL
    AND public.erp_attendance_gross_seconds(d.check_in_at, d.check_out_at) > v_max;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'erp_attendance: cleared implausible check_out on % row(s) (>11h gross)', v_n;
END;
$$;
