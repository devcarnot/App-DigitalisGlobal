-- Allow projects to be shelved in an Ice Box board column.

alter table public.erp_projects drop constraint if exists erp_projects_board_column_check;
alter table public.erp_projects
  add constraint erp_projects_board_column_check
  check (board_column in ('todo', 'in_progress', 'review', 'completed', 'icebox'));

create or replace function public.erp_set_project_board_column(
  p_project_id uuid,
  p_column text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from text;
  v_name text;
  v_col text := lower(trim(coalesce(p_column, '')));
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;

  if v_col not in ('todo', 'in_progress', 'review', 'completed', 'icebox') then
    raise exception 'invalid board column' using errcode = 'P0001';
  end if;

  if not public.erp_user_can_edit_project(p_project_id, v_uid) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select board_column, name
    into v_from, v_name
  from public.erp_projects
  where id = p_project_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'project not found' using errcode = 'P0001';
  end if;

  if v_from is not distinct from v_col then
    return;
  end if;

  update public.erp_projects
     set board_column = v_col,
         updated_at = now()
   where id = p_project_id;

  insert into public.erp_activity_log (project_id, user_id, action, meta)
  values (
    p_project_id,
    v_uid,
    'project_column_changed',
    jsonb_build_object('name', v_name, 'from', v_from, 'to', v_col)
  );
end;
$$;

grant execute on function public.erp_set_project_board_column(uuid, text) to authenticated;
