
-- P3.1: persist Mentor Selected from sheet column V
ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS mentor_selected text;

-- P3.4: support 1:many session (one mentor, multiple candidates)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS candidate_ids uuid[] NOT NULL DEFAULT '{}';

-- P5.1: rating from any source (POC mentor_rating, student_rating, or student_feedback.rating)
CREATE OR REPLACE FUNCTION public.recompute_mentor_feedback(_mentor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_avg numeric;
  v_count int;
BEGIN
  IF _mentor_id IS NULL THEN RETURN; END IF;

  SELECT
    AVG(COALESCE(
      mentor_rating,
      student_rating,
      NULLIF((student_feedback->>'rating')::numeric, 0)
    )),
    COUNT(*) FILTER (
      WHERE mentor_rating IS NOT NULL
         OR student_rating IS NOT NULL
         OR student_feedback IS NOT NULL
    )
  INTO v_avg, v_count
  FROM public.sessions
  WHERE mentor_id = _mentor_id
    AND (
      mentor_rating IS NOT NULL
      OR student_rating IS NOT NULL
      OR student_feedback IS NOT NULL
    );

  UPDATE public.mentors
     SET rating = COALESCE(round(v_avg, 2), 0),
         reviews = COALESCE(v_count, 0),
         updated_at = now()
   WHERE id = _mentor_id;

  UPDATE public.lmp_mentors lm
     SET feedback_avg = COALESCE(round((
            SELECT AVG(COALESCE(
              s.mentor_rating,
              s.student_rating,
              NULLIF((s.student_feedback->>'rating')::numeric, 0)
            ))
            FROM public.sessions s
            WHERE s.mentor_id = lm.mentor_id AND s.lmp_id = lm.lmp_id
              AND (
                s.mentor_rating IS NOT NULL
                OR s.student_rating IS NOT NULL
                OR s.student_feedback IS NOT NULL
              )
         ), 2), 0),
         feedback_count = COALESCE((
            SELECT COUNT(*) FROM public.sessions s
            WHERE s.mentor_id = lm.mentor_id AND s.lmp_id = lm.lmp_id
              AND (
                s.mentor_rating IS NOT NULL
                OR s.student_rating IS NOT NULL
                OR s.student_feedback IS NOT NULL
              )
         ), 0),
         updated_at = now()
   WHERE lm.mentor_id = _mentor_id;
END $function$;
