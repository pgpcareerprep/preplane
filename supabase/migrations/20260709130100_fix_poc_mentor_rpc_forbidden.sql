-- Allow POC role to resolve/create mentors and assign mentor sessions
-- (align_mentor_to_lmp already permits POC; these helpers did not).

CREATE OR REPLACE FUNCTION public.resolve_or_create_mentor(
  p_mentor jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_email text := lower(trim(COALESCE(p_mentor->>'email', '')));
  v_linkedin text := trim(COALESCE(p_mentor->>'linkedin', ''));
  v_name text := trim(COALESCE(p_mentor->>'name', ''));
  v_company text := trim(COALESCE(p_mentor->>'company', ''));
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'poc'::public.app_role) THEN
    RAISE EXCEPTION 'MENTOR_MANAGEMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'MENTOR_NAME_REQUIRED'; END IF;

  IF COALESCE(p_mentor->>'id', '') ~* '^[0-9a-f-]{36}$' THEN
    SELECT id INTO v_id FROM public.mentors WHERE id = (p_mentor->>'id')::uuid;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  IF v_email <> '' THEN
    SELECT array_agg(id) INTO v_ids FROM public.mentors WHERE lower(trim(email)) = v_email;
    IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
    IF cardinality(v_ids) > 1 THEN RAISE EXCEPTION 'MENTOR_IDENTITY_AMBIGUOUS_EMAIL'; END IF;
  END IF;

  IF v_linkedin <> '' THEN
    SELECT array_agg(id) INTO v_ids FROM public.mentors WHERE trim(linkedin) = v_linkedin;
    IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
    IF cardinality(v_ids) > 1 THEN RAISE EXCEPTION 'MENTOR_IDENTITY_AMBIGUOUS_LINKEDIN'; END IF;
  END IF;

  SELECT array_agg(id) INTO v_ids
  FROM public.mentors
  WHERE lower(trim(name)) = lower(v_name)
    AND lower(trim(COALESCE(company, ''))) = lower(v_company);
  IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
  IF cardinality(v_ids) > 1 THEN RAISE EXCEPTION 'MENTOR_IDENTITY_AMBIGUOUS_NAME_COMPANY'; END IF;

  INSERT INTO public.mentors(name, email, role, designation, company, linkedin, source, sync_source, availability)
  VALUES (
    v_name,
    NULLIF(v_email, ''),
    NULLIF(trim(COALESCE(p_mentor->>'role', '')), ''),
    NULLIF(trim(COALESCE(p_mentor->>'role', '')), ''),
    NULLIF(v_company, ''),
    NULLIF(v_linkedin, ''),
    COALESCE(NULLIF(trim(p_mentor->>'source'), ''), 'EXT'),
    'mentor_assignment_rpc',
    'available'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

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
     AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'poc'::public.app_role) THEN
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

REVOKE ALL ON FUNCTION public.resolve_or_create_mentor(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_or_create_mentor(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_mentor_session(uuid, jsonb, uuid[], uuid[], timestamptz, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_mentor_session(uuid, jsonb, uuid[], uuid[], timestamptz, text, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
