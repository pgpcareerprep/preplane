-- Multi-mentor assignment support.
--
-- Adds a trigger-driven recompute function so that lmp_processes.mentor_selected
-- always reflects ALL currently-assigned mentor names (comma-joined), not just
-- the last one written by a client. Also extends align_mentor_to_lmp with a
-- p_replace boolean so the UI can choose "Add to existing" vs "Replace all".
--
-- Non-destructive: adds new function/trigger, modifies two existing RPCs (same
-- signatures + one optional parameter added). Backfills all current LMPs.

-- ─── 1. Recompute function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_lmp_mentor_summary(p_lmp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_names text;
BEGIN
  SELECT string_agg(lm.mentor_name, ', ' ORDER BY lm.assigned_at, lm.mentor_name)
  INTO v_names
  FROM public.lmp_mentors lm
  WHERE lm.lmp_id = p_lmp_id
    AND lm.status = 'assigned'
    AND lm.mentor_name IS NOT NULL
    AND lm.mentor_name <> '';

  UPDATE public.lmp_processes
  SET
    mentor_selected = v_names,
    mentor_aligned  = (v_names IS NOT NULL)
  WHERE id = p_lmp_id;
END;
$$;

-- ─── 2. Trigger function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_lmp_mentors_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_lmp_mentor_summary(OLD.lmp_id);
  ELSE
    PERFORM public.recompute_lmp_mentor_summary(NEW.lmp_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS lmp_mentors_recompute ON public.lmp_mentors;
CREATE TRIGGER lmp_mentors_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.lmp_mentors
  FOR EACH ROW EXECUTE FUNCTION public.trg_lmp_mentors_recompute();

-- ─── 3. align_mentor_to_lmp — add p_replace, delegate summary to trigger ─────

CREATE OR REPLACE FUNCTION public.align_mentor_to_lmp(
  p_lmp_id      uuid,
  p_mentor      jsonb,
  p_match_score numeric  DEFAULT NULL,
  p_replace     boolean  DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id uuid;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'poc'::public.app_role) THEN
    RAISE EXCEPTION 'MENTOR_ASSIGNMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lmp_processes WHERE id = p_lmp_id) THEN
    RAISE EXCEPTION 'LMP_NOT_FOUND';
  END IF;

  v_mentor_id := public.resolve_or_create_mentor(p_mentor);

  -- Replace mode: mark all other currently-assigned mentors as replaced first.
  -- The trigger will fire for each UPDATE, but we want one final recompute after
  -- the new mentor is inserted, so use a sub-transaction-safe UPDATE here.
  IF p_replace THEN
    UPDATE public.lmp_mentors
    SET status = 'replaced'
    WHERE lmp_id = p_lmp_id
      AND status = 'assigned'
      AND mentor_id <> v_mentor_id;
  END IF;

  INSERT INTO public.lmp_mentors(
    lmp_id, mentor_id, mentor_name, mentor_source, match_score, status, sync_source, assigned_at
  )
  VALUES (
    p_lmp_id, v_mentor_id,
    p_mentor->>'name',
    p_mentor->>'source',
    p_match_score,
    'assigned',
    'mentor_assignment_rpc',
    now()
  )
  ON CONFLICT (lmp_id, mentor_id) DO UPDATE SET
    mentor_name   = EXCLUDED.mentor_name,
    mentor_source = EXCLUDED.mentor_source,
    match_score   = EXCLUDED.match_score,
    status        = 'assigned',
    sync_source   = 'mentor_assignment_rpc',
    assigned_at   = now();
  -- Note: mentor_selected and mentor_aligned are updated automatically by the
  -- lmp_mentors_recompute trigger (trg_lmp_mentors_recompute).

  RETURN jsonb_build_object('mentor_id', v_mentor_id);
END;
$$;

-- ─── 4. assign_mentor_session — delegate mentor_selected update to trigger ────

CREATE OR REPLACE FUNCTION public.assign_mentor_session(
  p_lmp_id        uuid,
  p_mentor        jsonb,
  p_candidate_ids uuid[],
  p_student_ids   uuid[],
  p_scheduled_at  timestamptz,
  p_notes         text,
  p_match_score   numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id          uuid;
  v_session_id         uuid;
  v_existing_candidates uuid[];
  v_candidate_count    integer;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role) THEN
    RAISE EXCEPTION 'MENTOR_ASSIGNMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_lmp_id IS NULL OR p_scheduled_at IS NULL OR COALESCE(cardinality(p_candidate_ids), 0) = 0 THEN
    RAISE EXCEPTION 'INVALID_MENTOR_ASSIGNMENT';
  END IF;

  SELECT count(*) INTO v_candidate_count
  FROM public.lmp_candidates
  WHERE lmp_id = p_lmp_id AND id = ANY(p_candidate_ids);
  IF v_candidate_count <> cardinality(p_candidate_ids) THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_IN_LMP' USING ERRCODE = '42501';
  END IF;

  v_mentor_id := public.resolve_or_create_mentor(p_mentor);

  INSERT INTO public.lmp_mentors(
    lmp_id, mentor_id, mentor_name, mentor_source, match_score, status, sync_source, assigned_at
  )
  VALUES (
    p_lmp_id, v_mentor_id,
    p_mentor->>'name',
    p_mentor->>'source',
    p_match_score,
    'assigned',
    'mentor_assignment_rpc',
    now()
  )
  ON CONFLICT (lmp_id, mentor_id) DO UPDATE SET
    mentor_name   = EXCLUDED.mentor_name,
    mentor_source = EXCLUDED.mentor_source,
    match_score   = EXCLUDED.match_score,
    status        = 'assigned',
    sync_source   = 'mentor_assignment_rpc',
    assigned_at   = now();
  -- lmp_processes.mentor_selected updated automatically by trigger.

  SELECT id, candidate_ids INTO v_session_id, v_existing_candidates
  FROM public.sessions
  WHERE lmp_id = p_lmp_id AND mentor_id = v_mentor_id AND scheduled_at = p_scheduled_at
  LIMIT 1
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    INSERT INTO public.sessions(
      lmp_id, mentor_id, student_id, candidate_ids, scheduled_at,
      session_type, status, notes, sync_source
    )
    VALUES (
      p_lmp_id, v_mentor_id, p_student_ids[1], p_candidate_ids, p_scheduled_at,
      'mock', 'scheduled', p_notes, 'mentor_assignment_rpc'
    )
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.sessions
    SET candidate_ids = ARRAY(
          SELECT DISTINCT candidate_id
          FROM unnest(COALESCE(v_existing_candidates, '{}'::uuid[]) || p_candidate_ids) candidate_id
        ),
        student_id  = COALESCE(p_student_ids[1], student_id),
        notes       = p_notes,
        updated_at  = now()
    WHERE id = v_session_id;
  END IF;

  UPDATE public.lmp_candidates
  SET mentor_id = v_mentor_id
  WHERE lmp_id = p_lmp_id AND id = ANY(p_candidate_ids);

  RETURN jsonb_build_object('mentor_id', v_mentor_id, 'session_id', v_session_id);
END;
$$;

-- ─── 5. Backfill — recompute all LMPs that have assigned mentors ──────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT lmp_id
    FROM public.lmp_mentors
    WHERE status = 'assigned'
  LOOP
    PERFORM public.recompute_lmp_mentor_summary(r.lmp_id);
  END LOOP;
END;
$$;

-- ─── 6. Permissions ──────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.recompute_lmp_mentor_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_lmp_mentor_summary(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.align_mentor_to_lmp(uuid, jsonb, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.align_mentor_to_lmp(uuid, jsonb, numeric, boolean) TO authenticated, service_role;

-- Keep old 3-arg signature callable for legacy callers during rollout
REVOKE ALL ON FUNCTION public.align_mentor_to_lmp(uuid, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.align_mentor_to_lmp(uuid, jsonb, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_mentor_session(uuid, jsonb, uuid[], uuid[], timestamptz, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_mentor_session(uuid, jsonb, uuid[], uuid[], timestamptz, text, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
