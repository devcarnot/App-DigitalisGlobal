-- Break categories (short, lunch, etc.) + per-day break session log.

ALTER TABLE public.erp_attendance_days
  ADD COLUMN IF NOT EXISTS break_type text;

COMMENT ON COLUMN public.erp_attendance_days.break_type IS
  'Active break category while break_started_at is set: short, lunch, prayer, personal, other, general.';

CREATE TABLE IF NOT EXISTS public.erp_attendance_break_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_day_id uuid NOT NULL REFERENCES public.erp_attendance_days(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  break_type text NOT NULL DEFAULT 'general',
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_attendance_break_sessions_day_idx
  ON public.erp_attendance_break_sessions (attendance_day_id, started_at DESC);

CREATE INDEX IF NOT EXISTS erp_attendance_break_sessions_user_idx
  ON public.erp_attendance_break_sessions (user_id, started_at DESC);

ALTER TABLE public.erp_attendance_break_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_attendance_break_sessions_select_own ON public.erp_attendance_break_sessions;
CREATE POLICY erp_attendance_break_sessions_select_own
  ON public.erp_attendance_break_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.erp_normalize_break_type(p_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := lower(trim(coalesce(p_type, '')));
BEGIN
  IF v IN ('short', 'short_break', 'tea', 'coffee', 'tea_break') THEN
    RETURN 'short';
  ELSIF v IN ('lunch', 'lunch_break', 'meal') THEN
    RETURN 'lunch';
  ELSIF v IN ('prayer', 'namaz', 'salah') THEN
    RETURN 'prayer';
  ELSIF v IN ('personal') THEN
    RETURN 'personal';
  ELSIF v IN ('other') THEN
    RETURN 'other';
  ELSIF v IN ('general', 'break', '') THEN
    RETURN 'general';
  END IF;
  RETURN 'other';
END;
$$;

DROP FUNCTION IF EXISTS public.erp_attendance_break_start_pk();

CREATE OR REPLACE FUNCTION public.erp_attendance_break_start_pk(p_break_type text DEFAULT 'general')
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
  v_type text := public.erp_normalize_break_type(p_break_type);
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
  SET
    break_started_at = now(),
    break_type = v_type
  WHERE d.id = v_id
    AND d.user_id = v_uid
    AND d.check_out_at IS NULL
    AND d.break_started_at IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Cannot start break (already on break, checked out, or wrong day)';
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id, 'break_type', v_type);
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
  v_type text;
  v_started timestamptz;
  v_add int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    id,
    COALESCE(break_type, 'general'),
    break_started_at,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - break_started_at)))::int)
  INTO v_id, v_type, v_started, v_add
  FROM public.erp_attendance_days
  WHERE user_id = v_uid AND work_date = v_wd AND break_started_at IS NOT NULL
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not on break';
  END IF;

  INSERT INTO public.erp_attendance_break_sessions (
    attendance_day_id,
    user_id,
    break_type,
    started_at,
    ended_at,
    duration_seconds
  ) VALUES (
    v_id,
    v_uid,
    v_type,
    v_started,
    now(),
    COALESCE(v_add, 0)
  );

  UPDATE public.erp_attendance_days
  SET
    break_started_at = NULL,
    break_type = NULL,
    break_seconds_total = COALESCE(break_seconds_total, 0) + COALESCE(v_add, 0)
  WHERE id = v_id AND user_id = v_uid;

  RETURN json_build_object('ok', true, 'id', v_id, 'added_seconds', v_add, 'break_type', v_type);
END;
$$;

COMMENT ON FUNCTION public.erp_attendance_break_start_pk(text) IS
  'Start an unpaid break for today (optional type: short, lunch, prayer, personal, other).';

COMMENT ON FUNCTION public.erp_attendance_break_end_pk() IS
  'End current break, append a break session row, and add duration to break_seconds_total.';

GRANT EXECUTE ON FUNCTION public.erp_attendance_break_start_pk(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_attendance_break_end_pk() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.erp_attendance_break_sessions;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
