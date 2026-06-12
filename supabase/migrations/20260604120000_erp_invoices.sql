-- QuickBooks-style invoices (Super Admin only)
-- Safe to re-run.

create extension if not exists pgcrypto;

create sequence if not exists erp_invoice_number_seq start 1;

create table if not exists public.erp_invoice_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) > 0),
  email text,
  phone text,
  company_name text,
  abn text,
  billing_address text,
  city text,
  state text,
  postal_code text,
  country text default 'Australia',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists erp_invoice_customers_name_idx
  on public.erp_invoice_customers (lower(display_name));

create table if not exists public.erp_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number integer not null default nextval('erp_invoice_number_seq'),
  customer_id uuid references public.erp_invoice_customers(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issue_date date not null default (current_date),
  due_date date,
  terms text not null default 'Net 30',
  currency text not null default 'AUD',
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  discount_percent numeric(6, 2) not null default 0,
  shipping_fee numeric(12, 2) not null default 0,
  deposit_amount numeric(12, 2) not null default 0,
  tax_rate numeric(6, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  balance_due numeric(12, 2) not null default 0,
  customer_note text,
  internal_memo text,
  email_message text,
  show_deposit boolean not null default false,
  show_discount boolean not null default false,
  show_shipping boolean not null default false,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references public.erp_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (invoice_number)
);

create index if not exists erp_invoices_status_idx on public.erp_invoices (status);
create index if not exists erp_invoices_issue_date_idx on public.erp_invoices (issue_date desc);
create index if not exists erp_invoices_customer_idx on public.erp_invoices (customer_id);

create table if not exists public.erp_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.erp_invoices(id) on delete cascade,
  product_service text,
  description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists erp_invoice_line_items_invoice_idx
  on public.erp_invoice_line_items (invoice_id, sort_order);

alter table public.erp_invoice_customers enable row level security;
alter table public.erp_invoices enable row level security;
alter table public.erp_invoice_line_items enable row level security;

-- Super Admin only
drop policy if exists erp_invoice_customers_all on public.erp_invoice_customers;
create policy erp_invoice_customers_all on public.erp_invoice_customers
  for all to authenticated
  using (
    exists (select 1 from public.erp_profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.erp_profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists erp_invoices_all on public.erp_invoices;
create policy erp_invoices_all on public.erp_invoices
  for all to authenticated
  using (
    exists (select 1 from public.erp_profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.erp_profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists erp_invoice_line_items_all on public.erp_invoice_line_items;
create policy erp_invoice_line_items_all on public.erp_invoice_line_items
  for all to authenticated
  using (
    exists (select 1 from public.erp_profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.erp_profiles p where p.id = auth.uid() and p.role = 'admin')
  );
