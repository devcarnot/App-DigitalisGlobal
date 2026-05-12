-- Add phone number and free-form notes to CRM lead cards.
--
-- The pipeline lead form has, until now, captured company / contact / email
-- only. Users have asked for two more fields:
--   * `phone` — the prospect's phone number, so we don't have to look it up
--     in email signatures or external sheets when it's time to call.
--   * `notes` — a free-form scratchpad for "what was discussed / what to
--     discuss next", per-lead. This is intentionally a single text column
--     (not a separate activity log table) so the change is additive and the
--     UI can render it inline on the Kanban card and in the edit modal.
--
-- Both columns are nullable so every existing row stays valid. No RLS
-- changes are needed — leads are still service-role-only via the API
-- routes; we just widen the projected/updatable shape.

alter table public.erp_crm_leads
  add column if not exists phone text,
  add column if not exists notes text;
