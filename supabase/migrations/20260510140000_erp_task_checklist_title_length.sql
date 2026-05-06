-- Relax checklist title length (pastable notes) with a clear cap.
ALTER TABLE public.erp_task_checklist_items DROP CONSTRAINT IF EXISTS erp_task_checklist_title_max;

DO $$
DECLARE
  maxlen int;
BEGIN
  SELECT character_maximum_length::int INTO maxlen
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'erp_task_checklist_items'
    AND column_name = 'title';

  IF maxlen IS NOT NULL AND maxlen < 2000 THEN
    ALTER TABLE public.erp_task_checklist_items
      ALTER COLUMN title TYPE VARCHAR(2000);
  END IF;
END $$;

ALTER TABLE public.erp_task_checklist_items
  ADD CONSTRAINT erp_task_checklist_title_max CHECK (char_length(title) <= 2000);
