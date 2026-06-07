-- Fix: rewrite enqueue_lmp_sheet_mirror_from_candidate to store comma-separated
-- candidate NAMES in r1/r2/r3_shortlisted instead of raw counts.
-- Previously the trigger wrote "1", "2" etc. which caused the pipeline UI to
-- render a card with name "1" (parseNames("1") → ["1"]).
-- Now r1_shortlisted = "Aayush, Raghav" etc., matching what the sheet stores.
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

  UPDATE public.lmp_processes
     SET r1_shortlisted = v_r1_names,
         r2_shortlisted = v_r2_names,
         r3_shortlisted = v_r3_names,
         updated_at     = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backfill existing rows so the pipeline card immediately shows names instead of counts.
DO $$
DECLARE
  r record;
  v_r1 text; v_r2 text; v_r3 text;
BEGIN
  FOR r IN SELECT DISTINCT lmp_id FROM public.lmp_candidates WHERE lmp_id IS NOT NULL LOOP
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
    INTO v_r1, v_r2, v_r3
    FROM public.lmp_candidates
    WHERE lmp_id = r.lmp_id;

    UPDATE public.lmp_processes
       SET r1_shortlisted = v_r1,
           r2_shortlisted = v_r2,
           r3_shortlisted = v_r3
     WHERE id = r.lmp_id;
  END LOOP;
END;
$$;
