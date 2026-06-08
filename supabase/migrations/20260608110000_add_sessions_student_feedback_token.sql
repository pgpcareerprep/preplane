-- sessions.student_feedback_token was declared in the CREATE TABLE IF NOT EXISTS
-- in migration 20260515223202, but since the sessions table already existed at
-- that time, the CREATE TABLE was a no-op and the column was never created.
-- This caused every SELECT that included student_feedback_token to return
-- PostgreSQL error 42703 ("column does not exist"), breaking SessionsLiveTab
-- and FeedbackTab queries entirely.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS student_feedback_token text;

-- Re-create the UNIQUE constraint only if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_student_feedback_token_key'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_student_feedback_token_key UNIQUE (student_feedback_token);
  END IF;
END $$;
