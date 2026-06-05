ALTER TABLE public.lmp_candidates ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'app';
ALTER TABLE public.lmp_mentors ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'app';
ALTER TABLE public.lmp_checklists ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'app';