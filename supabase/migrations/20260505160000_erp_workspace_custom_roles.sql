-- Optional extra workspace roles (stored as `erp_profiles.role`). Builtins stay in app code + RBAC defaults.
-- Custom keys must match /^[a-z][a-z0-9_]*$/.

CREATE TABLE IF NOT EXISTS public.erp_workspace_custom_roles (
  role_key text PRIMARY KEY
    CHECK (role_key ~ '^[a-z][a-z0-9_]*$' AND char_length(role_key) <= 48),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.erp_workspace_custom_roles IS
  'User-defined workspace role keys; merged with built-in roles for assignment and RBAC (defaults fall back to team_member).';

ALTER TABLE public.erp_workspace_custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_workspace_custom_roles_no_direct_client"
  ON public.erp_workspace_custom_roles
  FOR ALL
  USING (false)
  WITH CHECK (false);
