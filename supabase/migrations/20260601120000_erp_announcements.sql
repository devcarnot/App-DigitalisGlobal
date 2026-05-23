-- Workspace announcements (Eid holidays, office closures, etc.)
-- Super Admin posts; all internal staff (not client / client_team_member) can read.
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.erp_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  body text not null check (char_length(trim(body)) > 0),
  created_by uuid not null references public.erp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists erp_announcements_created_idx
  on public.erp_announcements (created_at desc);

create index if not exists erp_announcements_creator_idx
  on public.erp_announcements (created_by);

comment on table public.erp_announcements is
  'Workspace-wide announcements for internal staff (excludes client roles).';

alter table public.erp_announcements enable row level security;

-- Staff (non-client roles) can read announcements.
drop policy if exists erp_announcements_select on public.erp_announcements;
create policy erp_announcements_select on public.erp_announcements
  for select to authenticated
  using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') not in ('client', 'client_team_member')
    )
  );

-- Super Admin only can publish announcements.
drop policy if exists erp_announcements_insert on public.erp_announcements;
create policy erp_announcements_insert on public.erp_announcements
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_announcements_delete on public.erp_announcements;
create policy erp_announcements_delete on public.erp_announcements
  for delete to authenticated
  using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_announcements_update on public.erp_announcements;
create policy erp_announcements_update on public.erp_announcements
  for update to authenticated
  using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
