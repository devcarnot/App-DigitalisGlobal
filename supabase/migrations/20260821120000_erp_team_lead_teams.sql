-- Teams a team_lead manages (erp_member_team_options.id values).
-- When set, My Team / team attendance scope members by member_team instead of shared projects.
-- Falls back to member_team on the lead profile when lead_teams is null or empty.

ALTER TABLE public.erp_profiles
  ADD COLUMN IF NOT EXISTS lead_teams text[] DEFAULT NULL;

COMMENT ON COLUMN public.erp_profiles.lead_teams IS
  'Functional team ids this team_lead manages. Used for My Team roster scope.';
