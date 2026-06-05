-- Null out orphan student_id references before adding the FK
UPDATE public.sessions s
SET student_id = NULL
WHERE student_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.students st WHERE st.id = s.student_id);

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.students(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_student_id
  ON public.sessions(student_id);