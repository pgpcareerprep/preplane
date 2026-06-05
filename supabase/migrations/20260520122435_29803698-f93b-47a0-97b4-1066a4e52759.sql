
-- Convert moderator users to allocator
UPDATE public.profiles SET role = 'allocator', updated_at = now() WHERE role = 'moderator';

-- Replace moderator policies with allocator equivalents
DROP POLICY IF EXISTS "Admins and moderators can manage lmp_processes" ON public.lmp_processes;
CREATE POLICY "Admins and allocators can manage lmp_processes"
  ON public.lmp_processes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods manage lmp_poc_links" ON public.lmp_poc_links;
CREATE POLICY "Admins/allocators manage lmp_poc_links"
  ON public.lmp_poc_links FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods manage lmp_checklists" ON public.lmp_checklists;
CREATE POLICY "Admins/allocators manage lmp_checklists"
  ON public.lmp_checklists FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can insert lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Admins/allocators can insert lmp_candidates"
  ON public.lmp_candidates FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can update lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Admins/allocators can update lmp_candidates"
  ON public.lmp_candidates FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can delete lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Admins/allocators can delete lmp_candidates"
  ON public.lmp_candidates FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can insert mentors" ON public.mentors;
CREATE POLICY "Admins/allocators can insert mentors"
  ON public.mentors FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can update mentors" ON public.mentors;
CREATE POLICY "Admins/allocators can update mentors"
  ON public.mentors FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can insert sessions" ON public.sessions;
CREATE POLICY "Admins/allocators can insert sessions"
  ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can update sessions" ON public.sessions;
CREATE POLICY "Admins/allocators can update sessions"
  ON public.sessions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can delete sessions" ON public.sessions;
CREATE POLICY "Admins/allocators can delete sessions"
  ON public.sessions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));
