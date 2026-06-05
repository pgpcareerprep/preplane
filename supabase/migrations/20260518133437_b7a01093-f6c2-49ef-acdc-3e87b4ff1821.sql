CREATE INDEX IF NOT EXISTS idx_lmp_candidates_lmp_id ON public.lmp_candidates(lmp_id);
CREATE INDEX IF NOT EXISTS idx_lmp_candidates_lmp_id_stage ON public.lmp_candidates(lmp_id, pipeline_stage);