-- Controlled DB-first historical LMP CSV backfill.
-- The caller supplies canonical DB patches produced from the shared field map.
-- This function is one transaction: any unexpected error rolls back LMP writes
-- and the final Sheet reconcile queue entry together.

CREATE OR REPLACE FUNCTION public.import_historical_lmp_backfill(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_patch jsonb;
  v_matches int;
  v_existing public.lmp_processes%ROWTYPE;
  v_saved public.lmp_processes%ROWTYPE;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_ambiguous int := 0;
  v_generated jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_row_number int;
  v_company text;
  v_role text;
  v_date date;
  v_lmp_code text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT (
    public.has_role(v_actor, 'admin'::app_role)
    OR public.has_role(v_actor, 'allocator'::app_role)
  ) THEN
    RAISE EXCEPTION 'ADMIN_OR_ALLOCATOR_REQUIRED';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_patch := COALESCE(v_item->'patch', '{}'::jsonb);
    v_row_number := COALESCE((v_item->>'row_number')::int, 0);
    v_company := NULLIF(btrim(v_patch->>'company'), '');
    v_role := NULLIF(btrim(v_patch->>'role'), '');
    v_lmp_code := NULLIF(btrim(v_patch->>'lmp_code'), '');
    v_date := CASE
      WHEN COALESCE(v_patch->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (v_patch->>'date')::date
      ELSE NULL
    END;

    IF v_company IS NULL OR v_role IS NULL THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', v_row_number, 'reason', 'Company and Role are required'));
      CONTINUE;
    END IF;

    IF v_lmp_code IS NOT NULL THEN
      SELECT count(*) INTO v_matches FROM public.lmp_processes WHERE lower(lmp_code) = lower(v_lmp_code);
      SELECT * INTO v_existing FROM public.lmp_processes WHERE lower(lmp_code) = lower(v_lmp_code) LIMIT 1;
    ELSIF v_date IS NOT NULL THEN
      SELECT count(*) INTO v_matches
      FROM public.lmp_processes
      WHERE lower(btrim(company)) = lower(v_company)
        AND lower(btrim(role)) = lower(v_role)
        AND date = v_date;
      SELECT * INTO v_existing
      FROM public.lmp_processes
      WHERE lower(btrim(company)) = lower(v_company)
        AND lower(btrim(role)) = lower(v_role)
        AND date = v_date
      LIMIT 1;
    ELSE
      v_matches := 0;
    END IF;

    IF v_matches > 1 THEN
      v_ambiguous := v_ambiguous + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', v_row_number, 'reason', 'AMBIGUOUS_EXACT_MATCH'));
      CONTINUE;
    END IF;

    IF v_matches = 0 THEN
      INSERT INTO public.lmp_processes (
        company, role, date, domain_raw, status, type, daily_progress,
        prep_doc_shared, mentor_aligned, assignment_review, one_to_one_mock,
        next_progress_date, next_progress_type, r1_shortlisted, r2_shortlisted,
        r3_shortlisted, final_convert, convert_names, prep_doc_link, prep_poc,
        support_poc, outreach_poc, closing_date, mentor_selected, mentor_rating,
        comments, lmp_code, created_by, created_at, sync_source
      ) VALUES (
        v_company,
        v_role,
        v_date,
        NULLIF(v_patch->>'domain_raw', ''),
        COALESCE(NULLIF(v_patch->>'status', ''), 'not-started'),
        NULLIF(v_patch->>'type', ''),
        NULLIF(v_patch->>'daily_progress', ''),
        CASE WHEN v_patch ? 'prep_doc_shared' THEN (v_patch->>'prep_doc_shared')::boolean ELSE NULL END,
        CASE WHEN v_patch ? 'mentor_aligned' THEN (v_patch->>'mentor_aligned')::boolean ELSE NULL END,
        CASE WHEN v_patch ? 'assignment_review' THEN (v_patch->>'assignment_review')::boolean ELSE NULL END,
        CASE WHEN v_patch ? 'one_to_one_mock' THEN (v_patch->>'one_to_one_mock')::boolean ELSE NULL END,
        NULLIF(v_patch->>'next_progress_date', '')::date,
        NULLIF(v_patch->>'next_progress_type', ''),
        NULLIF(v_patch->>'r1_shortlisted', ''),
        NULLIF(v_patch->>'r2_shortlisted', ''),
        NULLIF(v_patch->>'r3_shortlisted', ''),
        NULLIF(v_patch->>'final_convert', ''),
        NULLIF(v_patch->>'convert_names', ''),
        NULLIF(v_patch->>'prep_doc_link', ''),
        NULLIF(v_patch->>'prep_poc', ''),
        NULLIF(v_patch->>'support_poc', ''),
        NULLIF(v_patch->>'outreach_poc', ''),
        NULLIF(v_patch->>'closing_date', '')::date,
        NULLIF(v_patch->>'mentor_selected', ''),
        NULLIF(v_patch->>'mentor_rating', '')::numeric,
        NULLIF(v_patch->>'comments', ''),
        v_lmp_code,
        v_actor,
        COALESCE(v_date::timestamptz + interval '12 hours', now()),
        'historical_csv_backfill'
      )
      RETURNING * INTO v_saved;
      v_inserted := v_inserted + 1;
      v_generated := v_generated || jsonb_build_array(v_saved.lmp_code);
    ELSE
      UPDATE public.lmp_processes
      SET
        date = COALESCE(date, v_date),
        domain_raw = COALESCE(NULLIF(domain_raw, ''), NULLIF(v_patch->>'domain_raw', '')),
        status = COALESCE(NULLIF(status, ''), NULLIF(v_patch->>'status', '')),
        type = COALESCE(NULLIF(type, ''), NULLIF(v_patch->>'type', '')),
        daily_progress = COALESCE(NULLIF(daily_progress, ''), NULLIF(v_patch->>'daily_progress', '')),
        prep_doc_shared = COALESCE(prep_doc_shared, CASE WHEN v_patch ? 'prep_doc_shared' THEN (v_patch->>'prep_doc_shared')::boolean END),
        mentor_aligned = COALESCE(mentor_aligned, CASE WHEN v_patch ? 'mentor_aligned' THEN (v_patch->>'mentor_aligned')::boolean END),
        assignment_review = COALESCE(assignment_review, CASE WHEN v_patch ? 'assignment_review' THEN (v_patch->>'assignment_review')::boolean END),
        one_to_one_mock = COALESCE(one_to_one_mock, CASE WHEN v_patch ? 'one_to_one_mock' THEN (v_patch->>'one_to_one_mock')::boolean END),
        next_progress_date = COALESCE(next_progress_date, NULLIF(v_patch->>'next_progress_date', '')::date),
        next_progress_type = COALESCE(NULLIF(next_progress_type, ''), NULLIF(v_patch->>'next_progress_type', '')),
        r1_shortlisted = COALESCE(NULLIF(r1_shortlisted, ''), NULLIF(v_patch->>'r1_shortlisted', '')),
        r2_shortlisted = COALESCE(NULLIF(r2_shortlisted, ''), NULLIF(v_patch->>'r2_shortlisted', '')),
        r3_shortlisted = COALESCE(NULLIF(r3_shortlisted, ''), NULLIF(v_patch->>'r3_shortlisted', '')),
        final_convert = COALESCE(NULLIF(final_convert, ''), NULLIF(v_patch->>'final_convert', '')),
        convert_names = COALESCE(NULLIF(convert_names, ''), NULLIF(v_patch->>'convert_names', '')),
        prep_doc_link = COALESCE(NULLIF(prep_doc_link, ''), NULLIF(v_patch->>'prep_doc_link', '')),
        prep_poc = COALESCE(NULLIF(prep_poc, ''), NULLIF(v_patch->>'prep_poc', '')),
        support_poc = COALESCE(NULLIF(support_poc, ''), NULLIF(v_patch->>'support_poc', '')),
        outreach_poc = COALESCE(NULLIF(outreach_poc, ''), NULLIF(v_patch->>'outreach_poc', '')),
        closing_date = COALESCE(closing_date, NULLIF(v_patch->>'closing_date', '')::date),
        mentor_selected = COALESCE(NULLIF(mentor_selected, ''), NULLIF(v_patch->>'mentor_selected', '')),
        mentor_rating = COALESCE(mentor_rating, NULLIF(v_patch->>'mentor_rating', '')::numeric),
        comments = COALESCE(NULLIF(comments, ''), NULLIF(v_patch->>'comments', '')),
        sync_source = 'historical_csv_backfill'
      WHERE id = v_existing.id
      RETURNING * INTO v_saved;

      IF v_saved IS NULL THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.enqueue_lmp_sheet_reconcile();

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'ambiguous', v_ambiguous,
    'generated_lmp_ids', v_generated,
    'errors', v_errors,
    'sheet_reconcile_queued', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_historical_lmp_backfill(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_historical_lmp_backfill(jsonb) TO authenticated;

COMMENT ON FUNCTION public.import_historical_lmp_backfill(jsonb) IS
  'Admin/allocator-only transactional historical LMP backfill. Preserves non-empty DB values and queues existing Sheet reconcile after success.';

NOTIFY pgrst, 'reload schema';
