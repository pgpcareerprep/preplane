-- Keep the fixed five-box pipeline mirrored to LMP Tracker pairs:
-- Pool N/O, R1 P/Q, R2 R/S, R3 T/U, Converted V/W.

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
  v_pool_names text;
  v_r1_names text;
  v_r2_names text;
  v_r3_names text;
  v_converted_names text;
  v_converted_count integer;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE COALESCE(trim(pipeline_stage), '') = ''
         OR lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['pool','shortlisted','shortlisted_pool','shortlisted-pool'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r1','r1_shortlisted','round_1','round1'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r2','r2_shortlisted','round_2','round2'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r3','r3_shortlisted','round_3','round3'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['converted','offer','final','accepted'])
         OR COALESCE(trim(offer_status), '') <> ''
    ),
    count(*) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['converted','offer','final','accepted'])
         OR COALESCE(trim(offer_status), '') <> ''
    )
  INTO v_pool_names, v_r1_names, v_r2_names, v_r3_names, v_converted_names, v_converted_count
  FROM public.lmp_candidates
  WHERE lmp_id = v_lmp_id;

  UPDATE public.lmp_processes
     SET pool_names = v_pool_names,
         r1_names = v_r1_names,
         r2_names = v_r2_names,
         r3_names = v_r3_names,
         final_converted_names = v_converted_names,
         final_converted_numbers = CASE WHEN v_converted_count > 0 THEN v_converted_count::text ELSE NULL END,
         sync_source = NULL,
         updated_at = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

UPDATE public.field_mapping_registry
   SET app_field = 'final_converted_numbers',
       sync_direction = 'db_to_sheet',
       notes = 'Col V - lmp_processes.final_converted_numbers',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'Final Converted Numbers';

UPDATE public.field_mapping_registry
   SET app_field = 'final_converted_names',
       sync_direction = 'db_to_sheet',
       notes = 'Col W - lmp_processes.final_converted_names',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'Converted Names';

NOTIFY pgrst, 'reload schema';
