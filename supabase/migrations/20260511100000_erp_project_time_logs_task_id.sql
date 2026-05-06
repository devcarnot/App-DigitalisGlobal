-- Optional link from project time segments to an ERP task (per-task aggregates in history UI).
ALTER TABLE public.erp_project_time_logs
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.erp_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_erp_project_time_logs_proj_user_task
  ON public.erp_project_time_logs(project_id, user_id, task_id);
