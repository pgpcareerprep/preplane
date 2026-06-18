-- Outreach POCs are display-only: remove from operational assignment checks.

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
            SELECT 1 FROM public.lmp_poc_links link
            WHERE link.lmp_id = lp.id
              AND link.poc_id = public.current_poc_id()
              AND link.is_active = true
              AND link.role IN ('prep', 'support')
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public._progress_entry_authorized(
  p_log public.lmp_daily_logs,
  p_lmp public.lmp_processes
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poc_id uuid := public.current_poc_id();
  v_profile_email text;
  v_author_user_id uuid;
  v_author_poc_id uuid;
  v_author_email text;
  v_is_assigned boolean;
  v_is_author boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role)
     OR public.has_role(v_uid, 'allocator'::public.app_role) THEN
    RETURN true;
  END IF;

  v_author_user_id := NULLIF(p_log.metadata->>'author_user_id', '')::uuid;
  v_author_poc_id := NULLIF(p_log.metadata->>'author_poc_id', '')::uuid;
  v_author_email := lower(NULLIF(COALESCE(p_log.author_email, p_log.metadata->>'author_email'), ''));

  SELECT lower(NULLIF(email, ''))
  INTO v_profile_email
  FROM public.profiles
  WHERE user_id = v_uid
  LIMIT 1;

  v_is_assigned :=
    v_poc_id IS NOT NULL
    AND (
      p_lmp.prep_poc_id = v_poc_id
      OR p_lmp.support_poc_id = v_poc_id
      OR EXISTS (
        SELECT 1
        FROM public.lmp_poc_links k
        WHERE k.lmp_id = p_lmp.id
          AND k.is_active = true
          AND k.poc_id = v_poc_id
          AND k.role IN ('prep', 'support')
      )
    );

  v_is_author :=
    v_author_user_id = v_uid
    OR (v_poc_id IS NOT NULL AND v_author_poc_id = v_poc_id)
    OR (
      v_profile_email IS NOT NULL
      AND v_author_email IS NOT NULL
      AND v_profile_email = v_author_email
    );

  RETURN v_is_assigned AND v_is_author;
END;
$$;

DROP POLICY IF EXISTS "POC scoped view session_student_feedbacks" ON public.session_student_feedbacks;
CREATE POLICY "POC scoped view session_student_feedbacks"
ON public.session_student_feedbacks
FOR SELECT TO authenticated
USING (
  (current_poc_id() IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.lmp_processes lp ON lp.id = s.lmp_id
    WHERE s.id = session_student_feedbacks.session_id
      AND (
        lp.prep_poc_id = current_poc_id()
        OR lp.support_poc_id = current_poc_id()
        OR EXISTS (
          SELECT 1 FROM public.lmp_poc_links k
          WHERE k.lmp_id = lp.id
            AND k.is_active = true
            AND k.poc_id = current_poc_id()
            AND k.role IN ('prep', 'support')
        )
      )
  )
);

