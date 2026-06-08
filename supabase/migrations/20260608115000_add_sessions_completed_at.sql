-- sessions.completed_at was declared in the CREATE TABLE IF NOT EXISTS in migration
-- 20260515223202, but since the sessions table already existed at that time the
-- column was never created. This caused every UPDATE that included completed_at
-- (e.g. Mark Complete) to fail with "column does not exist" in the schema cache.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Index so queries ordered/filtered by completed_at stay fast.
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at
  ON public.sessions (completed_at DESC NULLS LAST);
