-- Helper: resolve auth.uid() → poc_profiles.id via profiles.email
CREATE OR REPLACE FUNCTION public.current_poc_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
  FROM public.poc_profiles p
  JOIN public.profiles pr ON lower(pr.email) = lower(p.email)
  WHERE pr.user_id = auth.uid()
  LIMIT 1
$$;

-- BUG-P1: POC can update their own LMP processes
DROP POLICY IF EXISTS "POC can update own lmp_processes" ON public.lmp_processes;
CREATE POLICY "POC can update own lmp_processes"
ON public.lmp_processes FOR UPDATE TO authenticated
USING (
  public.current_poc_id() IS NOT NULL AND (
    prep_poc_id = public.current_poc_id()
    OR support_poc_id = public.current_poc_id()
    OR public.current_poc_id() = ANY(COALESCE(outreach_poc_ids, '{}'::uuid[]))
    OR EXISTS (
      SELECT 1 FROM public.lmp_poc_links k
      WHERE k.lmp_id = lmp_processes.id
        AND k.is_active = true
        AND k.poc_id = public.current_poc_id()
    )
  )
)
WITH CHECK (
  public.current_poc_id() IS NOT NULL AND (
    prep_poc_id = public.current_poc_id()
    OR support_poc_id = public.current_poc_id()
    OR public.current_poc_id() = ANY(COALESCE(outreach_poc_ids, '{}'::uuid[]))
    OR EXISTS (
      SELECT 1 FROM public.lmp_poc_links k
      WHERE k.lmp_id = lmp_processes.id
        AND k.is_active = true
        AND k.poc_id = public.current_poc_id()
    )
  )
);

-- BUG-P2: POC can manage checklists for their own LMPs
DROP POLICY IF EXISTS "POC can manage own lmp_checklists" ON public.lmp_checklists;
CREATE POLICY "POC can manage own lmp_checklists"
ON public.lmp_checklists FOR ALL TO authenticated
USING (
  public.current_poc_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lmp_processes lp
    WHERE lp.id = lmp_checklists.lmp_id
      AND (
        lp.prep_poc_id = public.current_poc_id()
        OR lp.support_poc_id = public.current_poc_id()
        OR public.current_poc_id() = ANY(COALESCE(lp.outreach_poc_ids, '{}'::uuid[]))
        OR EXISTS (
          SELECT 1 FROM public.lmp_poc_links k
          WHERE k.lmp_id = lp.id AND k.is_active = true AND k.poc_id = public.current_poc_id()
        )
      )
  )
)
WITH CHECK (
  public.current_poc_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lmp_processes lp
    WHERE lp.id = lmp_checklists.lmp_id
      AND (
        lp.prep_poc_id = public.current_poc_id()
        OR lp.support_poc_id = public.current_poc_id()
        OR public.current_poc_id() = ANY(COALESCE(lp.outreach_poc_ids, '{}'::uuid[]))
        OR EXISTS (
          SELECT 1 FROM public.lmp_poc_links k
          WHERE k.lmp_id = lp.id AND k.is_active = true AND k.poc_id = public.current_poc_id()
        )
      )
  )
);