-- Align message INSERT with channel access (global admins + project members on allowed channels).
drop policy if exists erp_messages_insert on public.erp_messages;
create policy erp_messages_insert on public.erp_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and channel_id is not null
    and public.erp_user_can_access_project_channel(channel_id)
    and exists (
      select 1
      from public.erp_project_channels c
      where c.id = channel_id and c.project_id = project_id
    )
  );
