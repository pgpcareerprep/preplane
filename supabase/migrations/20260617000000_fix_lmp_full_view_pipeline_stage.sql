-- Rewrite lmp_full_view so pipeline_stage is the canonical source for all
-- candidate counts and names in the "All LMP Processes" modal.
--
-- Adds:   pool_count, pool_names, converted_count, converted_names
-- Fixes:  r1_names, r2_names, r3_names — now live from pipeline_stage
--         (previously they were stored strings from lmp_processes columns)
-- Keeps:  offer_count (same value as converted_count, for backward compat)
--         final_converted_names (stored string, still used by sheet sync trigger)
--
-- Also adds pool_names column to lmp_processes so the sheet sync trigger can
-- write it to Col O, and updates enqueue_lmp_sheet_mirror_from_candidate to
-- compute + persist pool_names with the LMP UUID in any RAISE WARNING.

-- ── Stage value arrays (shared logic, expressed inline for portability) ──────
-- pool  : NOT in r1 | r2 | r3 | converted
-- r1    : r1, r1_shortlisted, shortlisted, round1, round_1
-- r2    : r2, r2_shortlisted, round2, round_2
-- r3    : r3, r3_shortlisted, round3, round_3
-- conv  : offer, converted, final, accepted

-- ── 1. Add pool_names column to lmp_processes (for sheet sync) ───────────────
ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS pool_names text;

-- ── 2. Recreate lmp_full_view ─────────────────────────────────────────────────
DROP VIEW IF EXISTS public.lmp_full_view;

CREATE VIEW public.lmp_full_view
WITH (security_invoker = true)
AS
SELECT
  l.id,
  l.company,
  l.role,
  l.domain_raw,
  l.domain_id,
  l.status,
  l.type,
  l.date            AS created_date,
  l.closing_date,
  l.jd_url,
  l.jd_label,
  l.lmp_code,
  l.mentor_selected,
  (SELECT dl.text
   FROM   lmp_daily_logs dl
   WHERE  dl.lmp_id = l.id
   ORDER  BY dl.created_at DESC LIMIT 1)           AS latest_daily_progress,
  (SELECT count(*)
   FROM   lmp_daily_logs dl
   WHERE  dl.lmp_id = l.id)                        AS daily_log_count,
  l.next_progress_date,
  l.next_progress_type,
  COALESCE(l.prep_doc_shared,
    (SELECT ch.completed FROM lmp_checklists ch
     WHERE  ch.lmp_id = l.id AND ch.item_key = 'prep_doc_shared' LIMIT 1),
    false)                                          AS checklist_prep_doc_shared,
  COALESCE(l.mentor_aligned,
    (SELECT ch.completed FROM lmp_checklists ch
     WHERE  ch.lmp_id = l.id AND ch.item_key = 'mentor_aligned' LIMIT 1),
    false)                                          AS checklist_mentor_aligned,
  COALESCE(l.assignment_review,
    (SELECT ch.completed FROM lmp_checklists ch
     WHERE  ch.lmp_id = l.id AND ch.item_key = 'assignment_review' LIMIT 1),
    false)                                          AS checklist_assignment_review,
  COALESCE(l.one_to_one_mock,
    (SELECT ch.completed FROM lmp_checklists ch
     WHERE  ch.lmp_id = l.id AND ch.item_key = 'one_to_one_mock' LIMIT 1),
    false)                                          AS checklist_one_to_one_mock,

  -- ── Pool: candidates not yet in any named interview round ────────────────
  (SELECT count(*)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  NOT (lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY[
            'r1','r1_shortlisted','shortlisted','round1','round_1',
            'r2','r2_shortlisted','round2','round_2',
            'r3','r3_shortlisted','round3','round_3',
            'offer','converted','final','accepted'
          ])))                                      AS pool_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  NOT (lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY[
            'r1','r1_shortlisted','shortlisted','round1','round_1',
            'r2','r2_shortlisted','round2','round_2',
            'r3','r3_shortlisted','round3','round_3',
            'offer','converted','final','accepted'
          ])))                                      AS pool_names,

  -- ── R1 ───────────────────────────────────────────────────────────────────
  (SELECT count(*)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['r1','r1_shortlisted','shortlisted','round1','round_1']))
                                                    AS r1_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['r1','r1_shortlisted','shortlisted','round1','round_1']))
                                                    AS r1_names,

  -- ── R2 ───────────────────────────────────────────────────────────────────
  (SELECT count(*)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['r2','r2_shortlisted','round2','round_2']))
                                                    AS r2_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['r2','r2_shortlisted','round2','round_2']))
                                                    AS r2_names,

  -- ── R3 ───────────────────────────────────────────────────────────────────
  (SELECT count(*)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['r3','r3_shortlisted','round3','round_3']))
                                                    AS r3_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['r3','r3_shortlisted','round3','round_3']))
                                                    AS r3_names,

  -- ── Converted ────────────────────────────────────────────────────────────
  (SELECT count(*)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['offer','converted','final','accepted']))
                                                    AS offer_count,
  (SELECT count(*)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['offer','converted','final','accepted']))
                                                    AS converted_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
   FROM   lmp_candidates c
   WHERE  c.lmp_id = l.id
     AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
            ARRAY['offer','converted','final','accepted']))
                                                    AS converted_names,

  -- ── Legacy stored columns (kept for sheet-sync trigger compat) ───────────
  l.final_converted_numbers,
  l.final_converted_names,

  -- ── POC names (joined from lmp_poc_links, falling back to stored text) ───
  COALESCE(
    (SELECT string_agg(p.name, ', ')
     FROM   lmp_poc_links k
     JOIN   poc_profiles  p ON p.id = k.poc_id
     WHERE  k.lmp_id = l.id AND k.role = 'prep' AND k.is_active),
    NULLIF(l.prep_poc, ''))                         AS prep_poc_names,
  COALESCE(
    (SELECT string_agg(p.name, ', ')
     FROM   lmp_poc_links k
     JOIN   poc_profiles  p ON p.id = k.poc_id
     WHERE  k.lmp_id = l.id AND k.role = 'support' AND k.is_active),
    NULLIF(l.support_poc, ''))                      AS support_poc_names,
  COALESCE(
    (SELECT string_agg(p.name, ', ')
     FROM   lmp_poc_links k
     JOIN   poc_profiles  p ON p.id = k.poc_id
     WHERE  k.lmp_id = l.id AND k.role = 'outreach' AND k.is_active),
    NULLIF(l.outreach_poc, ''))                     AS outreach_poc_names,

  l.prep_doc,
  l.prep_doc_link,

  -- ── Mentor (preferred: lmp_mentors relation; fallback: stored text) ──────
  COALESCE(
    (SELECT m.name
     FROM   lmp_mentors lm
     JOIN   mentors     m  ON m.id = lm.mentor_id
     WHERE  lm.lmp_id = l.id AND lm.status = 'assigned'
     ORDER  BY lm.assigned_at DESC LIMIT 1),
    NULLIF(l.mentor_selected, ''))                  AS mentor_name,
  COALESCE(
    (SELECT lm.feedback_avg
     FROM   lmp_mentors lm
     WHERE  lm.lmp_id = l.id AND lm.status = 'assigned'
     ORDER  BY lm.assigned_at DESC LIMIT 1),
    (SELECT avg(s.mentor_rating)
     FROM   sessions s
     WHERE  s.lmp_id = l.id AND s.mentor_rating IS NOT NULL))
                                                    AS mentor_feedback_avg,
  l.created_at,
  l.updated_at,
  l.sync_source,
  l.comments,
  l.feedback_by_outreach
