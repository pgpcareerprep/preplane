
CREATE OR REPLACE FUNCTION public.recompute_mentor_feedback(_mentor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_avg numeric;
  v_count int;
BEGIN
  IF _mentor_id IS NULL THEN RETURN; END IF;

  SELECT
    AVG(COALESCE(student_rating, NULLIF((student_feedback->>'rating')::numeric, 0))),
    COUNT(*) FILTER (WHERE student_feedback IS NOT NULL OR student_rating IS NOT NULL)
  INTO v_avg, v_count
  FROM public.sessions
  WHERE mentor_id = _mentor_id
    AND (student_feedback IS NOT NULL OR student_rating IS NOT NULL);

  UPDATE public.mentors
     SET rating = COALESCE(round(v_avg, 2), 0),
         reviews = COALESCE(v_count, 0),
         updated_at = now()
   WHERE id = _mentor_id;

  UPDATE public.lmp_mentors lm
     SET feedback_avg = COALESCE(round((
            SELECT AVG(COALESCE(s.student_rating, NULLIF((s.student_feedback->>'rating')::numeric, 0)))
            FROM public.sessions s
            WHERE s.mentor_id = lm.mentor_id AND s.lmp_id = lm.lmp_id
              AND (s.student_feedback IS NOT NULL OR s.student_rating IS NOT NULL)
         ), 2), 0),
         feedback_count = COALESCE((
            SELECT COUNT(*) FROM public.sessions s
            WHERE s.mentor_id = lm.mentor_id AND s.lmp_id = lm.lmp_id
              AND (s.student_feedback IS NOT NULL OR s.student_rating IS NOT NULL)
         ), 0),
         updated_at = now()
   WHERE lm.mentor_id = _mentor_id;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sessions_feedback_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_mentor_feedback(OLD.mentor_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_mentor_feedback(NEW.mentor_id);
    IF TG_OP = 'UPDATE' AND NEW.mentor_id IS DISTINCT FROM OLD.mentor_id THEN
      PERFORM public.recompute_mentor_feedback(OLD.mentor_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS sessions_feedback_sync ON public.sessions;
CREATE TRIGGER sessions_feedback_sync
AFTER INSERT OR UPDATE OF student_feedback, student_rating, mentor_id, poc_feedback
   OR DELETE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_feedback_sync();

-- Backfill
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.mentors LOOP
    PERFORM public.recompute_mentor_feedback(r.id);
  END LOOP;
END $$;
