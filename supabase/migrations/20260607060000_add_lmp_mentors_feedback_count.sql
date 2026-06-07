-- lmp_mentors.feedback_count column was never created despite being referenced in
-- recompute_mentor_feedback() and queried by useLmpMentorsLive.
-- This caused: (1) DELETE lmp_processes to fail via cascade→sessions trigger,
-- (2) useLmpMentorsLive to throw on SELECT, breaking the Mentors tab view.
ALTER TABLE public.lmp_mentors
  ADD COLUMN IF NOT EXISTS feedback_count int NOT NULL DEFAULT 0;

-- Backfill from existing sessions data.
UPDATE public.lmp_mentors lm
SET feedback_count = COALESCE((
  SELECT COUNT(*)::int
  FROM public.sessions s
  WHERE s.mentor_id = lm.mentor_id
    AND s.lmp_id    = lm.lmp_id
    AND (s.student_feedback IS NOT NULL OR s.student_rating IS NOT NULL)
), 0);
