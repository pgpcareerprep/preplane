ALTER TABLE public.lmp_candidates
  ADD COLUMN IF NOT EXISTS mentor_id uuid REFERENCES public.mentors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lmp_candidates_mentor_id_idx
  ON public.lmp_candidates(mentor_id) WHERE mentor_id IS NOT NULL;