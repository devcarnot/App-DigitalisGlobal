-- Fix channel create: Super Admin / team lead were blocked when not on erp_project_members.
-- Allow manage when global admin OR (project member + manage role). Team members on the
-- project may also create side channels.

create or replace function public.erp_user_can_manage_project_channels(
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
      where p.id = p_user_id and p.role in ('admin', 'team_lead')
    )
    or exists (
      select 1 from public.erp_project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = p_user_id
        and pm.role = 'project_lead'
    )
    or (
      public.erp_user_is_project_member(p_project_id, p_user_id)
      and exists (
        select 1 from public.erp_profiles p
        where p.id = p_user_id and p.role = 'team_member'
      )
    );
$$;

drop policy if exists erp_project_channels_insert on public.erp_project_channels;
create policy erp_project_channels_insert on public.erp_project_channels
  for insert to authenticated
  with check (
    (
      is_general = false
      and public.erp_user_can_manage_project_channels(project_id)
    )
    or (
      is_general = true
      and public.erp_user_is_project_member(project_id)
      and not exists (
        select 1 from public.erp_project_channels g
        where g.project_id = erp_project_channels.project_id and g.is_general = true
      )
    )
  );

drop policy if exists erp_project_channels_update on public.erp_project_channels;
create policy erp_project_channels_update on public.erp_project_channels
  for update to authenticated
  using (
    is_general = false
    and public.erp_user_can_manage_project_channels(project_id)
  )
  with check (
    is_general = false
    and public.erp_user_can_manage_project_channels(project_id)
  );

drop policy if exists erp_project_channels_delete on public.erp_project_channels;
create policy erp_project_channels_delete on public.erp_project_channels
  for delete to authenticated
  using (
    is_general = false
    and public.erp_user_can_manage_project_channels(project_id)
  );
