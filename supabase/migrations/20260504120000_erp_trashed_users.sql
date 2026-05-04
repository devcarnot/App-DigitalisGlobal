-- Snapshot of deleted workspace users so admins can see who was removed
-- (and how to re-invite them) from the Trash page. The auth.users row is
-- still hard-deleted by the existing user DELETE endpoint; this table is a
-- separate audit + re-invite trail and is not coupled to auth.users via FK.

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

comment on table public.erp_trashed_users is
  'Snapshot of users removed via the workspace user-delete flow. Used by the Trash page to show who was deleted and let admins re-invite them.';
comment on column public.erp_trashed_users.original_user_id is
  'Auth user id at the time of deletion (the auth.users row itself has already been removed; this is informational only).';
comment on column public.erp_trashed_users.purge_at is
  'When the trash record itself becomes eligible for permanent removal (Delete forever / janitor sweep).';

alter table public.erp_trashed_users enable row level security;

-- Workspace admins and team leads can read the trashed-users list. Writes
-- are performed exclusively by the service-role server endpoint, so we do
-- not expose insert/update/delete policies to authenticated users.
drop policy if exists erp_trashed_users_select_admins on public.erp_trashed_users;
create policy erp_trashed_users_select_admins on public.erp_trashed_users
  for select using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'team_lead')
    )
  );
