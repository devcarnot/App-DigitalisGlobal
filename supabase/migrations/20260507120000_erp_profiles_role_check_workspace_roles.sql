-- App assigns built-in keys (admin, team_lead, team_member, client, hr, bd) plus custom
-- slugs from `erp_workspace_custom_roles`. Older CHECK constraints often only listed 4 roles;
-- updates then failed with: violates check constraint "erp_profiles_role_check".

ALTER TABLE public.erp_profiles
  DROP CONSTRAINT IF EXISTS erp_profiles_role_check;

-- Same character rules as `erp_workspace_custom_roles.role_key` (lowercase slug, max 48).
ALTER TABLE public.erp_profiles
  ADD CONSTRAINT erp_profiles_role_check CHECK (
    role IS NOT NULL
    AND role ~ '^[a-z][a-z0-9_]*$'
    AND char_length(role) <= 48
  );
