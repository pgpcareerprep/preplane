ALTER TABLE public.lmp_candidates
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS added_by text,
  ADD COLUMN IF NOT EXISTS session_status text;

CREATE INDEX IF NOT EXISTS lmp_candidates_email_idx ON public.lmp_candidates (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS lmp_candidates_status_idx ON public.lmp_candidates (status);