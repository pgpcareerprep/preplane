-- Ensure candidate_ids column on sessions (already present per schema, but assert)
ALTER TABLE public.sessions
  ALTER COLUMN candidate_ids SET DEFAULT '{}'::uuid[];

UPDATE public.sessions SET candidate_ids = '{}'::uuid[] WHERE candidate_ids IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN candidate_ids SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_candidate_ids
  ON public.sessions USING GIN (candidate_ids);

-- Backfill: collapse legacy duplicate session rows that were created one-per-candidate
-- (same lmp_id + mentor_id + scheduled_at + session_type) into a single parent row
-- with candidate_ids populated from all participants.
WITH dup_groups AS (
  SELECT lmp_id, mentor_id, scheduled_at, session_type,
         array_agg(id ORDER BY created_at) AS ids,
         array_remove(array_agg(DISTINCT student_id), NULL) AS student_ids
    FROM public.sessions
   WHERE mentor_id IS NOT NULL
     AND scheduled_at IS NOT NULL
     AND lmp_id IS NOT NULL
   GROUP BY lmp_id, mentor_id, scheduled_at, session_type
  HAVING count(*) > 1
),
parent_update AS (
  UPDATE public.sessions s
     SET candidate_ids = (
       SELECT COALESCE(array_agg(DISTINCT x), '{}'::uuid[])
         FROM unnest(g.student_ids || s.candidate_ids) AS x
        WHERE x IS NOT NULL
     )
    FROM dup_groups g
   WHERE s.id = g.ids[1]
  RETURNING g.ids
),
to_delete AS (
  SELECT unnest(ids[2:array_length(ids,1)]) AS del_id
    FROM parent_update
)
DELETE FROM public.sessions WHERE id IN (SELECT del_id FROM to_delete);