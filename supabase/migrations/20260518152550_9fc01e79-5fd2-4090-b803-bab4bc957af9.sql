ALTER TABLE public.lmp_checklists
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS attachment_meta jsonb DEFAULT '[]'::jsonb;