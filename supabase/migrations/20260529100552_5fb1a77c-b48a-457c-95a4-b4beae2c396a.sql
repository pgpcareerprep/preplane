ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS mentor_suggestions jsonb,
  ADD COLUMN IF NOT EXISTS mentor_suggestions_at timestamptz,
  ADD COLUMN IF NOT EXISTS mentor_suggestions_context jsonb;