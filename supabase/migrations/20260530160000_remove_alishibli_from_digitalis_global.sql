-- Remove alishibli.004 from Digitalis Global only (keep Puzzle Art Australia).

DO $$
DECLARE
  uid uuid;
  pid uuid;
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

  SELECT p.id INTO pid
  FROM public.erp_projects p
  WHERE lower(trim(p.name)) = 'digitalis global'
    AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF uid IS NULL OR pid IS NULL THEN
    RAISE NOTICE 'remove_alishibli_digitalis_global: user=% project=%', uid, pid;
    RETURN;
  END IF;

  DELETE FROM public.erp_project_channel_members cm
  USING public.erp_project_channels c
  WHERE cm.channel_id = c.id
    AND c.project_id = pid
    AND cm.user_id = uid;

  DELETE FROM public.erp_project_members
  WHERE project_id = pid
    AND user_id = uid;
END $$;
