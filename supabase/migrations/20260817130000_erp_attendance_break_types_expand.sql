-- Expand in-day pause types: short leave, medical, meeting, training, etc.

CREATE OR REPLACE FUNCTION public.erp_normalize_break_type(p_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := lower(trim(regexp_replace(coalesce(p_type, ''), '\s+', '_', 'g')));
BEGIN
  IF v IN ('short', 'short_break', 'tea', 'coffee', 'tea_break') THEN
    RETURN 'short';
  ELSIF v IN ('lunch', 'lunch_break', 'meal') THEN
    RETURN 'lunch';
  ELSIF v IN ('prayer', 'namaz', 'salah') THEN
    RETURN 'prayer';
  ELSIF v IN ('short_leave', 'shortleave', 'half_leave', 'chhuti', 'chutti') THEN
    RETURN 'short_leave';
  ELSIF v IN ('personal') THEN
    RETURN 'personal';
  ELSIF v IN ('medical', 'medical_leave', 'sick', 'doctor') THEN
    RETURN 'medical';
  ELSIF v IN ('emergency', 'urgent') THEN
    RETURN 'emergency';
  ELSIF v IN ('official', 'work_errand', 'field', 'client_visit', 'bank') THEN
    RETURN 'official';
  ELSIF v IN ('meeting', 'external_meeting', 'offsite') THEN
    RETURN 'meeting';
  ELSIF v IN ('training', 'course', 'seminar', 'workshop') THEN
    RETURN 'training';
  ELSIF v IN ('other') THEN
    RETURN 'other';
  ELSIF v IN ('general', 'break', '') THEN
    RETURN 'general';
  END IF;
  RETURN 'other';
END;
$$;

COMMENT ON COLUMN public.erp_attendance_days.break_type IS
  'Active pause while on break: short, lunch, prayer, short_leave, personal, medical, emergency, official, meeting, training, other, general.';

COMMENT ON FUNCTION public.erp_attendance_break_start_pk(text) IS
  'Start an unpaid pause for today (break, short leave, medical, meeting, etc.).';
