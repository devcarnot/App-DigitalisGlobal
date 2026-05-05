-- Per-user RBAC overrides (merged after role + workspace role_permissions in app code).

CREATE TABLE IF NOT EXISTS public.erp_user_permission_overrides (
  user_id uuid PRIMARY KEY REFERENCES public.erp_profiles (id) ON DELETE CASCADE,
  grants jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.erp_user_permission_overrides IS
  'Partial module grants that replace merged role grants for that user only.';

CREATE INDEX IF NOT EXISTS erp_user_permission_overrides_updated_idx
  ON public.erp_user_permission_overrides (updated_at DESC);

ALTER TABLE public.erp_user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_user_perm_overrides_no_client"
  ON public.erp_user_permission_overrides
  FOR ALL
  USING (false)
  WITH CHECK (false);
