-- Track when an automated "starts soon" reminder was sent for a meeting so the
-- cron worker is idempotent. NULL = no reminder sent yet, timestamptz = sent.
--
-- Paired with /api/cron/erp-meeting-reminders which fires once per meeting,
-- ~10 minutes before scheduled_at. The route is gated by CRON_SECRET.

alter table public.erp_meetings
  add column if not exists reminder_sent_at timestamptz;

comment on column public.erp_meetings.reminder_sent_at is
  'Set by /api/cron/erp-meeting-reminders to dedupe the pre-meeting reminder. NULL until sent.';

-- Partial index on the unsent + scheduled subset only: that's the hot path
-- for the cron worker and keeps the index footprint trivial.
create index if not exists erp_meetings_reminder_due_idx
  on public.erp_meetings (scheduled_at)
  where reminder_sent_at is null and status = 'scheduled';
