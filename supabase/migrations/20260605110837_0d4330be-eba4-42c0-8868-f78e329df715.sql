ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS enrichment jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_updated_at timestamptz;