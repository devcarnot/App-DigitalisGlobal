-- Persist sign-in notification throttle across serverless invocations (avoid duplicate emails).

ALTER TABLE public.erp_profiles
ADD COLUMN IF NOT EXISTS last_login_notify_at timestamptz;

COMMENT ON COLUMN public.erp_profiles.last_login_notify_at IS 'Last successful sign-in notification email sent at (workspace security alert throttle).';
