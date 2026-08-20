-- Workspace-wide settings (single-tenant): office hours, etc.
-- Client reads via server API; writes require admin RBAC.

CREATE TABLE IF NOT EXISTS public.erp_workspace_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  attendance_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.erp_workspace_settings IS
  'Singleton workspace config. attendance_policy keys match src/lib/erp-workspace-settings.js.';

ALTER TABLE public.erp_workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_workspace_settings_no_client"
  ON public.erp_workspace_settings
  FOR ALL
  USING (false)
  WITH CHECK (false);

INSERT INTO public.erp_workspace_settings (id, attendance_policy)
VALUES (
  1,
  '{
    "shiftName": "Morning shift",
    "fullDayHours": 8,
    "fullDayGraceMinutes": 0,
    "halfDayHours": 4,
    "shiftStartHour": 9,
    "shiftStartMinute": 0,
    "shiftEndHour": 17,
    "shiftEndMinute": 0,
    "arrivalGraceMinutes": 15,
    "timezoneLabel": "GMT+5"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
