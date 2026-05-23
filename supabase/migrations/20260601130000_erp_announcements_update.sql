-- Allow Super Admin to edit announcements + track last update time.
-- Safe to re-run.

alter table public.erp_announcements
  add column if not exists updated_at timestamptz;

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
