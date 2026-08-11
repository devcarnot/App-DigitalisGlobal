-- Project-level priority (independent of tasks: used when a project has no tasks yet).

alter table public.erp_projects
  add column if not exists priority text not null default 'medium';

alter table public.erp_projects drop constraint if exists erp_projects_priority_check;
alter table public.erp_projects
  add constraint erp_projects_priority_check
  check (priority in ('critical', 'high', 'medium', 'normal'));
