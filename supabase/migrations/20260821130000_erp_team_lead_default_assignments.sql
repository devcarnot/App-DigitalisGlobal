-- Default team lead → functional team mapping for My Team scope.

UPDATE public.erp_profiles
SET lead_teams = ARRAY['developer']::text[],
    updated_at = now()
WHERE role = 'team_lead'
  AND lower(trim(coalesce(contact_email, ''))) = 'ameer.hamza928942@gmail.com';

UPDATE public.erp_profiles
SET lead_teams = ARRAY['graphic_designer', 'marketing']::text[],
    updated_at = now()
WHERE role = 'team_lead'
  AND lower(trim(coalesce(contact_email, ''))) = 'dev.zohaibkazmi@gmail.com';
