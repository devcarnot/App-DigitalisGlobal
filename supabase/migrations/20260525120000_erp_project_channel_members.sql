-- Restrict side channels to explicit members; General stays visible to all project members.

create extension if not exists pgcrypto;

create table if not exists public.erp_project_channel_members (
  channel_id uuid not null references public.erp_project_channels(id) on delete cascade,
  user_id uuid not null references public.erp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists erp_project_channel_members_user_idx
  on public.erp_project_channel_members (user_id, channel_id);

-- Preserve access on existing side channels until an admin trims the list.
insert into public.erp_project_channel_members (channel_id, user_id)
select c.id, pm.user_id
from public.erp_project_channels c
join public.erp_project_members pm on pm.project_id = c.project_id
where c.is_general = false
on conflict do nothing;

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
        or exists (
          select 1
          from public.erp_project_channel_members cm
          where cm.channel_id = c.id and cm.user_id = p_user_id
        )
      )
  );
$$;

alter table public.erp_project_channel_members enable row level security;

drop policy if exists erp_project_channel_members_select on public.erp_project_channel_members;
create policy erp_project_channel_members_select on public.erp_project_channel_members
  for select to authenticated
  using (public.erp_user_can_access_project_channel(channel_id));

drop policy if exists erp_project_channel_members_insert on public.erp_project_channel_members;
create policy erp_project_channel_members_insert on public.erp_project_channel_members
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.erp_project_channels c
      where c.id = channel_id
        and public.erp_user_can_manage_project_channels(c.project_id)
    )
    and exists (
      select 1
      from public.erp_project_channels c
      join public.erp_project_members pm on pm.project_id = c.project_id
      where c.id = channel_id and pm.user_id = erp_project_channel_members.user_id
    )
  );

drop policy if exists erp_project_channel_members_delete on public.erp_project_channel_members;
create policy erp_project_channel_members_delete on public.erp_project_channel_members
  for delete to authenticated
  using (
    exists (
      select 1
      from public.erp_project_channels c
      where c.id = channel_id
        and public.erp_user_can_manage_project_channels(c.project_id)
    )
  );

-- Channel visibility (drop legacy permissive policies if present) ------------
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'erp_project_channels' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.erp_project_channels', pol.policyname);
  end loop;
end $$;

create policy erp_project_channels_select on public.erp_project_channels
  for select to authenticated
  using (public.erp_user_can_access_project_channel(id));

-- Messages: only in channels the user can access -----------------------------
do $$
declare pol record;
begin
  for pol in
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'erp_messages' and cmd in ('SELECT', 'INSERT', 'UPDATE')
  loop
    execute format('drop policy if exists %I on public.erp_messages', pol.policyname);
  end loop;
end $$;

create policy erp_messages_select on public.erp_messages
  for select to authenticated
  using (
    channel_id is not null
    and public.erp_user_can_access_project_channel(channel_id)
  );

drop policy if exists erp_messages_insert on public.erp_messages;
create policy erp_messages_insert on public.erp_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and channel_id is not null
    and public.erp_user_can_access_project_channel(channel_id)
    and exists (
      select 1
      from public.erp_project_channels c
      where c.id = channel_id and c.project_id = project_id
    )
    and public.erp_user_is_project_member(project_id)
  );

drop policy if exists erp_messages_update on public.erp_messages;
create policy erp_messages_update on public.erp_messages
  for update to authenticated
  using (
    user_id = auth.uid()
    and channel_id is not null
    and public.erp_user_can_access_project_channel(channel_id)
  )
  with check (
    user_id = auth.uid()
    and channel_id is not null
    and public.erp_user_can_access_project_channel(channel_id)
  );
