-- Fix: enqueue_lmp_sheet_mirror_from_candidate never reset sync_source after
-- updating lmp_processes.r1/r2/r3_shortlisted. If the row's sync_source was
-- previously 'sheet' or 'trigger_mirror' (from any prior sync), the
-- enqueue_lmp_sheet_mirror trigger exits early (RETURN NEW at the guard on
-- COALESCE(NEW.sync_source,'') IN ('sheet','trigger_mirror')), so neither
-- net.http_post nor the sheet_write_queue insert ever happens — the sheet
-- stays at 0 even when the DB has candidate names.
--
-- Fix: set sync_source = NULL in the UPDATE so the guard passes through and
-- enqueue_lmp_sheet_mirror fires the sheet push as intended.

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id    uuid;
  v_r1_names  text;
  v_r2_names  text;
  v_r3_names  text;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r1','r1_shortlisted','shortlisted','round_1','round1'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r2','r2_shortlisted','round_2','round2'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r3','r3_shortlisted','round_3','round3'])
    )
  INTO v_r1_names, v_r2_names, v_r3_names
  FROM public.lmp_candidates
  WHERE lmp_id = v_lmp_id;

  -- Reset sync_source to NULL so enqueue_lmp_sheet_mirror does NOT early-return.
  -- Without this, any row where sync_source = 'sheet' or 'trigger_mirror'
  -- causes enqueue_lmp_sheet_mirror to skip both net.http_post and the queue
  -- insert, leaving the Google Sheet stale.
  UPDATE public.lmp_processes
     SET r1_shortlisted = v_r1_names,
         r2_shortlisted = v_r2_names,
         r3_shortlisted = v_r3_names,
         sync_source    = NULL,
         updated_at     = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backfill: push all LMPs that currently have shortlisted names in the DB
-- (but not yet in the sheet) to the sheet via the existing trigger mechanism.
-- We do a touch-UPDATE (set sync_source = NULL, updated_at = now()) on each
-- affected lmp_processes row. However, the change-detection guard in
-- enqueue_lmp_sheet_mirror only checks specific operational columns, NOT
-- sync_source/updated_at. So touching just those two columns would be skipped
-- by the guard. Instead, we call net.http_post directly to force the sheet push
-- for every LMP that has at least one shortlisted candidate name.
DO $$
DECLARE
  r record;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4';
  v_payload  jsonb;
BEGIN
  FOR r IN
    SELECT
      lp.company,
      lp.role,
      lp.lmp_code,
      lp.r1_shortlisted,
      lp.r2_shortlisted,
      lp.r3_shortlisted
    FROM public.lmp_processes lp
    WHERE (lp.r1_shortlisted IS NOT NULL
        OR lp.r2_shortlisted IS NOT NULL
        OR lp.r3_shortlisted IS NOT NULL)
      AND lp.company IS NOT NULL
      AND lp.role    IS NOT NULL
  LOOP
    v_payload := jsonb_build_object(
      'op',        'sync-db-to-sheet',
      'tab',       'LMP Tracker',
      'headerRow', 15,
      'company',   r.company,
      'role',      r.role,
      'lmp_code',  r.lmp_code,
      'dbPatch',   jsonb_build_object(
        'r1_shortlisted', r.r1_shortlisted,
        'r2_shortlisted', r.r2_shortlisted,
        'r3_shortlisted', r.r3_shortlisted
      )
    );

    BEGIN
      PERFORM net.http_post(
        url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/sheets-lmp',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        v_anon_key,
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body    := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill net.http_post failed for %/%: %', r.company, r.role, SQLERRM;
    END;
  END LOOP;
END;
$$;
