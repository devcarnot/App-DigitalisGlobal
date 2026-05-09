-- erp_meetings + erp_meeting_attendees
--
-- Lightweight scheduling: members and clients can be invited; clients cannot
-- organize meetings. Attendees can RSVP. Project linkage is optional. Each
-- meeting carries an auto-generated Jitsi room name; the join URL is computed
-- client-side from NEXT_PUBLIC_JITSI_DOMAIN so this migration carries no
-- conferencing secrets.

create extension if not exists pgcrypto;

create table if not exists public.erp_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30 check (duration_minutes between 5 and 600),
  project_id uuid references public.erp_projects(id) on delete set null,
  location_text text,
  location_url text,
  jitsi_room text,
  created_by uuid not null references public.erp_profiles(id) on delete cascade,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_meetings_scheduled_idx
  on public.erp_meetings (scheduled_at desc);
create index if not exists erp_meetings_creator_idx
  on public.erp_meetings (created_by);
create index if not exists erp_meetings_project_idx
  on public.erp_meetings (project_id);
create index if not exists erp_meetings_status_idx
  on public.erp_meetings (status);

create table if not exists public.erp_meeting_attendees (
  meeting_id uuid not null references public.erp_meetings(id) on delete cascade,
  user_id uuid not null references public.erp_profiles(id) on delete cascade,
  role text not null default 'required'
    check (role in ('organizer', 'required', 'optional')),
  rsvp_status text not null default 'pending'
    check (rsvp_status in ('pending', 'accepted', 'declined', 'tentative')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create index if not exists erp_meeting_attendees_user_idx
  on public.erp_meeting_attendees (user_id, meeting_id);

create or replace function public.erp_meetings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists erp_meetings_updated_at_trg on public.erp_meetings;
create trigger erp_meetings_updated_at_trg
  before update on public.erp_meetings
  for each row execute function public.erp_meetings_set_updated_at();

alter table public.erp_meetings enable row level security;
alter table public.erp_meeting_attendees enable row level security;

-- erp_meetings policies ------------------------------------------------------
drop policy if exists erp_meetings_select on public.erp_meetings;
create policy erp_meetings_select on public.erp_meetings
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or exists (
      select 1 from public.erp_meeting_attendees a
      where a.meeting_id = id and a.user_id = auth.uid()
    )
  );

drop policy if exists erp_meetings_insert on public.erp_meetings;
create policy erp_meetings_insert on public.erp_meetings
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role <> 'client'
    )
  );

drop policy if exists erp_meetings_update on public.erp_meetings;
create policy erp_meetings_update on public.erp_meetings
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_meetings_delete on public.erp_meetings;
create policy erp_meetings_delete on public.erp_meetings
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- erp_meeting_attendees policies --------------------------------------------
-- Non-recursive: an attendee can see their own row, an organizer sees all
-- rows for their meeting, and admins see everything. Cross-attendee
-- visibility (e.g. "see who else is invited") is handled server-side via the
-- service role to avoid policy recursion through erp_meetings.

drop policy if exists erp_meeting_attendees_select on public.erp_meeting_attendees;
create policy erp_meeting_attendees_select on public.erp_meeting_attendees
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.erp_meetings m
      where m.id = meeting_id and m.created_by = auth.uid()
    )
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_meeting_attendees_insert on public.erp_meeting_attendees;
create policy erp_meeting_attendees_insert on public.erp_meeting_attendees
  for insert to authenticated
  with check (
    exists (
      select 1 from public.erp_meetings m
      where m.id = meeting_id
      and (
        m.created_by = auth.uid()
        or exists (
          select 1 from public.erp_profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
    )
  );

drop policy if exists erp_meeting_attendees_update on public.erp_meeting_attendees;
create policy erp_meeting_attendees_update on public.erp_meeting_attendees
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.erp_meetings m
      where m.id = meeting_id and m.created_by = auth.uid()
    )
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.erp_meetings m
      where m.id = meeting_id and m.created_by = auth.uid()
    )
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_meeting_attendees_delete on public.erp_meeting_attendees;
create policy erp_meeting_attendees_delete on public.erp_meeting_attendees
  for delete to authenticated
  using (
    exists (
      select 1 from public.erp_meetings m
      where m.id = meeting_id
      and (
        m.created_by = auth.uid()
        or exists (
          select 1 from public.erp_profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
    )
  );
