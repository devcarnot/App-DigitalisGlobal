-- Allow workspace admins / team leads and project leads to update projects they manage.
-- Without this, RLS often only permits the creator, while the app UI lets any team_lead edit.

create or replace function public.erp_user_can_edit_project(
  p_project_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.erp_user_is_erp_global_admin(p_user_id)
    or exists (
      select 1 from public.erp_profiles p
      where p.id = p_user_id and p.role = 'team_lead'
    )
    or exists (
      select 1 from public.erp_project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = p_user_id
        and pm.role = 'project_lead'
    );
$$;

drop policy if exists erp_projects_update_managers on public.erp_projects;
create policy erp_projects_update_managers on public.erp_projects
  for update to authenticated
  using (
    deleted_at is null
    and public.erp_user_can_edit_project(id)
  )
  with check (
    public.erp_user_can_edit_project(id)
  );
