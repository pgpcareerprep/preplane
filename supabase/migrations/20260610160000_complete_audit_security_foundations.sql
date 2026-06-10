-- Complete-audit security foundations.
-- Additive where possible; compatibility paths are explicitly time bounded.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Conservative LMP RBAC ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Assigned POC can delete lmp_processes" ON public.lmp_processes;
DROP POLICY IF EXISTS "Admins can delete lmp_processes" ON public.lmp_processes;
CREATE POLICY "Admins can delete lmp_processes"
  ON public.lmp_processes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.enforce_poc_lmp_operational_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'poc'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role) THEN
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

    IF NEW.company IS DISTINCT FROM OLD.company
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
       OR NEW.domain_raw IS DISTINCT FROM OLD.domain_raw
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.date IS DISTINCT FROM OLD.date
       OR NEW.closing_date IS DISTINCT FROM OLD.closing_date
       OR NEW.admin_owner IS DISTINCT FROM OLD.admin_owner
       OR NEW.allocator IS DISTINCT FROM OLD.allocator
       OR NEW.prep_poc IS DISTINCT FROM OLD.prep_poc
       OR NEW.support_poc IS DISTINCT FROM OLD.support_poc
       OR NEW.outreach_poc IS DISTINCT FROM OLD.outreach_poc
       OR NEW.prep_poc_id IS DISTINCT FROM OLD.prep_poc_id
       OR NEW.support_poc_id IS DISTINCT FROM OLD.support_poc_id
       OR NEW.outreach_poc_ids IS DISTINCT FROM OLD.outreach_poc_ids
       OR NEW.final_convert IS DISTINCT FROM OLD.final_convert
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'POC_FIELD_NOT_EDITABLE' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_poc_lmp_operational_fields ON public.lmp_processes;
CREATE TRIGGER trg_enforce_poc_lmp_operational_fields
  BEFORE UPDATE ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_poc_lmp_operational_fields();

-- Safe creator attribution: only exact unique email matches are backfilled.
UPDATE public.lmp_processes lp
SET created_by = au.id
FROM auth.users au
WHERE lp.created_by IS NULL
  AND au.email IS NOT NULL
  AND lower(trim(au.email)) = lower(trim(lp.jd_uploaded_by))
  AND 1 = (
    SELECT count(*) FROM auth.users candidate
    WHERE lower(trim(candidate.email)) = lower(trim(lp.jd_uploaded_by))
  );

CREATE OR REPLACE VIEW public.identity_integrity_review
WITH (security_invoker = true)
AS
SELECT
  'lmp_creator'::text AS entity_type,
  lp.id AS entity_id,
  concat_ws(' · ', lp.company, lp.role) AS label,
  jsonb_build_object(
    'allocator', lp.allocator,
    'jd_uploaded_by', lp.jd_uploaded_by,
    'created_by', lp.created_by
  ) AS evidence,
  'creator_requires_review'::text AS issue
FROM public.lmp_processes lp
WHERE lp.created_by IS NULL
UNION ALL
SELECT
  'mentor'::text,
  m.id,
  concat_ws(' · ', m.name, m.company),
  jsonb_build_object('email', m.email, 'linkedin', m.linkedin),
  'possible_duplicate_identity'::text
FROM public.mentors m
WHERE EXISTS (
  SELECT 1 FROM public.mentors other
  WHERE other.id <> m.id
    AND (
      (m.email IS NOT NULL AND lower(trim(other.email)) = lower(trim(m.email)))
      OR (m.linkedin IS NOT NULL AND trim(other.linkedin) = trim(m.linkedin))
    )
);

REVOKE ALL ON public.identity_integrity_review FROM anon, authenticated;
GRANT SELECT ON public.identity_integrity_review TO service_role;

-- ── Server-enforced per-user AI budgets ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_daily_budgets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (timezone('utc', now()))::date,
  requests_used integer NOT NULL DEFAULT 0 CHECK (requests_used >= 0),
  tokens_used bigint NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  request_limit integer NOT NULL DEFAULT 200 CHECK (request_limit > 0),
  token_limit bigint NOT NULL DEFAULT 500000 CHECK (token_limit > 0),
  last_model text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.ai_daily_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own AI budget" ON public.ai_daily_budgets;
CREATE POLICY "Users read own AI budget"
  ON public.ai_daily_budgets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'allocator'::public.app_role));
