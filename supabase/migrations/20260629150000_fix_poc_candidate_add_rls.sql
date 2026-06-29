-- Fix assigned POC candidate-add: robust current_poc_id() + assignment checks + data backfill.

-- ── 1. current_poc_id: profile_id, approved_user_id, then email fallback ─────
CREATE OR REPLACE FUNCTION public.current_poc_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.id
  FROM public.poc_profiles pp
  JOIN public.profiles pr ON pr.user_id = auth.uid()
  WHERE COALESCE(pp.status, 'active') = 'active'
    AND (
      pp.profile_id = pr.id
      OR pp.approved_user_id = pr.id
      OR (
        pp.email IS NOT NULL
        AND pr.email IS NOT NULL
        AND lower(trim(pp.email)) = lower(trim(pr.email))
      )
    )
  ORDER BY
    CASE
      WHEN pp.profile_id = pr.id THEN 0
      WHEN pp.approved_user_id = pr.id THEN 1
      ELSE 2
    END
  LIMIT 1;
$$;

-- ── 2. is_assigned_to_lmp: prep/support columns + active lmp_poc_links only ──
CREATE OR REPLACE FUNCTION public.is_assigned_to_lmp(p_lmp_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_poc_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.lmp_processes lp
      WHERE lp.id = p_lmp_id
        AND (
          lp.prep_poc_id = public.current_poc_id()
          OR lp.support_poc_id = public.current_poc_id()
          OR EXISTS (
            SELECT 1
            FROM public.lmp_poc_links link
            WHERE link.lmp_id = lp.id
              AND link.poc_id = public.current_poc_id()
              AND COALESCE(link.is_active, true) = true
              AND COALESCE(link.role, '') IN ('prep', 'support')
          )
        )
    );
$$;

-- ── 3. lmp_candidates INSERT: admin/allocator OR assigned operational POC ───
DROP POLICY IF EXISTS "Assigned POCs can insert lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Admins/allocators can insert lmp_candidates" ON public.lmp_candidates;

CREATE POLICY "Operational roles can insert lmp_candidates"
  ON public.lmp_candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'allocator'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'poc'::public.app_role)
      AND public.is_assigned_to_lmp(lmp_id)
    )
  );

-- ── 4. Data hygiene: link profile_id ↔ approved_user_id ─────────────────────
UPDATE public.poc_profiles
SET profile_id = approved_user_id
WHERE profile_id IS NULL
  AND approved_user_id IS NOT NULL;

UPDATE public.poc_profiles
SET approved_user_id = profile_id
WHERE approved_user_id IS NULL
  AND profile_id IS NOT NULL;

-- ── 5. Backfill canonical prep/support POC ids on LMP rows (name → uuid) ─────
UPDATE public.lmp_processes lp
SET prep_poc_id = pp.id
FROM public.poc_profiles pp
WHERE lp.prep_poc_id IS NULL
  AND lp.prep_poc IS NOT NULL
  AND trim(lp.prep_poc) <> ''
  AND lower(trim(pp.name)) = lower(trim(lp.prep_poc))
  AND COALESCE(pp.status, 'active') = 'active'
  AND COALESCE(pp.role_type, 'prep_poc') NOT IN ('outreach_poc', 'outreach');

UPDATE public.lmp_processes lp
SET support_poc_id = pp.id
FROM public.poc_profiles pp
WHERE lp.support_poc_id IS NULL
  AND lp.support_poc IS NOT NULL
  AND trim(lp.support_poc) <> ''
  AND lower(trim(pp.name)) = lower(trim(lp.support_poc))
  AND COALESCE(pp.status, 'active') = 'active'
  AND COALESCE(pp.role_type, 'prep_poc') NOT IN ('outreach_poc', 'outreach');

-- ── 6. Ensure active prep/support links exist when *_poc_id is set ───────────
INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active)
SELECT lp.id, lp.prep_poc_id, 'prep', true
FROM public.lmp_processes lp
WHERE lp.prep_poc_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lmp_poc_links k
    WHERE k.lmp_id = lp.id
      AND k.poc_id = lp.prep_poc_id
      AND k.role = 'prep'
      AND COALESCE(k.is_active, true) = true
  );

INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active)
SELECT lp.id, lp.support_poc_id, 'support', true
FROM public.lmp_processes lp
WHERE lp.support_poc_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lmp_poc_links k
    WHERE k.lmp_id = lp.id
      AND k.poc_id = lp.support_poc_id
      AND k.role = 'support'
      AND COALESCE(k.is_active, true) = true
  );

NOTIFY pgrst, 'reload schema';
