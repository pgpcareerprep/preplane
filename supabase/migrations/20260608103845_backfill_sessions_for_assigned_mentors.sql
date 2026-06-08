-- Backfill sessions for lmp_mentors rows where the session was never created.
-- Root cause: upsert ON CONFLICT against a partial unique index was throwing
-- "There is no unique or exclusion constraint matching the ON CONFLICT specification",
-- leaving lmp_mentors.status = 'assigned' but no corresponding sessions row.
--
-- Strategy: for each (lmp_id, mentor_id) pair in lmp_mentors with status='assigned'
-- that has no sessions row, insert one session using lmp_candidates.mentor_id to
-- reconstruct candidate_ids. scheduled_at is left NULL (shows as "Unscheduled").

INSERT INTO public.sessions (
  lmp_id,
  mentor_id,
  candidate_ids,
  student_id,
  session_type,
  status,
  sync_source,
  notes
)
SELECT
  lm.lmp_id,
  lm.mentor_id,
  COALESCE(
    ARRAY_AGG(lc.id ORDER BY lc.created_at) FILTER (WHERE lc.id IS NOT NULL),
    '{}'::uuid[]
  ) AS candidate_ids,
  -- Use first valid student_id from assigned candidates (FK-safe since lmp_candidates.student_id references students).
  (ARRAY_AGG(lc.student_id ORDER BY lc.created_at) FILTER (WHERE lc.student_id IS NOT NULL))[1] AS student_id,
  'mock'     AS session_type,
  'scheduled' AS status,
  'backfill'  AS sync_source,
  COALESCE(lm.mentor_name, 'Mentor') || ' — backfilled (no scheduled time set)' AS notes
FROM public.lmp_mentors lm
LEFT JOIN public.lmp_candidates lc
  ON lc.lmp_id   = lm.lmp_id
 AND lc.mentor_id = lm.mentor_id
WHERE lm.status = 'assigned'
  AND lm.lmp_id IS NOT NULL
  AND lm.mentor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.lmp_id    = lm.lmp_id
      AND s.mentor_id = lm.mentor_id
  )
GROUP BY lm.lmp_id, lm.mentor_id, lm.mentor_name;
