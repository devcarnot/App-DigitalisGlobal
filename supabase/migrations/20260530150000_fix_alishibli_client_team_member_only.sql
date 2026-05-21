-- Ensure alishibli.004@gmail.com is workspace client_team_member only (not client / team member).

DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT u.id INTO uid
  FROM auth.users u
  WHERE lower(u.email) LIKE '%alishibli.004%'
  LIMIT 1;

  IF uid IS NULL THEN
    SELECT p.id INTO uid
    FROM public.erp_profiles p
    WHERE lower(coalesce(p.contact_email, '')) LIKE '%alishibli.004%'
    LIMIT 1;
  END IF;

  IF uid IS NULL THEN
    RAISE NOTICE 'fix_alishibli_client_team_member_only: no user found for alishibli.004';
    RETURN;
  END IF;

  UPDATE public.erp_profiles
  SET
    role = 'client_team_member',
    member_team = NULL,
    updated_at = now()
  WHERE id = uid;

  UPDATE public.erp_project_members pm
  SET role = 'client'
  WHERE pm.user_id = uid
    AND pm.role IN ('member', 'project_lead');

  DELETE FROM public.erp_invitations
  WHERE lower(email) LIKE '%alishibli.004%'
    AND accepted_at IS NULL
    AND global_role IS DISTINCT FROM 'client_team_member';

  -- Drop mistaken membership on Digitalis Global (client team should stay on invited project only).
  DELETE FROM public.erp_project_channel_members cm
  USING public.erp_project_channels c, public.erp_projects p
  WHERE cm.channel_id = c.id
    AND c.project_id = p.id
    AND cm.user_id = uid
    AND lower(trim(p.name)) = 'digitalis global'
    AND p.deleted_at IS NULL;

  DELETE FROM public.erp_project_members pm
  USING public.erp_projects p
  WHERE pm.project_id = p.id
    AND pm.user_id = uid
    AND lower(trim(p.name)) = 'digitalis global'
    AND p.deleted_at IS NULL;
END $$;
