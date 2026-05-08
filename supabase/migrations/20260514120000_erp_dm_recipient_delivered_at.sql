-- DM delivery receipt: set when the recipient client acknowledges the message (WhatsApp-style ✓✓).

alter table public.erp_direct_messages add column if not exists recipient_delivered_at timestamptz;

comment on column public.erp_direct_messages.recipient_delivered_at is
  'When the recipient first synced this message; used for sent vs delivered ticks.';
