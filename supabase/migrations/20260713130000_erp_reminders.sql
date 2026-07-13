-- Personal / team reminders with scheduled push + in-app notification.
-- Super Admin can assign reminders to any workspace member; everyone else
-- can only create reminders for themselves. Cron at /api/cron/erp-reminders
-- (every ~5 min) fires push + in-app notification when remind_at is due.
-- fires once per row (idempotent via reminder_sent_at).

create extension if not exists pgcrypto;

create table if not exists public.erp_reminders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.erp_profiles(id) on delete cascade,
  assigned_to uuid not null references public.erp_profiles(id) on delete cascade,
  title text not null,
  body text,
  remind_at timestamptz not null,
  reminder_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_reminders_assigned_upcoming_idx
  on public.erp_reminders (assigned_to, remind_at)
  where completed_at is null;

create index if not exists erp_reminders_due_unsent_idx
  on public.erp_reminders (remind_at)
  where reminder_sent_at is null and completed_at is null;

create or replace function public.erp_reminders_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists erp_reminders_updated_at_trg on public.erp_reminders;
create trigger erp_reminders_updated_at_trg
  before update on public.erp_reminders
  for each row execute function public.erp_reminders_set_updated_at();

alter table public.erp_reminders enable row level security;

drop policy if exists erp_reminders_select on public.erp_reminders;
create policy erp_reminders_select on public.erp_reminders
  for select to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_reminders_insert on public.erp_reminders;
create policy erp_reminders_insert on public.erp_reminders
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      assigned_to = auth.uid()
      or exists (
        select 1 from public.erp_profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );

drop policy if exists erp_reminders_update on public.erp_reminders;
create policy erp_reminders_update on public.erp_reminders
  for update to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists erp_reminders_delete on public.erp_reminders;
create policy erp_reminders_delete on public.erp_reminders
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.erp_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.erp_reminders;
  exception when duplicate_object then null;
  end;
end $$;
