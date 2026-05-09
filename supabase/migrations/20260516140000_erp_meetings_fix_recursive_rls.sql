-- Fix infinite recursion between erp_meetings and erp_meeting_attendees RLS.
--
-- The original policies (migration 20260515120000_erp_meetings.sql) ran an
-- `exists` subquery against the *other* table inside each policy, which forced
-- Postgres to re-apply the other table's RLS policy and so on, hitting
--   "infinite recursion detected in policy for relation \"erp_meetings\"".
--
-- The standard Supabase pattern is to do those lookups through
-- `security definer` helper functions. The function bypasses RLS (it runs as
-- the function owner, not the caller), so the recursion chain is broken.
--
-- Each helper is `stable` and has its `search_path` pinned to `public` to
-- avoid search_path attacks, and is granted to `authenticated` only.

-- 1. Helpers ----------------------------------------------------------------

create or replace function public.erp_user_is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.erp_profiles
    where id = uid and role = 'admin'
  );
$$;

create or replace function public.erp_user_is_meeting_organizer(mid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.erp_meetings
    where id = mid and created_by = uid
  );
$$;

create or replace function public.erp_user_is_meeting_attendee(mid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.erp_meeting_attendees
    where meeting_id = mid and user_id = uid
  );
$$;

-- Lock down execution: only signed-in callers (or the service role, which
-- bypasses GRANTs anyway) should be able to invoke these.
revoke all on function public.erp_user_is_admin(uuid) from public;
revoke all on function public.erp_user_is_meeting_organizer(uuid, uuid) from public;
revoke all on function public.erp_user_is_meeting_attendee(uuid, uuid) from public;
grant execute on function public.erp_user_is_admin(uuid) to authenticated;
grant execute on function public.erp_user_is_meeting_organizer(uuid, uuid) to authenticated;
grant execute on function public.erp_user_is_meeting_attendee(uuid, uuid) to authenticated;

-- 2. erp_meetings policies --------------------------------------------------

drop policy if exists erp_meetings_select on public.erp_meetings;
create policy erp_meetings_select on public.erp_meetings
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.erp_user_is_admin(auth.uid())
    or public.erp_user_is_meeting_attendee(id, auth.uid())
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
    or public.erp_user_is_admin(auth.uid())
  )
  with check (
    created_by = auth.uid()
    or public.erp_user_is_admin(auth.uid())
  );

drop policy if exists erp_meetings_delete on public.erp_meetings;
create policy erp_meetings_delete on public.erp_meetings
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.erp_user_is_admin(auth.uid())
  );

-- 3. erp_meeting_attendees policies -----------------------------------------

drop policy if exists erp_meeting_attendees_select on public.erp_meeting_attendees;
create policy erp_meeting_attendees_select on public.erp_meeting_attendees
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.erp_user_is_meeting_organizer(meeting_id, auth.uid())
    or public.erp_user_is_admin(auth.uid())
  );

drop policy if exists erp_meeting_attendees_insert on public.erp_meeting_attendees;
create policy erp_meeting_attendees_insert on public.erp_meeting_attendees
  for insert to authenticated
  with check (
    public.erp_user_is_meeting_organizer(meeting_id, auth.uid())
    or public.erp_user_is_admin(auth.uid())
  );

drop policy if exists erp_meeting_attendees_update on public.erp_meeting_attendees;
create policy erp_meeting_attendees_update on public.erp_meeting_attendees
  for update to authenticated
  using (
    user_id = auth.uid()
    or public.erp_user_is_meeting_organizer(meeting_id, auth.uid())
    or public.erp_user_is_admin(auth.uid())
  )
  with check (
    user_id = auth.uid()
    or public.erp_user_is_meeting_organizer(meeting_id, auth.uid())
    or public.erp_user_is_admin(auth.uid())
  );

drop policy if exists erp_meeting_attendees_delete on public.erp_meeting_attendees;
create policy erp_meeting_attendees_delete on public.erp_meeting_attendees
  for delete to authenticated
  using (
    public.erp_user_is_meeting_organizer(meeting_id, auth.uid())
    or public.erp_user_is_admin(auth.uid())
  );
