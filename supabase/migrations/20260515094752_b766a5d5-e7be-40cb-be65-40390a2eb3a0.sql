CREATE POLICY "Authenticated can insert sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update sessions" ON public.sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete sessions" ON public.sessions FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can insert lmp_mentors" ON public.lmp_mentors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update lmp_mentors" ON public.lmp_mentors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);