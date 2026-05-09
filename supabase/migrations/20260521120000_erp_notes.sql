-- Personal Kanban-style notes board for admin / HR / team manager roles.
--
-- Each row is private to its author; the board UI lives at /erp/notes and is
-- gated by the `notes` RBAC module (which the app code defaults on for
-- admin / team_lead / hr). RLS here is tighter than the RBAC gate on
-- purpose: even a misconfigured role grant cannot leak another user's
-- notes — the policies require `user_id = auth.uid()` for every action.

create extension if not exists pgcrypto;

create table if not exists public.erp_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.erp_profiles(id) on delete cascade,
  -- Short pinned headline.
  title text not null,
  -- Markdown / sanitized HTML body (same pipeline as task descriptions).
  body text,
  -- Kanban column. Open-ended so the board can introduce new lanes without
  -- a migration; the UI ships with todo / doing / done by default.
  column_key text not null default 'todo',
  -- Visual tag. Constrained to a small palette to keep the board readable.
  color text not null default 'slate'
    check (color in ('slate', 'teal', 'sky', 'violet', 'amber', 'rose', 'emerald')),
  -- Star a card to float it to the top of its column.
  pinned boolean not null default false,
  -- Optional reminder; the board chips it red when overdue.
  due_at timestamptz,
  -- Per-(user, column) ordering. Lower = top of the column.
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_notes_user_idx
  on public.erp_notes (user_id, column_key, sort_order);
create index if not exists erp_notes_user_updated_idx
  on public.erp_notes (user_id, updated_at desc);

create or replace function public.erp_notes_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists erp_notes_updated_at_trg on public.erp_notes;
create trigger erp_notes_updated_at_trg
  before update on public.erp_notes
  for each row execute function public.erp_notes_set_updated_at();

alter table public.erp_notes enable row level security;

drop policy if exists erp_notes_select on public.erp_notes;
create policy erp_notes_select on public.erp_notes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists erp_notes_insert on public.erp_notes;
create policy erp_notes_insert on public.erp_notes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists erp_notes_update on public.erp_notes;
create policy erp_notes_update on public.erp_notes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists erp_notes_delete on public.erp_notes;
create policy erp_notes_delete on public.erp_notes
  for delete to authenticated
  using (user_id = auth.uid());

-- Realtime: useful so a second tab/window picks up edits without a refresh.
do $$
begin
  begin
    alter publication supabase_realtime add table public.erp_notes;
  exception when duplicate_object then null;
  end;
end$$;
