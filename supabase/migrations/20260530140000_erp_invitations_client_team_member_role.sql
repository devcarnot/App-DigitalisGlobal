-- Allow client_team_member in invitation global_role (erp_invitations_global_role_check).

ALTER TABLE public.erp_invitations
  DROP CONSTRAINT IF EXISTS erp_invitations_global_role_check;

ALTER TABLE public.erp_invitations
  ADD CONSTRAINT erp_invitations_global_role_check CHECK (
    global_role IS NOT NULL
    AND (
      global_role IN (
        'admin',
        'team_lead',
        'team_member',
        'client',
        'client_team_member',
        'hr',
        'bd'
      )
      OR (
        global_role ~ '^[a-z][a-z0-9_]*$'
        AND char_length(global_role) <= 48
      )
    )
  );
