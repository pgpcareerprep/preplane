CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_display text;
BEGIN
  SELECT id, display_name INTO v_id, v_display
  FROM public.profiles WHERE lower(email) = lower(NEW.email) LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.profiles
       SET user_id = NEW.id,
           display_name = COALESCE(NEW.raw_user_meta_data->>'full_name', v_display, NEW.email),
           email = NEW.email,
           updated_at = now()
     WHERE id = v_id;
  ELSE
    -- Unknown email: create as pending so admin must approve before access
    INSERT INTO public.profiles (user_id, display_name, email, role, access_status, is_active)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email, 'poc', 'pending', false);
  END IF;
  RETURN NEW;
END;
$function$;