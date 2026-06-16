-- Fix: enqueue new LMP INSERT into the Sheet mirror queue.
--
-- Problem: prior versions of enqueue_lmp_sheet_mirror() contained
--   IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
-- which silently skipped sheet sync for brand-new LMPs.
--
-- Fix: replace the trigger function with a version that handles both INSERT
-- and UPDATE identically — both delegate to enqueue_lmp_sheet_mirror_by_id()
-- which carries headerRow=14 and deduplicates via the idempotency_key index.
--
-- Also fixes stale pending queue entries that still carry headerRow=15
-- (the edge function overrides to LMP_TRACKER_HEADER_ROW=14 anyway, but
-- updating here keeps the stored payload canonical).

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id   uuid;
  v_lmp_code text;
  yr         text;
  seq_name   text;
  next_val   bigint;
  candidate  text;
  attempts   int := 0;
BEGIN
  -- Skip writes that originated from the sheet or from migration batch scripts
  -- to prevent echo-back and double-dispatch.
  IF COALESCE(NEW.sync_source, '') IN (
    'sheet',
    'trigger_mirror',
    'backfill_prep_doc_link',
    'resync_comments_prep_doc_link'
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip structurally incomplete records (missing company or role).
  IF COALESCE(NEW.company, '') = '' OR COALESCE(NEW.role, '') = '' THEN
    RETURN NEW;
  END IF;

  -- No TG_OP = 'INSERT' early-return — new LMPs must sync to the sheet.

  v_lmp_id   := NEW.id;
  v_lmp_code := NEW.lmp_code;

  -- Guard: if lmp_code is still null (unlikely — assign_lmp_code BEFORE trigger
  -- should have run first), generate one so enqueue_lmp_sheet_mirror_by_id
  -- does not skip the job.
  IF COALESCE(v_lmp_code, '') = '' THEN
    yr       := to_char(COALESCE(NEW.created_at, now()), 'YYYY');
    seq_name := 'lmp_code_seq_' || yr;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', seq_name);
    LOOP
      EXECUTE format('SELECT nextval(%L)', 'public.' || seq_name) INTO next_val;
      candidate := 'LMP-' || yr || '-' ||
        CASE WHEN next_val < 10000
             THEN lpad(next_val::text, 4, '0')
             ELSE next_val::text
        END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.lmp_processes WHERE lmp_code = candidate);
      attempts := attempts + 1;
      EXIT WHEN attempts > 50;
    END LOOP;
    v_lmp_code := candidate;
    UPDATE public.lmp_processes
    SET lmp_code = v_lmp_code
    WHERE id = v_lmp_id AND (lmp_code IS NULL OR lmp_code = '');
  END IF;

  PERFORM public.enqueue_lmp_sheet_mirror_by_id(v_lmp_id, 'lmp_process_change');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Fix stale pending/failed queue entries that still carry headerRow=15.
-- The edge function always overrides to LMP_TRACKER_HEADER_ROW=14 for the
-- LMP Tracker tab, but keeping the stored payload canonical avoids confusion.
UPDATE public.sheet_write_queue
SET
  payload    = jsonb_set(payload, '{headerRow}', '14'::jsonb, true),
  updated_at = now()
WHERE tab_name = 'LMP Tracker'
  AND status IN ('pending', 'failed')
  AND (payload->>'headerRow') IS DISTINCT FROM '14';

NOTIFY pgrst, 'reload schema';
