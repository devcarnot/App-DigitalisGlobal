-- Soft-delete timestamps for chat: row stays visible as a tombstone (“This message has been deleted”).
alter table public.erp_messages add column if not exists deleted_at timestamptz;
alter table public.erp_direct_messages add column if not exists deleted_at timestamptz;
alter table public.erp_group_messages add column if not exists deleted_at timestamptz;
