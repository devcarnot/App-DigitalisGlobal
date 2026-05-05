-- Dynamic RBAC: one JSONB grant blob per workspace role (single-tenant workspace).
-- Keys match src/lib/erp-rbac-modules.js (module slug + view/create/edit/delete).

CREATE TABLE IF NOT EXISTS public.erp_workspace_role_permissions (
  role_key text PRIMARY KEY,
  grants jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.erp_workspace_role_permissions IS
  'Per-role CRUD flags by module; merged with code defaults when loading /api/erp/me/rbac.';

ALTER TABLE public.erp_workspace_role_permissions ENABLE ROW LEVEL SECURITY;

-- No direct client access; server uses service role for admin writes and merges reads in API routes.
CREATE POLICY "erp_workspace_role_permissions_no_client"
  ON public.erp_workspace_role_permissions
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Seed placeholder rows so Super Admin can PATCH without INSERT friction.
-- Full defaults are computed in app code if grants stay {}.
INSERT INTO public.erp_workspace_role_permissions (role_key, grants)
VALUES
  ('admin', '{}'::jsonb),
  ('team_lead', '{}'::jsonb),
  ('team_member', '{}'::jsonb),
  ('client', '{}'::jsonb),
  ('hr', '{}'::jsonb),
  ('bd', '{}'::jsonb)
ON CONFLICT (role_key) DO NOTHING;
