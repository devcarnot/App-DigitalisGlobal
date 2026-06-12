-- Add ABN to invoice customers (safe to re-run).
alter table public.erp_invoice_customers add column if not exists abn text;

comment on column public.erp_invoice_customers.abn is 'Australian Business Number (optional).';
