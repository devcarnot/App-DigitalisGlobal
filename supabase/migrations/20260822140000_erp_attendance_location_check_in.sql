-- Geofenced check-in: within office radius unless approved remote work covers today.

ALTER TABLE public.erp_attendance_days
  ADD COLUMN IF NOT EXISTS check_in_latitude double precision,
  ADD COLUMN IF NOT EXISTS check_in_longitude double precision,
  ADD COLUMN IF NOT EXISTS check_in_remote boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.erp_attendance_days.check_in_latitude IS
  'Device latitude recorded at check-in (WGS84).';
COMMENT ON COLUMN public.erp_attendance_days.check_in_longitude IS
  'Device longitude recorded at check-in (WGS84).';
COMMENT ON COLUMN public.erp_attendance_days.check_in_remote IS
  'True when check-in was allowed via approved remote work (outside office radius).';

CREATE OR REPLACE FUNCTION public.erp_geo_distance_meters(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_lat1 IS NULL OR p_lon1 IS NULL OR p_lat2 IS NULL OR p_lon2 IS NULL THEN NULL
    ELSE 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lon2 - p_lon1) / 2), 2)
    ))
  END;
$$;

COMMENT ON FUNCTION public.erp_geo_distance_meters(double precision, double precision, double precision, double precision) IS
  'Haversine distance in meters between two WGS84 coordinates.';

CREATE OR REPLACE FUNCTION public.erp_remote_work_approved_on(
  p_uid uuid,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_remote_work_requests r
    WHERE r.user_id = p_uid
      AND r.status = 'approved'
      AND r.start_date <= p_date
      AND r.end_date >= p_date
  );
$$;

COMMENT ON FUNCTION public.erp_remote_work_approved_on(uuid, date) IS
  'True when the user has approved remote/WFH covering p_date.';

CREATE OR REPLACE FUNCTION public.erp_attendance_office_location_from_policy(p_policy jsonb)
RETURNS TABLE (
  office_latitude double precision,
  office_longitude double precision,
  radius_meters integer,
  office_configured boolean
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p_policy ? 'officeLatitude'
        AND (p_policy->>'officeLatitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (p_policy->>'officeLatitude')::double precision
      ELSE NULL
    END,
    CASE
      WHEN p_policy ? 'officeLongitude'
        AND (p_policy->>'officeLongitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (p_policy->>'officeLongitude')::double precision
      ELSE NULL
    END,
    GREATEST(
      10,
      LEAST(
        500,
        COALESCE(NULLIF((p_policy->>'checkInRadiusMeters')::int, 0), 30)
      )
    ),
    CASE
      WHEN p_policy ? 'officeLatitude'
        AND p_policy ? 'officeLongitude'
        AND (p_policy->>'officeLatitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (p_policy->>'officeLongitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN true
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.erp_attendance_check_in_context_pk()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wd date := (public.erp_work_date_pk())::date;
  v_policy jsonb := '{}'::jsonb;
  v_office record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT attendance_policy
  INTO v_policy
  FROM public.erp_workspace_settings
  WHERE id = 1;

  SELECT *
  INTO v_office
  FROM public.erp_attendance_office_location_from_policy(COALESCE(v_policy, '{}'::jsonb));

  RETURN json_build_object(
    'ok', true,
    'work_date', v_wd,
    'office_configured', COALESCE(v_office.office_configured, false),
    'office_latitude', v_office.office_latitude,
    'office_longitude', v_office.office_longitude,
    'radius_meters', COALESCE(v_office.radius_meters, 30),
    'remote_approved_today', public.erp_remote_work_approved_on(v_uid, v_wd)
  );
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_check_in_context_pk() IS
  'Check-in prerequisites for the caller: office geofence config and approved remote work today.';

DROP FUNCTION IF EXISTS public.erp_attendance_check_in_pk();

CREATE OR REPLACE FUNCTION public.erp_attendance_check_in_pk(
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
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
  v_policy jsonb := '{}'::jsonb;
  v_office record;
  v_remote boolean;
  v_dist double precision;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT attendance_policy
  INTO v_policy
  FROM public.erp_workspace_settings
  WHERE id = 1;

  SELECT *
  INTO v_office
  FROM public.erp_attendance_office_location_from_policy(COALESCE(v_policy, '{}'::jsonb));

  IF NOT COALESCE(v_office.office_configured, false) THEN
    RAISE EXCEPTION 'Office location is not configured yet. Ask an admin to set it under Administration → Office hours.';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'Location access is required to check in. Allow location in your browser or device settings.';
  END IF;

  IF p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'Invalid location coordinates.';
  END IF;

  v_remote := public.erp_remote_work_approved_on(v_uid, v_wd);

  IF NOT v_remote THEN
    v_dist := public.erp_geo_distance_meters(
      p_latitude,
      p_longitude,
      v_office.office_latitude,
      v_office.office_longitude
    );
    IF v_dist IS NULL THEN
      RAISE EXCEPTION 'Could not verify your distance from the office.';
    END IF;
    IF v_dist > v_office.radius_meters THEN
      RAISE EXCEPTION
        'You must be within %s meters of the office to check in (about %s meters away). Request remote work if you are working from home.',
        v_office.radius_meters,
        round(v_dist)::int;
    END IF;
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
      break_type = NULL,
      check_in_latitude = p_latitude,
      check_in_longitude = p_longitude,
      check_in_remote = v_remote
    WHERE id = v_row.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.erp_attendance_days (
      user_id,
      work_date,
      check_in_at,
      check_in_latitude,
      check_in_longitude,
      check_in_remote
    )
    VALUES (v_uid, v_wd, now(), p_latitude, p_longitude, v_remote)
    RETURNING id INTO v_id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', v_id,
    'work_date', v_wd,
    'remote', v_remote
  );
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_check_in_pk(double precision, double precision) IS
  'Check in for today. Requires device location; enforces office geofence unless remote work is approved for today.';

GRANT EXECUTE ON FUNCTION public.erp_geo_distance_meters(double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_remote_work_approved_on(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_office_location_from_policy(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_check_in_context_pk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_check_in_pk(double precision, double precision) TO authenticated;
