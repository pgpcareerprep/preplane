-- Enforce view-as read-only at the database mutation boundary and expose one
-- admin-only manual DB-to-Sheet queue operation.

CREATE OR REPLACE FUNCTION public.request_is_view_as_read_only()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (NULLIF(current_setting('request.headers', true), '')::jsonb
      ->> 'x-preplane-view-as-read-only') = 'true',
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.reject_view_as_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'admin'::public.app_role)
     AND public.request_is_view_as_read_only() THEN
    RAISE EXCEPTION 'VIEW_AS_READ_ONLY' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'lmp_processes', 'lmp_candidates', 'sessions', 'lmp_mentors', 'mentors',
    'lmp_comments', 'lmp_checklists', 'lmp_progress_history', 'lmp_daily_logs',
    'profiles', 'poc_profiles', 'domains', 'system_settings',
    'feedback_form_templates', 'lmp_guide_manual', 'lmp_guide_nodes',
    'sync_conflicts', 'sheet_write_queue'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_reject_view_as_mutation ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER trg_reject_view_as_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_view_as_mutation()',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.enqueue_all_lmp_sheet_mirrors()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF public.request_is_view_as_read_only() THEN
    RAISE EXCEPTION 'VIEW_AS_READ_ONLY' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by,
     idempotency_key, entity_id, attempt_count)
  SELECT
    'LMP Tracker',
    'sync-db-to-sheet',
    jsonb_build_object(
      'op', 'sync-db-to-sheet',
      'tab', 'LMP Tracker',
      'headerRow', 15,
      'company', lp.company,
      'role', lp.role,
      'lmp_code', lp.lmp_code,
      'dbPatch', to_jsonb(lp)
    ),
    'pending',
    now(),
    'admin_manual_resync',
    'lmp:' || lp.id::text || ':sync',
    lp.id,
    0
  FROM public.lmp_processes lp
  WHERE COALESCE(lp.company, '') <> '' AND COALESCE(lp.role, '') <> ''
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET
    payload = EXCLUDED.payload,
    next_retry_at = now(),
    last_error = NULL,
    updated_at = now();

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$;

REVOKE ALL ON FUNCTION public.request_is_view_as_read_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_is_view_as_read_only() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_all_lmp_sheet_mirrors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_all_lmp_sheet_mirrors() TO authenticated, service_role;
