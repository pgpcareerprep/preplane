ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS prep_doc_shared text DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_progress_date text DEFAULT '';