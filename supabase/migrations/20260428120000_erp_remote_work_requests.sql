-- Remote / WFH requests (parallel to erp_leave_requests).
-- Run in Supabase SQL Editor if migrations folder is not auto-applied.

create table if not exists public.erp_remote_work_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  day_count integer not null check (day_count > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_remote_work_requests_user_id_idx on public.erp_remote_work_requests (user_id);
create index if not exists erp_remote_work_requests_status_idx on public.erp_remote_work_requests (status);
create index if not exists erp_remote_work_requests_created_at_idx on public.erp_remote_work_requests (created_at desc);

alter table public.erp_remote_work_requests enable row level security;

-- Members: own rows
create policy "erp_remote_select"
  on public.erp_remote_work_requests for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.erp_profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'team_lead')
    )
  );

create policy "erp_remote_insert"
  on public.erp_remote_work_requests for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.erp_profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'team_lead', 'team_member')
    )
  );

-- Member: cancel own pending request
create policy "erp_remote_update_own_cancel"
  on public.erp_remote_work_requests for update
  to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'cancelled');

-- Admin / team lead: approve or reject pending requests
create policy "erp_remote_update_reviewer"
  on public.erp_remote_work_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'team_lead')
    )
    and status = 'pending'
  )
  with check (
    exists (
      select 1 from public.erp_profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'team_lead')
    )
    and status in ('approved', 'rejected')
  );

grant select, insert, update on public.erp_remote_work_requests to authenticated;
