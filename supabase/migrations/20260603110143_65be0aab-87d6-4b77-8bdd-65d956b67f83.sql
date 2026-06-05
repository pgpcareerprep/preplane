CREATE OR REPLACE FUNCTION public._log_timeline(
  p_lmp_id uuid,
  p_event text,
  p_desc text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_lmp_id IS NULL THEN
    RETURN;
  END IF;

  -- Skip when parent LMP is gone (e.g. cascade delete in progress).
  IF NOT EXISTS (SELECT 1 FROM public.lmp_processes WHERE id = p_lmp_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.lmp_timeline(lmp_id, event_type, description, actor, metadata)
  VALUES (p_lmp_id, p_event, p_desc, public.current_actor_name(), COALESCE(p_meta, '{}'::jsonb));
END;
$$;