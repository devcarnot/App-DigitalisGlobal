-- Client team member: helper role for a client's project (chat + tasks, no admin tools).
-- Workspace defaults are in src/lib/erp-rbac-modules.js; grants row allows Super Admin overrides.

INSERT INTO public.erp_workspace_role_permissions (role_key, grants)
VALUES ('client_team_member', '{}'::jsonb)
ON CONFLICT (role_key) DO NOTHING;
