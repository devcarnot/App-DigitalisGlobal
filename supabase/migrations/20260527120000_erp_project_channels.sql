-- Project chat channels (General + side channels). Required before erp_project_channel_members.
-- Safe to re-run: creates missing table, backfills General per project, links messages.

create extension if not exists pgcrypto;

create table if not exists public.erp_project_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.erp_projects(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_general boolean not null default false,
  created_by uuid references public.erp_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists erp_project_channels_project_idx
  on public.erp_project_channels (project_id, sort_order, name);

create unique index if not exists erp_project_channels_one_general_per_project
  on public.erp_project_channels (project_id)
  where is_general = true;

create unique index if not exists erp_project_channels_project_name_key
  on public.erp_project_channels (project_id, lower(name));

alter table public.erp_messages
  add column if not exists channel_id uuid references public.erp_project_channels(id) on delete set null;

create index if not exists erp_messages_channel_id_idx
  on public.erp_messages (channel_id, created_at desc)
  where channel_id is not null;

-- Backfill a General channel for every project that does not have one.
insert into public.erp_project_channels (project_id, name, sort_order, is_general, created_by)
select
  p.id,
  'General',
  0,
  true,
  coalesce(
    (
      select pm.user_id
      from public.erp_project_members pm
      where pm.project_id = p.id and pm.role = 'project_lead'
      order by pm.user_id
      limit 1
    ),
    (
      select pm.user_id
      from public.erp_project_members pm
      where pm.project_id = p.id
      order by pm.user_id
      limit 1
    )
  )
from public.erp_projects p
where not exists (
  select 1
  from public.erp_project_channels c
  where c.project_id = p.id and c.is_general = true
);

-- Attach legacy project messages to that project's General channel.
update public.erp_messages m
set channel_id = c.id
from public.erp_project_channels c
where c.project_id = m.project_id
  and c.is_general = true
  and m.channel_id is null;

-- Helpers (also defined in channel_members migration; keep in sync).
create or replace function public.erp_user_is_project_member(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.erp_project_members pm
    where pm.project_id = p_project_id and pm.user_id = p_user_id
  );
$$;

create or replace function public.erp_user_can_manage_project_channels(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.erp_profiles p
      where p.id = p_user_id and p.role in ('admin', 'team_lead')
    )
    or exists (
      select 1 from public.erp_project_members pm
      where pm.project_id = p_project_id and pm.user_id = p_user_id and pm.role = 'project_lead'
    );
$$;

-- Side-channel membership is added in erp_project_channel_members migration (replaces this).
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
      and public.erp_user_is_project_member(c.project_id, p_user_id)
      and (
        c.is_general = true
        or public.erp_user_can_manage_project_channels(c.project_id, p_user_id)
      )
  );
$$;

alter table public.erp_project_channels enable row level security;

drop policy if exists erp_project_channels_select on public.erp_project_channels;
create policy erp_project_channels_select on public.erp_project_channels
  for select to authenticated
  using (public.erp_user_can_access_project_channel(id));

drop policy if exists erp_project_channels_insert on public.erp_project_channels;
create policy erp_project_channels_insert on public.erp_project_channels
  for insert to authenticated
  with check (
    public.erp_user_is_project_member(project_id)
    and (
      is_general = false
        and public.erp_user_can_manage_project_channels(project_id)
      or (
        is_general = true
        and not exists (
          select 1 from public.erp_project_channels g
          where g.project_id = erp_project_channels.project_id and g.is_general = true
        )
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
