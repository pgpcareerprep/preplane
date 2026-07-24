-- Activity timestamps + prep_doc tri-state on lmp_processes.
-- Timeline logging stays on AFTER trigger tg_lmp_processes_timeline;
-- timestamps must be assigned in a BEFORE trigger so NEW mutations persist.

ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS checklist_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_doc_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lmp_processes_prep_doc_status_check'
  ) THEN
    ALTER TABLE public.lmp_processes
      ADD CONSTRAINT lmp_processes_prep_doc_status_check
      CHECK (prep_doc_status IS NULL OR prep_doc_status IN ('shared', 'pending', 'na'));
  END IF;
END $$;

ALTER TABLE public.lmp_processes
  ALTER COLUMN prep_doc_status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.tg_lmp_processes_activity_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
    NEW.checklist_updated_at := COALESCE(NEW.checklist_updated_at, now());
    NEW.prep_doc_status := COALESCE(NEW.prep_doc_status, 'pending');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;

  IF NEW.mentor_aligned IS DISTINCT FROM OLD.mentor_aligned
     OR NEW.prep_doc_shared IS DISTINCT FROM OLD.prep_doc_shared
     OR NEW.assignment_review IS DISTINCT FROM OLD.assignment_review
     OR NEW.one_to_one_mock IS DISTINCT FROM OLD.one_to_one_mock
  THEN
    NEW.checklist_updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_lmp_processes_activity_timestamps ON public.lmp_processes;
CREATE TRIGGER tg_lmp_processes_activity_timestamps
BEFORE INSERT OR UPDATE ON public.lmp_processes
FOR EACH ROW
EXECUTE FUNCTION public.tg_lmp_processes_activity_timestamps();

-- Backfill status_changed_at from timeline status updates
-- (event_type='update' AND metadata->>'column'='status'), then updated_at/created_at.
UPDATE public.lmp_processes lp
SET status_changed_at = COALESCE(
  (
    SELECT max(t.created_at)
    FROM public.lmp_timeline t
    WHERE t.lmp_id = lp.id
      AND t.event_type = 'update'
      AND t.metadata->>'column' = 'status'
  ),
  lp.updated_at,
  lp.created_at,
  now()
)
WHERE lp.status_changed_at IS NULL;

-- Backfill checklist_updated_at from checklist timeline events.
UPDATE public.lmp_processes lp
SET checklist_updated_at = COALESCE(
  (
    SELECT max(t.created_at)
    FROM public.lmp_timeline t
    WHERE t.lmp_id = lp.id
      AND t.event_type = 'checklist'
  ),
  lp.updated_at,
  lp.created_at,
  now()
)
WHERE lp.checklist_updated_at IS NULL;

-- Backfill prep_doc_status from existing checklist boolean. Never auto-set 'na'.
UPDATE public.lmp_processes
SET prep_doc_status = CASE
  WHEN prep_doc_shared IS TRUE THEN 'shared'
  ELSE 'pending'
END
WHERE prep_doc_status IS NULL;

ALTER TABLE public.lmp_processes
  ALTER COLUMN status_changed_at SET DEFAULT now(),
  ALTER COLUMN checklist_updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_lmp_processes_status_changed_at
  ON public.lmp_processes (status_changed_at);

CREATE INDEX IF NOT EXISTS idx_lmp_processes_last_progress_updated_at
  ON public.lmp_processes (last_progress_updated_at);
