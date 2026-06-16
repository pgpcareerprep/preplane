-- Forward-only repair after 20260616000002 renamed LMP process outcome columns.
--
-- Replaces active trigger/RPC function bodies that can still dereference old
-- lmp_processes fields at runtime. Candidate pipeline stage compatibility
-- strings are intentionally preserved; only lmp_processes column references are
-- updated.

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Do NOT enqueue echo or explicit batch writes that are already enqueued by
  -- their caller. This keeps the duplicate-row protection from 20260612000000.
  IF COALESCE(NEW.sync_source, '') IN (
    'sheet',
    'trigger_mirror',
    'backfill_prep_doc_link',
    'resync_comments_prep_doc_link'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_lmp_sheet_mirror_by_id(NEW.id, 'lmp_process_change');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

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
     SET r1_names = v_r1_names,
         r2_names = v_r2_names,
         r3_names = v_r3_names,
         sync_source = NULL,
         updated_at = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_lmp_convert(_lmp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _names text;
  _count int;
BEGIN
  SELECT
    COALESCE(string_agg(NULLIF(trim(student_name), ''), ', '
             ORDER BY student_name), NULL),
    COUNT(*)
  INTO _names, _count
  FROM public.lmp_candidates
  WHERE lmp_id = _lmp_id
    AND (
      lower(coalesce(pipeline_stage,'')) IN ('final','offer','converted')
      OR coalesce(trim(offer_status), '') <> ''
    );

  UPDATE public.lmp_processes
  SET
    final_converted_names = _names,
    final_converted_numbers = CASE WHEN _count > 0 THEN _count::text ELSE NULL END,
    updated_at = now()
  WHERE id = _lmp_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_lmp_convert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_lmp_convert(OLD.lmp_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_lmp_convert(NEW.lmp_id);
    IF TG_OP = 'UPDATE' AND OLD.lmp_id IS DISTINCT FROM NEW.lmp_id THEN
      PERFORM public.recompute_lmp_convert(OLD.lmp_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_lmp_processes_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  nm text;
  added uuid[];
  removed uuid[];
  u uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._log_timeline(NEW.id, 'update',
      'LMP process created for ' || COALESCE(NEW.company,'?') || ' / ' || COALESCE(NEW.role,'?'),
      jsonb_build_object('sync_source', NEW.sync_source));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public._log_timeline(NEW.id, 'update',
      'Status changed: ' || COALESCE(OLD.status,'-') || ' -> ' || COALESCE(NEW.status,'-'),
      jsonb_build_object('column','status','old',OLD.status,'new',NEW.status));
  END IF;

  IF NEW.prep_poc_id IS DISTINCT FROM OLD.prep_poc_id THEN
    SELECT name INTO nm FROM public.poc_profiles WHERE id = NEW.prep_poc_id;
    PERFORM public._log_timeline(NEW.id, 'update',
      CASE WHEN NEW.prep_poc_id IS NULL THEN 'Prep POC removed'
           ELSE 'Prep POC set to ' || COALESCE(nm, NEW.prep_poc::text, '?') END,
      jsonb_build_object('column','prep_poc_id'));
  END IF;

  IF NEW.support_poc_id IS DISTINCT FROM OLD.support_poc_id THEN
    SELECT name INTO nm FROM public.poc_profiles WHERE id = NEW.support_poc_id;
    PERFORM public._log_timeline(NEW.id, 'update',
      CASE WHEN NEW.support_poc_id IS NULL THEN 'Support POC removed'
           ELSE 'Support POC set to ' || COALESCE(nm, NEW.support_poc::text, '?') END,
      jsonb_build_object('column','support_poc_id'));
  END IF;

  IF COALESCE(NEW.outreach_poc_ids,'{}') IS DISTINCT FROM COALESCE(OLD.outreach_poc_ids,'{}') THEN
    added := ARRAY(SELECT unnest(COALESCE(NEW.outreach_poc_ids,'{}')) EXCEPT SELECT unnest(COALESCE(OLD.outreach_poc_ids,'{}')));
    removed := ARRAY(SELECT unnest(COALESCE(OLD.outreach_poc_ids,'{}')) EXCEPT SELECT unnest(COALESCE(NEW.outreach_poc_ids,'{}')));
    FOREACH u IN ARRAY added LOOP
      SELECT name INTO nm FROM public.poc_profiles WHERE id = u;
      PERFORM public._log_timeline(NEW.id,'update','Outreach POC added: '||COALESCE(nm,u::text), jsonb_build_object('column','outreach_poc_ids','poc_id',u));
    END LOOP;
    FOREACH u IN ARRAY removed LOOP
      SELECT name INTO nm FROM public.poc_profiles WHERE id = u;
      PERFORM public._log_timeline(NEW.id,'update','Outreach POC removed: '||COALESCE(nm,u::text), jsonb_build_object('column','outreach_poc_ids','poc_id',u));
    END LOOP;
  END IF;

  IF NEW.mentor_aligned IS DISTINCT FROM OLD.mentor_aligned THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked Mentor aligned as '||CASE WHEN NEW.mentor_aligned THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','mentor_aligned'));
  END IF;
  IF NEW.prep_doc_shared IS DISTINCT FROM OLD.prep_doc_shared THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked Prep doc shared as '||CASE WHEN NEW.prep_doc_shared THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','prep_doc_shared'));
  END IF;
  IF NEW.assignment_review IS DISTINCT FROM OLD.assignment_review THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked Assignment review as '||CASE WHEN NEW.assignment_review THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','assignment_review'));
  END IF;
  IF NEW.one_to_one_mock IS DISTINCT FROM OLD.one_to_one_mock THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked 1:1 mock completed as '||CASE WHEN NEW.one_to_one_mock THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','one_to_one_mock'));
  END IF;

  IF NEW.jd_url IS DISTINCT FROM OLD.jd_url OR NEW.jd_file_name IS DISTINCT FROM OLD.jd_file_name THEN
    IF COALESCE(NEW.jd_url,NEW.jd_file_name,'') <> '' THEN
      PERFORM public._log_timeline(NEW.id,'attachment','JD uploaded: '||COALESCE(NEW.jd_file_name,NEW.jd_url), jsonb_build_object('column','jd_url','attachment_name',COALESCE(NEW.jd_file_name,NEW.jd_url)));
    END IF;
  END IF;

  IF NEW.prep_doc_link IS DISTINCT FROM OLD.prep_doc_link THEN
    IF COALESCE(NEW.prep_doc_link,'') <> '' THEN
      PERFORM public._log_timeline(NEW.id,'attachment','Prep doc link updated', jsonb_build_object('column','prep_doc_link','attachment_name','Prep Doc'));
    END IF;
  END IF;

  IF NEW.next_progress_date IS DISTINCT FROM OLD.next_progress_date
     OR NEW.next_progress_type IS DISTINCT FROM OLD.next_progress_type THEN
    PERFORM public._log_timeline(NEW.id,'update','Next progress: '||COALESCE(NEW.next_progress_type,'-')||' on '||COALESCE(NEW.next_progress_date::text,'-'),
      jsonb_build_object('column','next_progress'));
  END IF;

  IF NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating AND NEW.mentor_rating IS NOT NULL THEN
    PERFORM public._log_timeline(NEW.id,'mentor','Mentor rating set to '||NEW.mentor_rating::text, jsonb_build_object('column','mentor_rating'));
  END IF;

  IF NEW.mentor_selected IS DISTINCT FROM OLD.mentor_selected AND COALESCE(NEW.mentor_selected,'')<>'' THEN
    PERFORM public._log_timeline(NEW.id,'mentor','Mentor selected: '||NEW.mentor_selected, jsonb_build_object('column','mentor_selected'));
  END IF;

  IF NEW.r1_names IS DISTINCT FROM OLD.r1_names THEN
    PERFORM public._log_timeline(NEW.id,'candidate-move','R1 shortlisted updated: '||COALESCE(NEW.r1_names,'-'), jsonb_build_object('column','r1_names'));
  END IF;
  IF NEW.r2_names IS DISTINCT FROM OLD.r2_names THEN
    PERFORM public._log_timeline(NEW.id,'candidate-move','R2 shortlisted updated: '||COALESCE(NEW.r2_names,'-'), jsonb_build_object('column','r2_names'));
  END IF;
  IF NEW.r3_names IS DISTINCT FROM OLD.r3_names THEN
    PERFORM public._log_timeline(NEW.id,'candidate-move','R3 shortlisted updated: '||COALESCE(NEW.r3_names,'-'), jsonb_build_object('column','r3_names'));
  END IF;

  IF NEW.final_converted_numbers IS DISTINCT FROM OLD.final_converted_numbers
     OR NEW.final_converted_names IS DISTINCT FROM OLD.final_converted_names THEN
    PERFORM public._log_timeline(NEW.id,'update','Final convert updated'||CASE WHEN NEW.final_converted_names IS NOT NULL THEN ': '||NEW.final_converted_names ELSE '' END, jsonb_build_object('column','final_converted_numbers'));
  END IF;

  IF NEW.behavioral_status IS DISTINCT FROM OLD.behavioral_status AND COALESCE(NEW.behavioral_status,'')<>'' THEN
    PERFORM public._log_timeline(NEW.id,'update','Behavioral status: '||NEW.behavioral_status, jsonb_build_object('column','behavioral_status'));
  END IF;

  IF NEW.remarks IS DISTINCT FROM OLD.remarks AND COALESCE(NEW.remarks,'')<>'' THEN
    PERFORM public._log_timeline(NEW.id,'remark',NEW.remarks, jsonb_build_object('column','remarks'));
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_poc_lmp_operational_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  IF public.current_poc_id() IS NULL
     OR (
       OLD.prep_poc_id IS DISTINCT FROM public.current_poc_id()
       AND OLD.support_poc_id IS DISTINCT FROM public.current_poc_id()
       AND NOT (public.current_poc_id() = ANY(COALESCE(OLD.outreach_poc_ids, '{}'::uuid[])))
       AND NOT EXISTS (
         SELECT 1
         FROM public.lmp_poc_links link
         WHERE link.lmp_id = OLD.id
           AND link.poc_id = public.current_poc_id()
           AND link.is_active = true
       )
     ) THEN
    RAISE EXCEPTION 'POC_NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;

  IF
    NEW.domain_id IS DISTINCT FROM OLD.domain_id
    OR NEW.date IS DISTINCT FROM OLD.date
    OR NEW.lmp_code IS DISTINCT FROM OLD.lmp_code
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NULLIF(TRIM(COALESCE(NEW.closing_date::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.closing_date::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.domain_raw::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.domain_raw::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.type::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.type::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.admin_owner, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.admin_owner, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.allocator, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.allocator, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.prep_poc, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.prep_poc, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.support_poc, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.support_poc, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.outreach_poc, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.outreach_poc, '')), '')
    OR NEW.prep_poc_id IS DISTINCT FROM OLD.prep_poc_id
    OR NEW.support_poc_id IS DISTINCT FROM OLD.support_poc_id
    OR NEW.outreach_poc_ids IS DISTINCT FROM OLD.outreach_poc_ids
    OR NULLIF(TRIM(COALESCE(NEW.final_converted_numbers::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.final_converted_numbers::text, '')), '')
  THEN
    RAISE EXCEPTION 'POC_FIELD_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

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
      SELECT count(*) INTO v_matches FROM public.lmp_processes lp WHERE lower(lp.lmp_code) = lower(v_lmp_code);
      SELECT * INTO v_existing FROM public.lmp_processes lp WHERE lower(lp.lmp_code) = lower(v_lmp_code) LIMIT 1;
    ELSIF v_date IS NOT NULL THEN
      SELECT count(*) INTO v_matches
      FROM public.lmp_processes lp
      WHERE lower(btrim(lp.company)) = lower(v_company)
        AND lower(btrim(lp.role)) = lower(v_role)
        AND lp.date = v_date::text;
      SELECT * INTO v_existing
      FROM public.lmp_processes lp
      WHERE lower(btrim(lp.company)) = lower(v_company)
        AND lower(btrim(lp.role)) = lower(v_role)
        AND lp.date = v_date::text
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
        next_progress_date, next_progress_type, r1_names, r2_names,
        r3_names, final_converted_numbers, final_converted_names, prep_doc_link, prep_poc,
        support_poc, outreach_poc, closing_date, mentor_selected, mentor_rating,
        comments, lmp_code, created_by, created_at, sync_source
      ) VALUES (
        v_company,
        v_role,
        v_date::text,
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
        NULLIF(v_patch->>'r1_names', ''),
        NULLIF(v_patch->>'r2_names', ''),
        NULLIF(v_patch->>'r3_names', ''),
        NULLIF(v_patch->>'final_converted_numbers', ''),
        NULLIF(v_patch->>'final_converted_names', ''),
        NULLIF(v_patch->>'prep_doc_link', ''),
        NULLIF(v_patch->>'prep_poc', ''),
        NULLIF(v_patch->>'support_poc', ''),
        NULLIF(v_patch->>'outreach_poc', ''),
        NULLIF(v_patch->>'closing_date', ''),
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
        date = COALESCE(NULLIF(date, ''), v_date::text),
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
        r1_names = COALESCE(NULLIF(r1_names, ''), NULLIF(v_patch->>'r1_names', '')),
        r2_names = COALESCE(NULLIF(r2_names, ''), NULLIF(v_patch->>'r2_names', '')),
        r3_names = COALESCE(NULLIF(r3_names, ''), NULLIF(v_patch->>'r3_names', '')),
        final_converted_numbers = COALESCE(NULLIF(final_converted_numbers, ''), NULLIF(v_patch->>'final_converted_numbers', '')),
        final_converted_names = COALESCE(NULLIF(final_converted_names, ''), NULLIF(v_patch->>'final_converted_names', '')),
        prep_doc_link = COALESCE(NULLIF(prep_doc_link, ''), NULLIF(v_patch->>'prep_doc_link', '')),
        prep_poc = COALESCE(NULLIF(prep_poc, ''), NULLIF(v_patch->>'prep_poc', '')),
        support_poc = COALESCE(NULLIF(support_poc, ''), NULLIF(v_patch->>'support_poc', '')),
        outreach_poc = COALESCE(NULLIF(outreach_poc, ''), NULLIF(v_patch->>'outreach_poc', '')),
        closing_date = COALESCE(NULLIF(closing_date, ''), NULLIF(v_patch->>'closing_date', '')),
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

DO $$
DECLARE
  stale_count int;
BEGIN
  SELECT count(*)
  INTO stale_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'enqueue_lmp_sheet_mirror',
      'enqueue_lmp_sheet_mirror_from_candidate',
      'tg_lmp_processes_timeline',
      'recompute_lmp_convert',
      'enforce_poc_lmp_operational_fields',
      'import_historical_lmp_backfill'
    )
    AND p.prosrc ~ '(NEW|OLD)\.(r1_shortlisted|r2_shortlisted|r3_shortlisted|final_convert|convert_names)\M|[[:<:]](r1_shortlisted|r2_shortlisted|r3_shortlisted|final_convert|convert_names)[[:space:]]*=';

  IF stale_count > 0 THEN
    RAISE EXCEPTION 'STALE_LMP_RENAMED_COLUMN_REFERENCES_REMAIN: %', stale_count;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
