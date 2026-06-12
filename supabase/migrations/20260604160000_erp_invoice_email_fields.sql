-- CC, BCC, and custom subject for invoice emails
alter table public.erp_invoices
  add column if not exists email_cc text,
  add column if not exists email_bcc text,
  add column if not exists email_subject text;
