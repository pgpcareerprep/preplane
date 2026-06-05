
-- Prevent duplicate session rows for the same (lmp, mentor, scheduled_at)
CREATE UNIQUE INDEX IF NOT EXISTS sessions_unique_lmp_mentor_time
  ON public.sessions (lmp_id, mentor_id, scheduled_at)
  WHERE lmp_id IS NOT NULL AND mentor_id IS NOT NULL AND scheduled_at IS NOT NULL;

-- POCs can read all sessions (read-only; existing write policies unchanged)
CREATE POLICY "POCs can view all sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role));
