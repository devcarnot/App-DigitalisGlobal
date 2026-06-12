-- Track when invoice emails are opened (tracking pixel + optional Resend id)

alter table public.erp_invoices
  add column if not exists email_track_token text,
  add column if not exists resend_email_id text,
  add column if not exists email_opened_at timestamptz,
  add column if not exists email_open_count integer not null default 0;

create unique index if not exists erp_invoices_email_track_token_uidx
  on public.erp_invoices (email_track_token)
  where email_track_token is not null;

create index if not exists erp_invoices_resend_email_id_idx
  on public.erp_invoices (resend_email_id)
  where resend_email_id is not null;
