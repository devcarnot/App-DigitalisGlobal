-- Add optional time_zone metadata on meetings.
--
-- The actual instant continues to live in `scheduled_at` (`timestamptz`) so
-- everything stays DST/aggregation safe. This column just records the IANA
-- zone the organizer used when scheduling: handy for the details panel to
-- show "Originally scheduled in Asia/Karachi" so attendees in another zone
-- aren't left guessing which side of the time difference is "the right one".
--
-- Column is nullable so existing rows keep working untouched.

alter table public.erp_meetings
  add column if not exists time_zone text;

comment on column public.erp_meetings.time_zone is
  'IANA timezone name the organizer used when scheduling (informational only: scheduled_at is the source of truth).';
