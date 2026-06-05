
-- 1) Active-status helper (canonical: includes prep-ongoing variants & not-started)
CREATE OR REPLACE FUNCTION public.is_active_lmp_status(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _status IS NULL THEN false
    ELSE lower(regexp_replace(trim(_status), '[\s_]+', '-', 'g')) IN (
      'ongoing', 'not-started', 'prep-ongoing', 'prep-on-going'
    )
  END;
$$;

-- 2) Recompute domain counts using the active-status helper
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
    active_lmps     = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND public.is_active_lmp_status(status)), 0),
    converted_lmps  = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) LIKE 'converted%'), 0),
    offer_received  = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'offer received'), 0),
    dormant         = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'dormant'), 0),
    closed          = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'closed'), 0),
    on_hold         = COALESCE((SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) = 'on hold'), 0),
    conversion_rate = CASE
      WHEN (SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id) = 0 THEN 0
      ELSE round(
        100.0 * (SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id AND lower(coalesce(status,'')) LIKE 'converted%')
        / (SELECT count(*) FROM public.lmp_processes WHERE domain_id = _domain_id), 2)
    END,
    updated_at = now()
  WHERE d.id = _domain_id;
END;
$$;

-- 3) Auto-resolve lmp_processes.domain_id from domain_raw using domains.name + aliases.
CREATE OR REPLACE FUNCTION public.resolve_lmp_domain_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_key text;
BEGIN
  IF NEW.domain_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_key := lower(trim(coalesce(NEW.domain_raw, '')));
  IF v_key = '' THEN
    SELECT id INTO v_id FROM public.domains WHERE slug = 'unmapped' LIMIT 1;
    NEW.domain_id := v_id;
    RETURN NEW;
  END IF;
  SELECT id INTO v_id FROM public.domains
    WHERE lower(name) = v_key OR slug = v_key OR v_key = ANY(COALESCE(aliases, '{}'::text[]))
    LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.domains WHERE slug = 'unmapped' LIMIT 1;
  END IF;
  NEW.domain_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_lmp_domain_id ON public.lmp_processes;
CREATE TRIGGER trg_resolve_lmp_domain_id
  BEFORE INSERT OR UPDATE OF domain_raw, domain_id ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.resolve_lmp_domain_id();

-- 4) Backfill domain_id for existing rows where it's missing
UPDATE public.lmp_processes l
SET domain_id = d.id
FROM public.domains d
WHERE l.domain_id IS NULL
  AND coalesce(trim(l.domain_raw), '') <> ''
  AND (
    lower(d.name) = lower(trim(l.domain_raw))
    OR d.slug = lower(trim(l.domain_raw))
    OR lower(trim(l.domain_raw)) = ANY(COALESCE(d.aliases, '{}'::text[]))
  );

UPDATE public.lmp_processes l
SET domain_id = (SELECT id FROM public.domains WHERE slug = 'unmapped' LIMIT 1)
WHERE l.domain_id IS NULL;

-- 5) Recompute all domain counts now
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.domains LOOP
    PERFORM public.recompute_domain_counts(r.id);
  END LOOP;
END $$;

-- 6) Recompute poc_profiles.active_load / historical_load from canonical links
WITH agg AS (
  SELECT k.poc_id,
    count(DISTINCT k.lmp_id) FILTER (WHERE public.is_active_lmp_status(l.status)) AS active_cnt,
    count(DISTINCT k.lmp_id) AS total_cnt,
    count(DISTINCT k.lmp_id) FILTER (WHERE lower(coalesce(l.status,'')) LIKE 'converted%') AS converted_cnt
  FROM public.lmp_poc_links k
  JOIN public.lmp_processes l ON l.id = k.lmp_id
  WHERE k.is_active = true
  GROUP BY k.poc_id
)
UPDATE public.poc_profiles p
SET
  active_load = COALESCE(agg.active_cnt, 0),
  historical_load = COALESCE(agg.total_cnt, 0),
  converted_count = COALESCE(agg.converted_cnt, 0),
  conversion_rate = CASE WHEN COALESCE(agg.total_cnt,0) = 0 THEN 0
                         ELSE round(100.0 * agg.converted_cnt / agg.total_cnt, 2) END
FROM agg
WHERE p.id = agg.poc_id;

UPDATE public.poc_profiles p
SET active_load = 0, historical_load = 0, converted_count = 0, conversion_rate = 0
WHERE NOT EXISTS (SELECT 1 FROM public.lmp_poc_links k WHERE k.poc_id = p.id AND k.is_active = true);

-- 7) Trigger that keeps poc_profiles.active_load fresh on link or status changes
CREATE OR REPLACE FUNCTION public.recompute_poc_load(_poc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active int; v_total int; v_conv int;
BEGIN
  IF _poc_id IS NULL THEN RETURN; END IF;
  SELECT
    count(DISTINCT k.lmp_id) FILTER (WHERE public.is_active_lmp_status(l.status)),
    count(DISTINCT k.lmp_id),
    count(DISTINCT k.lmp_id) FILTER (WHERE lower(coalesce(l.status,'')) LIKE 'converted%')
  INTO v_active, v_total, v_conv
  FROM public.lmp_poc_links k
  JOIN public.lmp_processes l ON l.id = k.lmp_id
  WHERE k.poc_id = _poc_id AND k.is_active = true;
  UPDATE public.poc_profiles
  SET active_load = COALESCE(v_active, 0),
      historical_load = COALESCE(v_total, 0),
      converted_count = COALESCE(v_conv, 0),
      conversion_rate = CASE WHEN COALESCE(v_total,0)=0 THEN 0
                              ELSE round(100.0 * v_conv / v_total, 2) END
  WHERE id = _poc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_poc_load_from_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_poc_load(OLD.poc_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_poc_load(NEW.poc_id);
    IF TG_OP = 'UPDATE' AND OLD.poc_id IS DISTINCT FROM NEW.poc_id THEN
      PERFORM public.recompute_poc_load(OLD.poc_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_poc_load_from_links ON public.lmp_poc_links;
CREATE TRIGGER trg_poc_load_from_links
  AFTER INSERT OR UPDATE OR DELETE ON public.lmp_poc_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_poc_load_from_links();

CREATE OR REPLACE FUNCTION public.tg_poc_load_from_lmp_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  FOR r IN SELECT DISTINCT poc_id FROM public.lmp_poc_links WHERE lmp_id = COALESCE(NEW.id, OLD.id) LOOP
    PERFORM public.recompute_poc_load(r.poc_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poc_load_from_lmp_status ON public.lmp_processes;
CREATE TRIGGER trg_poc_load_from_lmp_status
  AFTER INSERT OR UPDATE OF status ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.tg_poc_load_from_lmp_status();
