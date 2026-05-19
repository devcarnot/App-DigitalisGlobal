-- Realtime: sync attendance check-in/out/break across tabs, web app, and desktop app.
do $$
begin
  begin
    alter publication supabase_realtime add table public.erp_attendance_days;
  exception when duplicate_object then null;
  end;
end$$;
