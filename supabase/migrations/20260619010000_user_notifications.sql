-- User-scoped in-app notifications

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  severity text NOT NULL DEFAULT 'info',
  route text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_recipient_idx
  ON public.user_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON public.user_notifications (recipient_user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_notifications_select_own ON public.user_notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY user_notifications_update_own ON public.user_notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Inserts via service role / triggers only
CREATE POLICY user_notifications_insert_service ON public.user_notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

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
BEGIN
  IF p_recipient_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_actor_profile_id IS NOT NULL AND p_actor_profile_id = p_recipient_user_id THEN
    RETURN NULL;
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

GRANT EXECUTE ON FUNCTION public.notify_user TO service_role;

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

-- Notify assigned prep/support POCs on LMP status change
CREATE OR REPLACE FUNCTION public.tg_notify_lmp_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.prep_poc_id IS NOT NULL THEN
    PERFORM notify_user(
      public.poc_profile_user_id(NEW.prep_poc_id), NULL, 'lmp_process', NEW.id,
      'LMP status updated',
      format('%s — %s is now %s', COALESCE(NEW.company, 'LMP'), COALESCE(NEW.role, ''), NEW.status),
      'lmp', 'info', format('/lmp/%s', NEW.id),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  IF NEW.support_poc_id IS NOT NULL AND NEW.support_poc_id IS DISTINCT FROM NEW.prep_poc_id THEN
    PERFORM notify_user(
      public.poc_profile_user_id(NEW.support_poc_id), NULL, 'lmp_process', NEW.id,
      'LMP status updated',
      format('%s — %s is now %s', COALESCE(NEW.company, 'LMP'), COALESCE(NEW.role, ''), NEW.status),
      'lmp', 'info', format('/lmp/%s', NEW.id),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lmp_status_change ON public.lmp_processes;
CREATE TRIGGER trg_notify_lmp_status_change
  AFTER UPDATE OF status ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_lmp_status_change();
