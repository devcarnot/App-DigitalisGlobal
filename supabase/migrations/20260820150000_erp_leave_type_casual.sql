-- Allow casual leave type (casual + sick = 25 day pool; annual = 25 separate).

ALTER TABLE public.erp_leave_requests
  DROP CONSTRAINT IF EXISTS erp_leave_requests_leave_type_check;

ALTER TABLE public.erp_leave_requests
  ADD CONSTRAINT erp_leave_requests_leave_type_check
  CHECK (leave_type IN ('regular', 'medical', 'casual'));
