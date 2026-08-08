-- CRM lead activity timeline (calls, notes, stage changes, follow-ups).

create table if not exists public.erp_crm_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.erp_crm_leads(id) on delete cascade,
  activity_type text not null check (
    activity_type in ('call', 'email', 'note', 'task', 'meeting', 'stage_change', 'sms', 'other')
  ),
  title text not null,
  body text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists erp_crm_lead_activities_lead_idx
  on public.erp_crm_lead_activities (lead_id, created_at desc);

create index if not exists erp_crm_lead_activities_type_idx
  on public.erp_crm_lead_activities (activity_type);

alter table public.erp_crm_lead_activities enable row level security;

comment on table public.erp_crm_lead_activities is
  'Per-lead CRM timeline: calls, emails, notes, tasks, meetings, and pipeline stage moves.';

do $$
begin
  alter publication supabase_realtime add table public.erp_crm_lead_activities;
exception
  when duplicate_object then null;
end $$;