FROM lmp_processes l;

GRANT SELECT ON public.lmp_full_view TO authenticated;
GRANT SELECT ON public.lmp_full_view TO anon;

-- ── 3. Backfill function: recompute stored name columns from pipeline_stage ──
-- Idempotent — safe to call multiple times, or once per LMP via p_lmp_id.
CREATE OR REPLACE FUNCTION public.recompute_lmp_candidate_stages(p_lmp_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lmp_processes l
  SET
    pool_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM   lmp_candidates c
      WHERE  c.lmp_id = l.id
        AND  NOT (lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY[
               'r1','r1_shortlisted','shortlisted','round1','round_1',
               'r2','r2_shortlisted','round2','round_2',
               'r3','r3_shortlisted','round3','round_3',
               'offer','converted','final','accepted'
             ]))
    ),
    r1_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM   lmp_candidates c
      WHERE  c.lmp_id = l.id
        AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
               ARRAY['r1','r1_shortlisted','shortlisted','round1','round_1'])
    ),
    r2_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM   lmp_candidates c
      WHERE  c.lmp_id = l.id
        AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
               ARRAY['r2','r2_shortlisted','round2','round_2'])
    ),
    r3_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM   lmp_candidates c
      WHERE  c.lmp_id = l.id
        AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
               ARRAY['r3','r3_shortlisted','round3','round_3'])
    ),
    final_converted_names = (
      SELECT COALESCE(string_agg(NULLIF(trim(c.student_name), ''), ', ' ORDER BY c.student_name), NULL)
      FROM   lmp_candidates c
      WHERE  c.lmp_id = l.id
        AND  lower(COALESCE(c.pipeline_stage, '')) = ANY (
               ARRAY['offer','converted','final','accepted'])
    ),
    updated_at = now()
  WHERE (p_lmp_id IS NULL OR l.id = p_lmp_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_lmp_candidate_stages(uuid) TO authenticated, service_role;

-- Run immediately to backfill existing records
SELECT public.recompute_lmp_candidate_stages();

-- ── 4. Update enqueue_lmp_sheet_mirror_from_candidate ────────────────────────
-- Adds pool_names sync + LMP UUID in RAISE WARNING for diagnostics.
CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id    uuid;
  v_pool_names text;
  v_r1_names  text;
  v_r2_names  text;
  v_r3_names  text;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE NOT (lower(COALESCE(pipeline_stage, '')) = ANY (ARRAY[
        'r1','r1_shortlisted','shortlisted','round_1','round1',
        'r2','r2_shortlisted','round_2','round2',
        'r3','r3_shortlisted','round_3','round3',
        'offer','converted','final','accepted'
      ]))
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage, '')) = ANY (
        ARRAY['r1','r1_shortlisted','shortlisted','round_1','round1'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage, '')) = ANY (
        ARRAY['r2','r2_shortlisted','round_2','round2'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage, '')) = ANY (
        ARRAY['r3','r3_shortlisted','round_3','round3'])
    )
  INTO v_pool_names, v_r1_names, v_r2_names, v_r3_names
  FROM public.lmp_candidates
  WHERE lmp_id = v_lmp_id;

  UPDATE public.lmp_processes
     SET pool_names  = v_pool_names,
         r1_names    = v_r1_names,
         r2_names    = v_r2_names,
         r3_names    = v_r3_names,
         sync_source = NULL,
         updated_at  = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed for lmp_id=%: %',
    v_lmp_id, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

NOTIFY pgrst, 'reload schema';
