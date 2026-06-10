-- Assignment-scoped POC writes and one authoritative DB-to-Sheet outbox.

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
          OR public.current_poc_id() = ANY(COALESCE(lp.outreach_poc_ids, '{}'::uuid[]))
          OR EXISTS (
            SELECT 1 FROM public.lmp_poc_links link
            WHERE link.lmp_id = lp.id
              AND link.poc_id = public.current_poc_id()
              AND link.is_active = true
          )
        )
    )
$$;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_lmp(uuid) TO authenticated, service_role;

-- Remove every historical broad POC/authenticated mutation policy.
DROP POLICY IF EXISTS "Authenticated can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can delete sessions" ON public.sessions;
DROP POLICY IF EXISTS "POCs can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "POCs can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "POCs can delete sessions" ON public.sessions;
DROP POLICY IF EXISTS "POCs and allocators can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "POCs and allocators can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "POCs and allocators can delete sessions" ON public.sessions;

CREATE POLICY "Assigned POCs can insert sessions"
  ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'poc'::public.app_role) AND public.is_assigned_to_lmp(lmp_id));
CREATE POLICY "Assigned POCs can update sessions"
  ON public.sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'poc'::public.app_role) AND public.is_assigned_to_lmp(lmp_id))
  WITH CHECK (public.has_role(auth.uid(), 'poc'::public.app_role) AND public.is_assigned_to_lmp(lmp_id));
CREATE POLICY "Assigned POCs can delete sessions"
  ON public.sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'poc'::public.app_role) AND public.is_assigned_to_lmp(lmp_id));

DROP POLICY IF EXISTS "Authenticated can insert lmp_mentors" ON public.lmp_mentors;
DROP POLICY IF EXISTS "Authenticated can update lmp_mentors" ON public.lmp_mentors;
DROP POLICY IF EXISTS "POCs can insert lmp_mentors" ON public.lmp_mentors;
DROP POLICY IF EXISTS "POCs can update lmp_mentors" ON public.lmp_mentors;
DROP POLICY IF EXISTS "POCs can delete lmp_mentors" ON public.lmp_mentors;
DROP POLICY IF EXISTS "POCs can insert mentors" ON public.mentors;

DROP POLICY IF EXISTS "Authenticated can insert lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Authenticated can update lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Authenticated can delete lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "POCs can update lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Assigned POCs can update lmp_candidates"
  ON public.lmp_candidates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'poc'::public.app_role) AND public.is_assigned_to_lmp(lmp_id))
  WITH CHECK (public.has_role(auth.uid(), 'poc'::public.app_role) AND public.is_assigned_to_lmp(lmp_id));

DROP INDEX IF EXISTS public.sheet_write_queue_active_idempotency_key;
CREATE UNIQUE INDEX sheet_write_queue_pending_idempotency_key
  ON public.sheet_write_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status = 'pending';

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_key text;
BEGIN
  IF COALESCE(NEW.sync_source, '') IN ('sheet', 'trigger_mirror') THEN RETURN NEW; END IF;
  IF NEW.company IS NULL OR NEW.company = '' OR NEW.role IS NULL OR NEW.role = '' THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'op', 'sync-db-to-sheet',
    'tab', 'LMP Tracker',
    'headerRow', 15,
    'company', NEW.company,
    'role', NEW.role,
    'lmp_code', NEW.lmp_code,
    'dbPatch', to_jsonb(NEW)
  );
  v_key := 'lmp:' || NEW.id::text || ':sync';

  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error,
     idempotency_key, entity_id, attempt_count)
  VALUES
    ('LMP Tracker', 'sync-db-to-sheet', v_payload, 'pending', now(), 'db_trigger', NULL,
     v_key, NEW.id, 0)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET
    payload = EXCLUDED.payload,
    next_retry_at = now(),
    last_error = NULL,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_lmp_process_delete_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'op', 'delete',
    'tab', 'LMP Tracker',
    'headerRow', 15,
    'id', OLD.id::text,
    'findBy', jsonb_build_object(
      'LMP ID', COALESCE(OLD.lmp_code, OLD.id::text),
      'Company', COALESCE(OLD.company, ''),
      'Role', COALESCE(OLD.role, '')
    )
  );

  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error,
     idempotency_key, entity_id, attempt_count)
  VALUES
    ('LMP Tracker', 'delete', v_payload, 'pending', now(), 'db_trigger', NULL,
     'lmp:' || OLD.id::text || ':delete', OLD.id, 0);
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_lmp_process_delete_sheet_sync failed: %', SQLERRM;
  RETURN OLD;
END;
$$;

COMMENT ON TABLE public.sheet_write_queue IS
  'Authoritative DB-to-Sheet outbox. Only sheets-retry-sweeper performs external Sheet writes.';
