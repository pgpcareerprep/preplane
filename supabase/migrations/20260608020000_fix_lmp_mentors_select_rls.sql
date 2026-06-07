-- lmp_mentors is missing a SELECT policy.
-- Postgres upsert (INSERT ... ON CONFLICT DO UPDATE) requires SELECT access to
-- detect conflicting rows; without it, the upsert fails with an RLS error even
-- when the user has a valid INSERT policy.
--
-- All authenticated users need to READ lmp_mentors to:
--  1. Perform upsert conflict detection (ON CONFLICT clause)
--  2. Load mentor assignment counts in MentorsTab / DataSources page

DROP POLICY IF EXISTS "Authenticated can view lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "Authenticated can view lmp_mentors"
  ON public.lmp_mentors FOR SELECT TO authenticated
  USING (true);
