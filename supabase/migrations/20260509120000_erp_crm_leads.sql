-- CRM: lead pipeline (Kanban) + client acquisition platforms.
-- Leads are workspace-level prospects; not the same as invited erp_profiles clients.

create table if not exists public.erp_client_platform_options (
  id text primary key,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.erp_client_platform_options (id, label, sort_order) values
  ('direct', 'Direct', 10),
  ('upwork', 'Upwork', 20),
  ('airtasker', 'Airtasker', 30),
  ('fiverr', 'Fiverr', 40),
  ('referral', 'Referral', 50)
on conflict (id) do nothing;

create table if not exists public.erp_crm_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  platform_id text references public.erp_client_platform_options (id) on delete set null,
  pipeline_stage text not null default 'new_lead'
    check (
      pipeline_stage in (
        'new_lead',
        'contacted',
        'proposal_sent',
        'negotiating',
        'won',
        'lost'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_crm_leads_pipeline_stage_idx on public.erp_crm_leads (pipeline_stage);
create index if not exists erp_crm_leads_platform_id_idx on public.erp_crm_leads (platform_id);
create index if not exists erp_crm_leads_updated_at_idx on public.erp_crm_leads (updated_at desc);

alter table public.erp_client_platform_options enable row level security;
alter table public.erp_crm_leads enable row level security;

-- Platforms: readable by signed-in ERP users; new rows restricted to admins & team leads.
create policy "erp_client_platform_opts_select_authenticated"
  on public.erp_client_platform_options for select
  to authenticated
  using (
    exists (
      select 1 from public.erp_profiles p
      where p.id = (select auth.uid())
    )
  );

create policy "erp_client_platform_opts_insert_admin_lead"
  on public.erp_client_platform_options for insert
  to authenticated
  with check (
    exists (
      select 1 from public.erp_profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'team_lead')
    )
  );

-- Leads: no direct authenticated access (service role / server routes only).
grant select on public.erp_client_platform_options to authenticated;
grant insert on public.erp_client_platform_options to authenticated;
