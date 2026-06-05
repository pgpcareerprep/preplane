-- #9 POC email uniqueness (partial, ignores NULL/empty)
CREATE UNIQUE INDEX IF NOT EXISTS poc_profiles_email_unique
  ON public.poc_profiles (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- #4 Domain counts derived from lmp_processes
CREATE OR REPLACE FUNCTION public.recompute_domain_counts(_domain_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _domain_id IS NULL THEN RETURN; END IF;
  UPDATE public.domains d
  SET
    total_lmps      = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id), 0),
    active_lmps     = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) NOT IN ('converted','closed','rejected','on hold','dormant')), 0),
    converted_lmps  = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'converted'), 0),
    offer_received  = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'offer received'), 0),
    dormant         = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'dormant'), 0),
    closed          = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'closed'), 0),
    on_hold         = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'on hold'), 0),
    conversion_rate = CASE
      WHEN (SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id) = 0 THEN 0
      ELSE round(
        100.0 * (SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'converted')
        / (SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id), 2)
    END,
    updated_at = now()
  WHERE d.id = _domain_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_lmp_domain_counts_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_domain_counts(NEW.domain_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_domain_counts(OLD.domain_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.domain_id IS DISTINCT FROM OLD.domain_id THEN
      PERFORM public.recompute_domain_counts(OLD.domain_id);
      PERFORM public.recompute_domain_counts(NEW.domain_id);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.recompute_domain_counts(NEW.domain_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lmp_domain_counts_sync ON public.lmp_processes;
CREATE TRIGGER trg_lmp_domain_counts_sync
AFTER INSERT OR UPDATE OR DELETE ON public.lmp_processes
FOR EACH ROW EXECUTE FUNCTION public.tg_lmp_domain_counts_sync();

-- Backfill all domain counts now
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.domains LOOP
    PERFORM public.recompute_domain_counts(r.id);
  END LOOP;
END $$;