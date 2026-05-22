-- Ensure erp_trashed_users exists (Trash page) and backfill recent deletions from activity log.

create table if not exists public.erp_trashed_users (
  id uuid primary key default gen_random_uuid(),
  original_user_id uuid not null,
  email text,
  full_name text,
  role text,
  avatar_path text,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  purge_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists erp_trashed_users_deleted_at_idx
  on public.erp_trashed_users (deleted_at desc);

create index if not exists erp_trashed_users_original_user_idx
  on public.erp_trashed_users (original_user_id);

alter table public.erp_trashed_users enable row level security;

drop policy if exists erp_trashed_users_select_admins on public.erp_trashed_users;
create policy erp_trashed_users_select_admins on public.erp_trashed_users
  for select using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'team_lead')
    )
  );

-- Backfill snapshots for users removed before the table existed (last 90 days).
insert into public.erp_trashed_users (original_user_id, email, full_name, role, deleted_at, deleted_by)
select
  (a.meta->>'removed_user_id')::uuid,
  nullif(trim(a.meta->>'email'), ''),
  nullif(trim(a.meta->>'display_name'), ''),
  nullif(trim(a.meta->>'role'), ''),
  a.created_at,
  a.user_id
from public.erp_activity_log a
where a.action = 'user_removed'
  and a.meta ? 'removed_user_id'
  and (a.meta->>'removed_user_id') ~* '^[0-9a-f-]{36}$'
  and a.created_at > now() - interval '90 days'
  and not exists (
    select 1 from public.erp_trashed_users t
    where t.original_user_id = (a.meta->>'removed_user_id')::uuid
  );
