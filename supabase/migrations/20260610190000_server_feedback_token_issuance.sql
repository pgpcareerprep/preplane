-- Issue public feedback links server-side. Plaintext tokens are returned once
-- to an authorized caller and never persisted for newly issued links.

CREATE OR REPLACE FUNCTION public.issue_session_feedback_token(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_lmp_id uuid;
  v_token text;
BEGIN
  SELECT lmp_id INTO v_lmp_id FROM public.sessions WHERE id = p_session_id;
  IF v_lmp_id IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
     AND NOT public.is_assigned_to_lmp(v_lmp_id) THEN
    RAISE EXCEPTION 'FEEDBACK_TOKEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  UPDATE public.sessions
  SET student_feedback_token = NULL,
      student_feedback_token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      student_feedback_token_expires_at = now() + interval '30 days',
      legacy_feedback_token_valid_until = NULL,
      updated_at = now()
  WHERE id = p_session_id;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_session_feedback_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_session_feedback_token(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_client_plaintext_feedback_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NEW.student_feedback_token IS DISTINCT FROM OLD.student_feedback_token THEN
    RAISE EXCEPTION 'PLAINTEXT_FEEDBACK_TOKENS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_prevent_client_plaintext_feedback_token ON public.sessions;
CREATE TRIGGER sessions_prevent_client_plaintext_feedback_token
BEFORE UPDATE OF student_feedback_token ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_client_plaintext_feedback_token();

