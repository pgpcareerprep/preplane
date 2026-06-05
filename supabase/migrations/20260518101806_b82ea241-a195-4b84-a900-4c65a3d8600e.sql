ALTER TABLE public.lmp_candidates DROP CONSTRAINT IF EXISTS uq_lmp_candidates_lmp_student;
DROP INDEX IF EXISTS public.idx_lmp_candidates_unique;