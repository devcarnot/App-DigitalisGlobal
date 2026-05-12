-- Per-user Kanban column layout for the personal notes board (`/erp/notes`).
--
-- Notes themselves live in `erp_notes` and reference their lane via
-- `column_key`. Until now the column LAYOUT (titles, colors, order) lived in
-- the browser's localStorage, so customisations didn't sync between the web
-- app and the desktop client, or even between two browsers on the same
-- machine. This table moves that layout to the user's account.
--
-- One row per user. The row holds a JSONB array shaped like:
--
--   [
--     { "key": "todo",   "title": "To do",          "color": "sky" },
--     { "key": "doing",  "title": "In progress",    "color": "amber" },
--     { "key": "urgent", "title": "Urgent",         "color": "rose" }
--   ]
--
-- RLS guarantees a user can only read / write their own row even if RBAC is
-- misconfigured. The board treats a missing row as "use defaults" so this
-- migration is backwards-compatible — nothing breaks if it hasn't been run
-- yet, the board simply keeps using localStorage as it did before.

create table if not exists public.erp_note_columns (
  user_id uuid primary key references public.erp_profiles(id) on delete cascade,
  columns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.erp_note_columns_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists erp_note_columns_updated_at_trg on public.erp_note_columns;
create trigger erp_note_columns_updated_at_trg
  before update on public.erp_note_columns
  for each row execute function public.erp_note_columns_set_updated_at();

alter table public.erp_note_columns enable row level security;

drop policy if exists erp_note_columns_select on public.erp_note_columns;
create policy erp_note_columns_select on public.erp_note_columns
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists erp_note_columns_insert on public.erp_note_columns;
create policy erp_note_columns_insert on public.erp_note_columns
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists erp_note_columns_update on public.erp_note_columns;
create policy erp_note_columns_update on public.erp_note_columns
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists erp_note_columns_delete on public.erp_note_columns;
create policy erp_note_columns_delete on public.erp_note_columns
  for delete to authenticated
  using (user_id = auth.uid());

-- Realtime: a second device/tab gets the new layout the moment it's saved.
do $$
begin
  begin
    alter publication supabase_realtime add table public.erp_note_columns;
  exception when duplicate_object then null;
  end;
end$$;
