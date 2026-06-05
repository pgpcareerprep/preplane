
-- 1) copilot_threads / copilot_messages: remove user_id IS NULL branch
DROP POLICY IF EXISTS "Users manage own threads" ON public.copilot_threads;
CREATE POLICY "Users manage own threads"
  ON public.copilot_threads
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users manage own messages" ON public.copilot_messages;
CREATE POLICY "Users manage own messages"
  ON public.copilot_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.copilot_threads t
    WHERE t.id = copilot_messages.thread_id
      AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.copilot_threads t
    WHERE t.id = copilot_messages.thread_id
      AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- 2) sheet_sync_events: drop anon insert
DROP POLICY IF EXISTS "Anon can insert sync events" ON public.sheet_sync_events;

-- 3) mentors: restrict insert/update to admin/moderator
DROP POLICY IF EXISTS "Authenticated can insert mentors" ON public.mentors;
DROP POLICY IF EXISTS "Authenticated can update mentors" ON public.mentors;
CREATE POLICY "Admins/mods can insert mentors"
  ON public.mentors FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins/mods can update mentors"
  ON public.mentors FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- 4) sessions: restrict mutations to admin/moderator
DROP POLICY IF EXISTS "Authenticated can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can delete sessions" ON public.sessions;
CREATE POLICY "Admins/mods can insert sessions"
  ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins/mods can update sessions"
  ON public.sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins/mods can delete sessions"
  ON public.sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));

-- 5) lmp_candidates: restrict mutations to admin/moderator
DROP POLICY IF EXISTS "Authenticated can insert lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Authenticated can update lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Authenticated can delete lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Admins/mods can insert lmp_candidates"
  ON public.lmp_candidates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins/mods can update lmp_candidates"
  ON public.lmp_candidates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Admins/mods can delete lmp_candidates"
  ON public.lmp_candidates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role));
