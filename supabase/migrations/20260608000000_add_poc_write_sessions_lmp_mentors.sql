-- Allow POC users to schedule sessions, manage mentor assignments, and update candidates.
-- Previously these tables only allowed admin/allocator writes, so POCs assigned to an LMP
-- could read data but never create sessions or record mentor assignments.

-- sessions: POCs need INSERT (schedule), UPDATE (mark complete/cancel), DELETE (remove their own)
DROP POLICY IF EXISTS "POCs can insert sessions" ON public.sessions;
CREATE POLICY "POCs can insert sessions"
  ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'poc'::app_role));

DROP POLICY IF EXISTS "POCs can update sessions" ON public.sessions;
CREATE POLICY "POCs can update sessions"
  ON public.sessions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role))
  WITH CHECK (has_role(auth.uid(), 'poc'::app_role));

DROP POLICY IF EXISTS "POCs can delete sessions" ON public.sessions;
CREATE POLICY "POCs can delete sessions"
  ON public.sessions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role));

-- lmp_mentors: POCs need INSERT/UPDATE to record and update mentor assignments
DROP POLICY IF EXISTS "POCs can insert lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "POCs can insert lmp_mentors"
  ON public.lmp_mentors FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'poc'::app_role));

DROP POLICY IF EXISTS "POCs can update lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "POCs can update lmp_mentors"
  ON public.lmp_mentors FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role))
  WITH CHECK (has_role(auth.uid(), 'poc'::app_role));

DROP POLICY IF EXISTS "POCs can delete lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "POCs can delete lmp_mentors"
  ON public.lmp_mentors FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role));

-- lmp_candidates: POCs need UPDATE to stamp mentor_id on candidate rows
DROP POLICY IF EXISTS "POCs can update lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "POCs can update lmp_candidates"
  ON public.lmp_candidates FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role))
  WITH CHECK (has_role(auth.uid(), 'poc'::app_role));

-- mentors: POCs need INSERT for fallback mentor registration when assigning external/ALU mentors
DROP POLICY IF EXISTS "POCs can insert mentors" ON public.mentors;
CREATE POLICY "POCs can insert mentors"
  ON public.mentors FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'poc'::app_role));

-- lmp_processes: "POC can update own lmp_processes" already exists (prep_poc_id / support_poc_id check).
-- No additional policy needed here.
