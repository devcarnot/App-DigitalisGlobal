-- Auto-create a General channel for every new project and backfill any missing rows.
-- Also let workspace admins see/send in project channels without project_membership.

create or replace function public.erp_user_is_erp_global_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.erp_profiles p
    where p.id = p_user_id and p.role = 'admin'
  );
$$;

create or replace function public.erp_ensure_project_general_channel_row(
  p_project_id uuid,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.erp_project_channels c
  where c.project_id = p_project_id and c.is_general = true
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.erp_project_channels (project_id, name, sort_order, is_general, created_by)
  values (p_project_id, 'General', 0, true, p_created_by)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.erp_trg_erp_projects_ensure_general_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.erp_ensure_project_general_channel_row(NEW.id, NEW.created_by);
  return NEW;
end;
$$;

drop trigger if exists erp_projects_ensure_general_channel on public.erp_projects;
create trigger erp_projects_ensure_general_channel
  after insert on public.erp_projects
  for each row
  execute function public.erp_trg_erp_projects_ensure_general_channel();

-- Backfill projects that still have no General channel.
select public.erp_ensure_project_general_channel_row(p.id, p.created_by)
from public.erp_projects p
where p.deleted_at is null
  and not exists (
    select 1
    from public.erp_project_channels c
    where c.project_id = p.id and c.is_general = true
  );

create or replace function public.erp_user_can_access_project_channel(p_channel_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.erp_project_channels c
    where c.id = p_channel_id
      and (
        public.erp_user_is_erp_global_admin(p_user_id)
        or (
          public.erp_user_is_project_member(c.project_id, p_user_id)
          and (
            c.is_general = true
            or public.erp_user_can_manage_project_channels(c.project_id, p_user_id)
            or exists (
              select 1
              from public.erp_project_channel_members cm
              where cm.channel_id = c.id and cm.user_id = p_user_id
            )
          )
        )
      )
  );
$$;
