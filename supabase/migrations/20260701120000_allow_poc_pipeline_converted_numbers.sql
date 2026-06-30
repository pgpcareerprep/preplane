-- Allow POCs to update final_converted_numbers when moving candidates through the pipeline.
-- recompute_lmp_convert() derives this field from lmp_candidates; blocking it caused
-- POC_FIELD_NOT_EDITABLE on every move to/from Converted.

CREATE OR REPLACE FUNCTION public.enforce_poc_lmp_operational_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  IF public.current_poc_id() IS NULL
     OR (
       OLD.prep_poc_id IS DISTINCT FROM public.current_poc_id()
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

  IF
    NEW.domain_id IS DISTINCT FROM OLD.domain_id
    OR NEW.date IS DISTINCT FROM OLD.date
    OR NEW.lmp_code IS DISTINCT FROM OLD.lmp_code
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NULLIF(TRIM(COALESCE(NEW.closing_date::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.closing_date::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.domain_raw::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.domain_raw::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.type::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.type::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.admin_owner, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.admin_owner, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.allocator, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.allocator, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.prep_poc, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.prep_poc, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.support_poc, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.support_poc, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.outreach_poc, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.outreach_poc, '')), '')
    OR NEW.prep_poc_id IS DISTINCT FROM OLD.prep_poc_id
    OR NEW.support_poc_id IS DISTINCT FROM OLD.support_poc_id
    OR NEW.outreach_poc_ids IS DISTINCT FROM OLD.outreach_poc_ids
  THEN
    RAISE EXCEPTION 'POC_FIELD_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