GRANT SELECT ON public.ai_daily_budgets TO authenticated;
GRANT ALL ON public.ai_daily_budgets TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_request(p_user_id uuid, p_model text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.ai_daily_budgets;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_user');
  END IF;
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_daily_budgets(user_id, usage_date, last_model)
  VALUES (p_user_id, (timezone('utc', now()))::date, p_model)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET last_model = COALESCE(EXCLUDED.last_model, ai_daily_budgets.last_model),
        updated_at = now()
  RETURNING * INTO v;

  IF v.requests_used >= v.request_limit OR v.tokens_used >= v.token_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'daily_budget_exhausted',
      'requests_used', v.requests_used, 'request_limit', v.request_limit,
      'tokens_used', v.tokens_used, 'token_limit', v.token_limit,
      'reset_at', ((v.usage_date + 1)::timestamp AT TIME ZONE 'UTC')
    );
  END IF;

  UPDATE public.ai_daily_budgets
  SET requests_used = requests_used + 1, updated_at = now()
  WHERE user_id = p_user_id AND usage_date = v.usage_date
  RETURNING * INTO v;

  RETURN jsonb_build_object(
    'allowed', true, 'requests_used', v.requests_used, 'request_limit', v.request_limit,
    'tokens_used', v.tokens_used, 'token_limit', v.token_limit,
    'reset_at', ((v.usage_date + 1)::timestamp AT TIME ZONE 'UTC')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ai_tokens(p_user_id uuid, p_tokens integer, p_model text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR COALESCE(p_tokens, 0) <= 0 THEN RETURN; END IF;
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.ai_daily_budgets(user_id, usage_date, tokens_used, last_model)
  VALUES (p_user_id, (timezone('utc', now()))::date, p_tokens, p_model)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET tokens_used = ai_daily_budgets.tokens_used + EXCLUDED.tokens_used,
        last_model = COALESCE(EXCLUDED.last_model, ai_daily_budgets.last_model),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_ai_request(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_tokens(uuid, integer, text) TO authenticated, service_role;

-- ── Hashed feedback tokens with 30-day legacy compatibility ──────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS student_feedback_token_hash text,
  ADD COLUMN IF NOT EXISTS student_feedback_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_feedback_token_valid_until timestamptz;

UPDATE public.sessions
SET student_feedback_token_hash = encode(extensions.digest(student_feedback_token, 'sha256'), 'hex'),
    legacy_feedback_token_valid_until = COALESCE(legacy_feedback_token_valid_until, now() + interval '30 days'),
    student_feedback_token_expires_at = COALESCE(student_feedback_token_expires_at, created_at + interval '30 days')
WHERE student_feedback_token IS NOT NULL
  AND student_feedback_token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_student_feedback_token_hash_key
  ON public.sessions(student_feedback_token_hash)
  WHERE student_feedback_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.feedback_abuse_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  token_hash text NOT NULL,
  ip_hash text,
  action text NOT NULL CHECK (action IN ('validate', 'submit')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_abuse_events_lookup
  ON public.feedback_abuse_events(token_hash, ip_hash, action, created_at DESC);
ALTER TABLE public.feedback_abuse_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.feedback_abuse_events TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_feedback_session(p_token text)
RETURNS TABLE(session_id uuid, used_legacy boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         (s.student_feedback_token = p_token) AS used_legacy
  FROM public.sessions s
  WHERE (
    s.student_feedback_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    OR (
      s.student_feedback_token = p_token
      AND s.legacy_feedback_token_valid_until > now()
    )
  )
  AND COALESCE(s.student_feedback_token_expires_at, s.created_at + interval '30 days') > now()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.resolve_feedback_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_feedback_session(text) TO service_role;

-- ── Deterministic Sheet queue metadata ────────────────────────────────────

ALTER TABLE public.sheet_write_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sheet_write_queue_active_idempotency_key
  ON public.sheet_write_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('pending', 'processing', 'retrying');

COMMENT ON TABLE public.sheet_write_queue IS
  'Canonical durable DB-to-Sheet outbox. Direct frontend Sheet writes are deprecated.';

-- Server-side operational settings replacing browser-local business defaults.
INSERT INTO public.system_settings(key, value, updated_by)
VALUES
  ('ai_user_budget', '{"request_limit":200,"token_limit":500000,"reset_timezone":"UTC"}', 'audit-remediation'),
  ('platform_environment', '{"app_url":"https://preplane.pages.dev","brand_name":"PrepLane"}', 'audit-remediation'),
  ('mentor_company_tiers', '{"tier1":[],"tier2":[],"startup_markers":["labs","ai","tech","studio","ventures"]}', 'audit-remediation')
ON CONFLICT (key) DO NOTHING;
