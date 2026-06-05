
-- Per-candidate student feedback for group sessions
CREATE TABLE public.session_student_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  feedback jsonb NOT NULL,
  student_rating numeric,
  mentor_rating numeric,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_ssf_session ON public.session_student_feedbacks(session_id);

GRANT SELECT ON public.session_student_feedbacks TO authenticated;
GRANT ALL ON public.session_student_feedbacks TO service_role;

ALTER TABLE public.session_student_feedbacks ENABLE ROW LEVEL SECURITY;

-- Admins/allocators read all
CREATE POLICY "Admins/allocators view session_student_feedbacks"
ON public.session_student_feedbacks
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

-- POCs scoped via the session's lmp
CREATE POLICY "POC scoped view session_student_feedbacks"
ON public.session_student_feedbacks
FOR SELECT TO authenticated
USING (
  (current_poc_id() IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.lmp_processes lp ON lp.id = s.lmp_id
    WHERE s.id = session_student_feedbacks.session_id
      AND (
        lp.prep_poc_id = current_poc_id()
        OR lp.support_poc_id = current_poc_id()
        OR current_poc_id() = ANY (COALESCE(lp.outreach_poc_ids, '{}'::uuid[]))
        OR EXISTS (SELECT 1 FROM public.lmp_poc_links k WHERE k.lmp_id = lp.id AND k.is_active = true AND k.poc_id = current_poc_id())
      )
  )
);

-- Admins manage all (insert/update/delete)
CREATE POLICY "Admins manage session_student_feedbacks"
ON public.session_student_feedbacks
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
