-- Pinned chat messages (WhatsApp-style, visible to everyone in the thread).

create extension if not exists pgcrypto;

create table if not exists public.erp_chat_message_pins (
  id uuid primary key default gen_random_uuid(),
  project_message_id uuid references public.erp_messages(id) on delete cascade,
  dm_message_id uuid references public.erp_direct_messages(id) on delete cascade,
  group_message_id uuid references public.erp_group_messages(id) on delete cascade,
  project_id uuid references public.erp_projects(id) on delete cascade,
  channel_id uuid references public.erp_project_channels(id) on delete cascade,
  dm_thread_key text,
  group_id uuid references public.erp_message_groups(id) on delete cascade,
  pinned_by uuid not null references public.erp_profiles(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  constraint erp_chat_message_pins_one_target check (
    (case when project_message_id is not null then 1 else 0 end) +
    (case when dm_message_id is not null then 1 else 0 end) +
    (case when group_message_id is not null then 1 else 0 end) = 1
  ),
  constraint erp_chat_message_pins_one_scope check (
    (case when project_id is not null and channel_id is not null then 1 else 0 end) +
    (case when dm_thread_key is not null and group_id is null and project_id is null then 1 else 0 end) +
    (case when group_id is not null and dm_thread_key is null and project_id is null then 1 else 0 end) = 1
  )
);

create unique index if not exists erp_chat_message_pins_project_unique
  on public.erp_chat_message_pins (channel_id, project_message_id)
  where project_message_id is not null;

create unique index if not exists erp_chat_message_pins_dm_unique
  on public.erp_chat_message_pins (dm_thread_key, dm_message_id)
  where dm_message_id is not null;

create unique index if not exists erp_chat_message_pins_group_unique
  on public.erp_chat_message_pins (group_id, group_message_id)
  where group_message_id is not null;

create index if not exists erp_chat_message_pins_project_thread_idx
  on public.erp_chat_message_pins (project_id, channel_id, pinned_at desc)
  where project_message_id is not null;

create index if not exists erp_chat_message_pins_dm_thread_idx
  on public.erp_chat_message_pins (dm_thread_key, pinned_at desc)
  where dm_message_id is not null;

create index if not exists erp_chat_message_pins_group_thread_idx
  on public.erp_chat_message_pins (group_id, pinned_at desc)
  where group_message_id is not null;

alter table public.erp_chat_message_pins enable row level security;

drop policy if exists erp_chat_message_pins_select on public.erp_chat_message_pins;
create policy erp_chat_message_pins_select on public.erp_chat_message_pins
  for select to authenticated
  using (
    (
      project_message_id is not null
      and channel_id is not null
      and public.erp_user_can_access_project_channel(channel_id)
    )
    or (
      dm_message_id is not null
      and dm_thread_key is not null
      and (
        auth.uid()::text = split_part(dm_thread_key, ':', 1)
        or auth.uid()::text = split_part(dm_thread_key, ':', 2)
      )
    )
    or (
      group_message_id is not null
      and group_id is not null
      and exists (
        select 1
        from public.erp_message_group_members mem
        where mem.group_id = erp_chat_message_pins.group_id
          and mem.user_id = auth.uid()
      )
    )
  );

drop policy if exists erp_chat_message_pins_insert on public.erp_chat_message_pins;
create policy erp_chat_message_pins_insert on public.erp_chat_message_pins
  for insert to authenticated
  with check (
    pinned_by = auth.uid()
    and (
      (
        project_message_id is not null
        and channel_id is not null
        and public.erp_user_can_access_project_channel(channel_id)
        and exists (
          select 1
          from public.erp_messages m
          where m.id = project_message_id
            and m.channel_id = channel_id
            and m.project_id = project_id
            and m.deleted_at is null
        )
      )
      or (
        dm_message_id is not null
        and dm_thread_key is not null
        and (
          auth.uid()::text = split_part(dm_thread_key, ':', 1)
          or auth.uid()::text = split_part(dm_thread_key, ':', 2)
        )
        and exists (
          select 1
          from public.erp_direct_messages dm
          where dm.id = dm_message_id
            and dm.deleted_at is null
            and coalesce(dm.kind, 'text') <> 'call'
            and (
              dm.sender_id = auth.uid()
              or dm.recipient_id = auth.uid()
            )
        )
      )
      or (
        group_message_id is not null
        and group_id is not null
        and exists (
          select 1
          from public.erp_group_messages gm
          join public.erp_message_group_members mem on mem.group_id = gm.group_id
          where gm.id = group_message_id
            and gm.group_id = erp_chat_message_pins.group_id
            and mem.user_id = auth.uid()
            and gm.deleted_at is null
            and coalesce(gm.kind, 'text') <> 'call'
        )
      )
    )
  );

drop policy if exists erp_chat_message_pins_delete on public.erp_chat_message_pins;
create policy erp_chat_message_pins_delete on public.erp_chat_message_pins
  for delete to authenticated
  using (
    (
      project_message_id is not null
      and channel_id is not null
      and public.erp_user_can_access_project_channel(channel_id)
    )
    or (
      dm_message_id is not null
      and dm_thread_key is not null
      and (
        auth.uid()::text = split_part(dm_thread_key, ':', 1)
        or auth.uid()::text = split_part(dm_thread_key, ':', 2)
      )
    )
    or (
      group_message_id is not null
      and group_id is not null
      and exists (
        select 1
        from public.erp_message_group_members mem
        where mem.group_id = erp_chat_message_pins.group_id
          and mem.user_id = auth.uid()
      )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.erp_chat_message_pins;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

comment on table public.erp_chat_message_pins is
  'Pinned messages in project channels, DMs, and group chats (shared within the thread).';
