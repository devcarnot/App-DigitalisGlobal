-- Emoji reactions on DM + Group chat messages.
--
-- We deliberately keep the project-channel reactions table (`erp_message_reactions`)
-- untouched and add a separate table for the DM / group chat scope so the two
-- features can evolve independently. One row per (message, user, emoji); a
-- single nullable FK per scope with a CHECK that exactly one is set.

create extension if not exists pgcrypto;

create table if not exists public.erp_dm_reactions (
  id uuid primary key default gen_random_uuid(),
  dm_message_id uuid references public.erp_direct_messages(id) on delete cascade,
  group_message_id uuid references public.erp_group_messages(id) on delete cascade,
  user_id uuid not null references public.erp_profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint erp_dm_reactions_one_target check (
    (case when dm_message_id is not null then 1 else 0 end) +
    (case when group_message_id is not null then 1 else 0 end) = 1
  ),
  constraint erp_dm_reactions_emoji_size check (char_length(emoji) between 1 and 32)
);

create unique index if not exists erp_dm_reactions_dm_unique
  on public.erp_dm_reactions (dm_message_id, user_id, emoji)
  where dm_message_id is not null;

create unique index if not exists erp_dm_reactions_group_unique
  on public.erp_dm_reactions (group_message_id, user_id, emoji)
  where group_message_id is not null;

create index if not exists erp_dm_reactions_dm_idx
  on public.erp_dm_reactions (dm_message_id)
  where dm_message_id is not null;

create index if not exists erp_dm_reactions_group_idx
  on public.erp_dm_reactions (group_message_id)
  where group_message_id is not null;

create index if not exists erp_dm_reactions_user_idx
  on public.erp_dm_reactions (user_id);

alter table public.erp_dm_reactions enable row level security;

-- A user can read reactions on a DM they can see, and on group messages
-- whose group they belong to.
drop policy if exists erp_dm_reactions_select on public.erp_dm_reactions;
create policy erp_dm_reactions_select on public.erp_dm_reactions
  for select to authenticated
  using (
    (
      dm_message_id is not null and exists (
        select 1 from public.erp_direct_messages dm
        where dm.id = dm_message_id
          and (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
      )
    )
    or (
      group_message_id is not null and exists (
        select 1
        from public.erp_group_messages gm
        join public.erp_message_group_members mem on mem.group_id = gm.group_id
        where gm.id = group_message_id and mem.user_id = auth.uid()
      )
    )
  );

-- Insert: only on the user's own row, on a message they can see, on a
-- non-deleted, non-call message.
drop policy if exists erp_dm_reactions_insert on public.erp_dm_reactions;
create policy erp_dm_reactions_insert on public.erp_dm_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (
        dm_message_id is not null
        and group_message_id is null
        and exists (
          select 1 from public.erp_direct_messages dm
          where dm.id = dm_message_id
            and (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
            and dm.deleted_at is null
            and coalesce(dm.kind, 'text') <> 'call'
        )
      )
      or (
        group_message_id is not null
        and dm_message_id is null
        and exists (
          select 1
          from public.erp_group_messages gm
          join public.erp_message_group_members mem on mem.group_id = gm.group_id
          where gm.id = group_message_id
            and mem.user_id = auth.uid()
            and gm.deleted_at is null
            and coalesce(gm.kind, 'text') <> 'call'
        )
      )
    )
  );

-- Delete: only your own reactions.
drop policy if exists erp_dm_reactions_delete on public.erp_dm_reactions;
create policy erp_dm_reactions_delete on public.erp_dm_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- Make the table broadcastable in realtime so clients can hear reaction
-- changes through their existing thread channels. Wrapped in an exception
-- handler because the publication may not exist on every environment.
do $$
begin
  alter publication supabase_realtime add table public.erp_dm_reactions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

comment on table public.erp_dm_reactions is
  'Per-user emoji reactions on direct or group chat messages.';
comment on column public.erp_dm_reactions.dm_message_id is
  'FK to erp_direct_messages when this reaction is on a 1:1 DM.';
comment on column public.erp_dm_reactions.group_message_id is
  'FK to erp_group_messages when this reaction is on a group message.';
