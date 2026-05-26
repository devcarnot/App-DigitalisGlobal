-- Chat replies (DM + group) and project-channel read cursors for seen-by UI.

alter table public.erp_direct_messages
  add column if not exists reply_to_id uuid references public.erp_direct_messages(id) on delete set null;

create index if not exists erp_direct_messages_reply_to_id_idx
  on public.erp_direct_messages (reply_to_id)
  where reply_to_id is not null;

alter table public.erp_group_messages
  add column if not exists reply_to_id uuid references public.erp_group_messages(id) on delete set null;

create index if not exists erp_group_messages_reply_to_id_idx
  on public.erp_group_messages (reply_to_id)
  where reply_to_id is not null;

comment on column public.erp_direct_messages.reply_to_id is 'Quoted parent message for threaded replies.';
comment on column public.erp_group_messages.reply_to_id is 'Quoted parent message for threaded replies.';

-- Per-user read cursor for project chat channels (seen-by for outgoing messages).
create table if not exists public.erp_project_channel_read_state (
  user_id uuid not null references public.erp_profiles(id) on delete cascade,
  project_id uuid not null references public.erp_projects(id) on delete cascade,
  channel_id uuid not null references public.erp_project_channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id, channel_id)
);

create index if not exists erp_project_channel_read_state_channel_idx
  on public.erp_project_channel_read_state (project_id, channel_id, last_read_at desc);

alter table public.erp_project_channel_read_state enable row level security;

drop policy if exists erp_project_channel_read_state_select on public.erp_project_channel_read_state;
create policy erp_project_channel_read_state_select on public.erp_project_channel_read_state
  for select to authenticated
  using (public.erp_user_can_access_project_channel(channel_id));

drop policy if exists erp_project_channel_read_state_upsert on public.erp_project_channel_read_state;
create policy erp_project_channel_read_state_upsert on public.erp_project_channel_read_state
  for all to authenticated
  using (user_id = auth.uid() and public.erp_user_can_access_project_channel(channel_id))
  with check (user_id = auth.uid() and public.erp_user_can_access_project_channel(channel_id));

-- Group members can read each other's read cursors (needed for seen-by lists).
-- Safe if table already exists in production from an older migration.
do $$
begin
  if to_regclass('public.erp_group_read_state') is not null then
    execute 'alter table public.erp_group_read_state enable row level security';
    execute 'drop policy if exists erp_group_read_state_select on public.erp_group_read_state';
    execute $p$
      create policy erp_group_read_state_select on public.erp_group_read_state
        for select to authenticated
        using (
          exists (
            select 1
            from public.erp_message_group_members gm
            where gm.group_id = erp_group_read_state.group_id
              and gm.user_id = auth.uid()
          )
        )
    $p$;
    execute 'drop policy if exists erp_group_read_state_self on public.erp_group_read_state';
    execute $p$
      create policy erp_group_read_state_self on public.erp_group_read_state
        for all to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$;
  end if;
end $$;
