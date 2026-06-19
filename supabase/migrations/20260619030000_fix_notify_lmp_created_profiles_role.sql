-- Fix tg_notify_lmp_created: user_roles was dropped; roles live on profiles.role.

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
    WHERE p.user_id IS NOT NULL
      AND p.role IN ('admin', 'allocator')
      AND COALESCE(p.access_status, 'approved') = 'approved'
      AND COALESCE(p.is_active, true) = true
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
