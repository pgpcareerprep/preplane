-- =============================================================================
-- Fix POC regression caused by audit/security migrations (20260610160000+).
--
-- Problems fixed:
--   1. enforce_poc_lmp_operational_fields() fires POC_FIELD_NOT_EDITABLE even
--      when the payload includes unchanged protected fields (NULL vs "" or
--      NULL vs false false-positives from frontend coercion).
--   2. lmp_mentors: no INSERT/UPDATE/DELETE policies for assigned POCs —
--      breaks run-mentor, align-mentor flows.
--   3. lmp_candidates: no DELETE policy for assigned POCs —
--      breaks candidate removal.
-- =============================================================================

-- ── 1. Fix enforce_poc_lmp_operational_fields() ──────────────────────────────
--
-- Root cause: when the frontend sends a full object patch containing protected
-- fields at their current DB values (e.g. type="Full Time" when DB already has
-- "Full Time", or closing_date="" when DB has NULL), the old IS DISTINCT FROM
-- comparison fired because:
--   • NULL IS DISTINCT FROM ''   = TRUE
--   • NULL IS DISTINCT FROM false = TRUE (for boolean-like fields)
--
-- Fix: normalize the comparison using NULLIF(COALESCE(...)) so that NULL and
-- empty-string are treated as equivalent, preventing spurious trigger errors.

CREATE OR REPLACE FUNCTION public.enforce_poc_lmp_operational_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only gate POC-role updates. Admins and allocators pass through freely.
  IF NOT (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  -- Ownership check: the acting POC must be assigned to this LMP.
  IF public.current_poc_id() IS NULL
     OR (
       OLD.prep_poc_id     IS DISTINCT FROM public.current_poc_id()
       AND OLD.support_poc_id IS DISTINCT FROM public.current_poc_id()
       AND NOT (public.current_poc_id() = ANY(COALESCE(OLD.outreach_poc_ids, '{}'::uuid[])))
       AND NOT EXISTS (
         SELECT 1
         FROM public.lmp_poc_links link
         WHERE link.lmp_id = OLD.id
           AND link.poc_id = public.current_poc_id()
           AND link.is_active = true
       )
     ) THEN
    RAISE EXCEPTION 'POC_NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;

  -- Block ACTUAL changes to protected structural fields.
  -- NULL-tolerant comparisons prevent false positives when the payload sends
  -- an empty string or FALSE for a field that is already NULL in the DB.
  IF
    -- Hard identity — no coercion possible
    NEW.company       IS DISTINCT FROM OLD.company
    OR NEW.role       IS DISTINCT FROM OLD.role
    OR NEW.domain_id  IS DISTINCT FROM OLD.domain_id
    OR NEW.date       IS DISTINCT FROM OLD.date
    -- Date field: keep strict (NULL vs actual date must be caught)
    OR NEW.closing_date IS DISTINCT FROM OLD.closing_date
    -- Text fields: NULL and '' are equivalent (frontend may coerce either way)
    OR NULLIF(TRIM(COALESCE(NEW.domain_raw::text,  '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.domain_raw::text,  '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.type::text,        '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.type::text,        '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.admin_owner,       '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.admin_owner,       '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.allocator,         '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.allocator,         '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.prep_poc,          '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.prep_poc,          '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.support_poc,       '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.support_poc,       '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.outreach_poc,      '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.outreach_poc,      '')), '')
    -- UUID FK fields: strict comparison (no coercion)
    OR NEW.prep_poc_id      IS DISTINCT FROM OLD.prep_poc_id
    OR NEW.support_poc_id   IS DISTINCT FROM OLD.support_poc_id
    OR NEW.outreach_poc_ids IS DISTINCT FROM OLD.outreach_poc_ids
    -- final_convert stored as text ("2", NULL, ""); treat NULL and '' as equal
    OR NULLIF(TRIM(COALESCE(NEW.final_convert::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.final_convert::text, '')), '')
    -- created_by: immutable
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'POC_FIELD_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


-- ── 2. lmp_mentors: add assigned-POC INSERT / UPDATE / DELETE policies ────────
--
-- Root cause: prior migration only gave admins/allocators write access to
-- lmp_mentors. POCs could not insert/update/delete mentor rows → run-mentor
-- and align-mentor flows were completely broken.

DROP POLICY IF EXISTS "Assigned POCs can insert lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "Assigned POCs can insert lmp_mentors"
  ON public.lmp_mentors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND public.is_assigned_to_lmp(lmp_id)
  );

DROP POLICY IF EXISTS "Assigned POCs can update lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "Assigned POCs can update lmp_mentors"
  ON public.lmp_mentors
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND public.is_assigned_to_lmp(lmp_id)
  );

DROP POLICY IF EXISTS "Assigned POCs can delete lmp_mentors" ON public.lmp_mentors;
CREATE POLICY "Assigned POCs can delete lmp_mentors"
  ON public.lmp_mentors
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND public.is_assigned_to_lmp(lmp_id)
  );


-- ── 3. lmp_candidates: add assigned-POC DELETE policy ────────────────────────
--
-- Root cause: only admins/allocators could delete candidates. POCs need to
-- remove candidates from their own LMPs (e.g. remove a withdrawn student).

DROP POLICY IF EXISTS "Assigned POCs can delete lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Assigned POCs can delete lmp_candidates"
  ON public.lmp_candidates
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND public.is_assigned_to_lmp(lmp_id)
  );


-- ── 4. Notify PostgREST to reload schema ─────────────────────────────────────
NOTIFY pgrst, 'reload schema';