-- Helper: resolve poc_profiles.id → auth.users.id
CREATE OR REPLACE FUNCTION public.poc_profile_user_id(p_poc_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.user_id
  FROM public.poc_profiles pp
  JOIN public.profiles pr ON pr.id = pp.profile_id
  WHERE pp.id = p_poc_profile_id
  LIMIT 1;
$$;

-- Notify prep/support POCs (never outreach)
CREATE OR REPLACE FUNCTION public._notify_lmp_pocs(
  p_lmp_id uuid,
  p_title text,
  p_message text,
  p_category text,
  p_route text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT poc_id
    FROM public.lmp_poc_links
    WHERE lmp_id = p_lmp_id
      AND is_active = true
      AND role IN ('prep', 'support')
  LOOP
    PERFORM public.notify_user(
      public.poc_profile_user_id(r.poc_id),
      NULL,
      'lmp_process',
      p_lmp_id,
      p_title,
      p_message,
      p_category,
      'info',
      p_route,
      p_payload
    );
  END LOOP;
END;
$$;

-- POC assignment changes
CREATE OR REPLACE FUNCTION public.tg_notify_lmp_poc_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role NOT IN ('prep', 'support') THEN RETURN NEW; END IF;
    PERFORM public.notify_user(
      public.poc_profile_user_id(NEW.poc_id),
      NULL,
      'lmp_process',
      NEW.lmp_id,
      'POC assigned',
      format('You were assigned as %s POC on an LMP', NEW.role),
      'lmp',
      'info',
      format('/lmp/%s', NEW.lmp_id),
      jsonb_build_object('role', NEW.role)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active IS DISTINCT FROM true OR NEW.poc_id IS DISTINCT FROM OLD.poc_id) THEN
    IF NEW.role NOT IN ('prep', 'support') THEN RETURN NEW; END IF;
    PERFORM public.notify_user(
      public.poc_profile_user_id(NEW.poc_id),
      NULL,
      'lmp_process',
      NEW.lmp_id,
      'POC reassigned',
      format('You were assigned as %s POC on an LMP', NEW.role),
      'lmp',
      'info',
      format('/lmp/%s', NEW.lmp_id),
      jsonb_build_object('role', NEW.role)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lmp_poc_assignment ON public.lmp_poc_links;
CREATE TRIGGER trg_notify_lmp_poc_assignment
  AFTER INSERT OR UPDATE ON public.lmp_poc_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_lmp_poc_assignment();

-- Candidate status changes → notify assigned prep/support POCs
CREATE OR REPLACE FUNCTION public.tg_notify_candidate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
  v_name text;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  v_name := COALESCE(NEW.student_name, OLD.student_name, 'Candidate');
  IF TG_OP = 'INSERT' THEN
    PERFORM public._notify_lmp_pocs(
      v_lmp_id,
      'Candidate added',
      format('%s was added to an LMP', v_name),
      'candidate',
      format('/lmp/%s', v_lmp_id),
      jsonb_build_object('student_name', v_name)
    );
  ELSIF TG_OP = 'UPDATE' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage
    OR NEW.offer_status IS DISTINCT FROM OLD.offer_status
  ) THEN
    PERFORM public._notify_lmp_pocs(
      v_lmp_id,
      'Candidate updated',
      format('%s status/stage changed', v_name),
      'candidate',
      format('/lmp/%s', v_lmp_id),
      jsonb_build_object('status', NEW.status, 'pipeline_stage', NEW.pipeline_stage)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_candidate_change ON public.lmp_candidates;
CREATE TRIGGER trg_notify_candidate_change
  AFTER INSERT OR UPDATE ON public.lmp_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_candidate_change();

-- Session lifecycle
CREATE OR REPLACE FUNCTION public.tg_notify_session_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM public._notify_lmp_pocs(
      v_lmp_id,
      'Session scheduled',
      COALESCE(NEW.title, 'A new session was created'),
      'session',
      format('/lmp/%s', v_lmp_id),
      jsonb_build_object('session_id', NEW.id)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public._notify_lmp_pocs(
      v_lmp_id,
      'Session updated',
      format('Session status is now %s', NEW.status),
      'session',
      format('/lmp/%s', v_lmp_id),
      jsonb_build_object('session_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_session_change ON public.sessions;
CREATE TRIGGER trg_notify_session_change
  AFTER INSERT OR UPDATE OF status ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_session_change();

-- Fix notify_user actor skip: compare auth user ids via profiles
CREATE OR REPLACE FUNCTION public.notify_user(
  p_recipient_user_id uuid,
  p_actor_profile_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_message text,
  p_category text DEFAULT 'general',
  p_severity text DEFAULT 'info',
  p_route text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
  v_actor_user_id uuid;
BEGIN
  IF p_recipient_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_actor_profile_id IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id FROM public.profiles WHERE id = p_actor_profile_id LIMIT 1;
    IF v_actor_user_id IS NOT NULL AND v_actor_user_id = p_recipient_user_id THEN
      RETURN NULL;
    END IF;
  END IF;
  INSERT INTO user_notifications (
    recipient_user_id, actor_profile_id, entity_type, entity_id,
    title, message, category, severity, route, payload
  ) VALUES (
    p_recipient_user_id, p_actor_profile_id, p_entity_type, p_entity_id,
    p_title, p_message, p_category, p_severity, p_route, p_payload
  ) RETURNING id INTO nid;
  RETURN nid;
END;
$$;

-- Admins: notify on new LMP
CREATE OR REPLACE FUNCTION public.tg_notify_lmp_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role IN ('admin', 'allocator')
      AND p.user_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      r.user_id,
      NULL,
      'lmp_process',
      NEW.id,
      'New LMP created',
      format('%s — %s', COALESCE(NEW.company, 'LMP'), COALESCE(NEW.role, '')),
      'lmp',
      'info',
      format('/lmp/%s', NEW.id),
      '{}'::jsonb
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lmp_created ON public.lmp_processes;
CREATE TRIGGER trg_notify_lmp_created
  AFTER INSERT ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_lmp_created();
