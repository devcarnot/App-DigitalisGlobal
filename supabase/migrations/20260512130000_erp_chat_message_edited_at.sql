-- Track last text edit time for inbox + project chat (WhatsApp-style "edited").
alter table public.erp_messages add column if not exists edited_at timestamptz;
alter table public.erp_group_messages add column if not exists edited_at timestamptz;
alter table public.erp_direct_messages add column if not exists edited_at timestamptz;
