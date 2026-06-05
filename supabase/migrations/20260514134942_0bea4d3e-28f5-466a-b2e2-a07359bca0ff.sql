
-- ============ A. poc_aliases (identity layer) ============
CREATE TABLE public.poc_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poc_id uuid NOT NULL REFERENCES public.poc_profiles(id) ON DELETE CASCADE,
  alias_norm text NOT NULL,
  alias text NOT NULL,
  source text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_norm)
);
CREATE INDEX idx_poc_aliases_poc ON public.poc_aliases(poc_id);

ALTER TABLE public.poc_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read poc_aliases"
  ON public.poc_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage poc_aliases"
  ON public.poc_aliases FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed from existing POCs (full name + first name)
INSERT INTO public.poc_aliases (poc_id, alias_norm, alias, source)
SELECT p.id, lower(trim(p.name)), p.name, 'auto'
FROM public.poc_profiles p
WHERE p.name IS NOT NULL AND trim(p.name) <> ''
ON CONFLICT (alias_norm) DO NOTHING;

INSERT INTO public.poc_aliases (poc_id, alias_norm, alias, source)
SELECT DISTINCT ON (lower(split_part(trim(p.name), ' ', 1)))
       p.id,
       lower(split_part(trim(p.name), ' ', 1)),
       split_part(trim(p.name), ' ', 1),
       'auto'
FROM public.poc_profiles p
WHERE p.name IS NOT NULL
  AND position(' ' in trim(p.name)) > 0
ORDER BY lower(split_part(trim(p.name), ' ', 1)), p.created_at
ON CONFLICT (alias_norm) DO NOTHING;

-- Auto-add aliases when poc_profiles changes
CREATE OR REPLACE FUNCTION public.sync_poc_aliases()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS NULL OR trim(NEW.name) = '' THEN RETURN NEW; END IF;
  INSERT INTO public.poc_aliases (poc_id, alias_norm, alias, source)
  VALUES (NEW.id, lower(trim(NEW.name)), NEW.name, 'auto')
  ON CONFLICT (alias_norm) DO NOTHING;
  IF position(' ' in trim(NEW.name)) > 0 THEN
    INSERT INTO public.poc_aliases (poc_id, alias_norm, alias, source)
    VALUES (NEW.id, lower(split_part(trim(NEW.name),' ',1)), split_part(trim(NEW.name),' ',1), 'auto')
    ON CONFLICT (alias_norm) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_poc_aliases
AFTER INSERT OR UPDATE OF name ON public.poc_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_poc_aliases();

-- ============ B. lmp_poc_links ============
CREATE TABLE public.lmp_poc_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lmp_id uuid NOT NULL REFERENCES public.lmp_processes(id) ON DELETE CASCADE,
  poc_id uuid NOT NULL REFERENCES public.poc_profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('prep','support','outreach')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lmp_id, role, poc_id)
);
CREATE INDEX idx_lmp_poc_links_poc ON public.lmp_poc_links(poc_id, role);
CREATE INDEX idx_lmp_poc_links_lmp ON public.lmp_poc_links(lmp_id);

ALTER TABLE public.lmp_poc_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read lmp_poc_links"
  ON public.lmp_poc_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/mods manage lmp_poc_links"
  ON public.lmp_poc_links FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

-- Helper to (re)resolve a single LMP's POC text columns into links
CREATE OR REPLACE FUNCTION public.resolve_lmp_poc_links(_lmp_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  SELECT prep_poc, support_poc, outreach_poc INTO r
  FROM public.lmp_processes WHERE id = _lmp_id;

  DELETE FROM public.lmp_poc_links WHERE lmp_id = _lmp_id;

  -- For each of prep/support/outreach, the column may contain comma-separated names
  PERFORM 1; -- noop
  IF r.prep_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role)
    SELECT _lmp_id, a.poc_id, 'prep'
    FROM regexp_split_to_table(r.prep_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_aliases a ON a.alias_norm = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT DO NOTHING;
  END IF;
  IF r.support_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role)
    SELECT _lmp_id, a.poc_id, 'support'
    FROM regexp_split_to_table(r.support_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_aliases a ON a.alias_norm = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT DO NOTHING;
  END IF;
  IF r.outreach_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role)
    SELECT _lmp_id, a.poc_id, 'outreach'
    FROM regexp_split_to_table(r.outreach_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_aliases a ON a.alias_norm = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Trigger to keep links fresh when lmp_processes row changes
CREATE OR REPLACE FUNCTION public.trg_resolve_lmp_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.resolve_lmp_poc_links(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_lmp_links_after_change
AFTER INSERT OR UPDATE OF prep_poc, support_poc, outreach_poc ON public.lmp_processes
FOR EACH ROW EXECUTE FUNCTION public.trg_resolve_lmp_links();

-- Backfill links for all existing LMPs
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.lmp_processes LOOP
    PERFORM public.resolve_lmp_poc_links(r.id);
  END LOOP;
END $$;

-- Refresh links whenever a new alias is added (so historical LMPs auto-link)
CREATE OR REPLACE FUNCTION public.trg_alias_backfill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.lmp_processes
    WHERE lower(coalesce(prep_poc,'')) LIKE '%'||NEW.alias_norm||'%'
       OR lower(coalesce(support_poc,'')) LIKE '%'||NEW.alias_norm||'%'
       OR lower(coalesce(outreach_poc,'')) LIKE '%'||NEW.alias_norm||'%'
  LOOP
    PERFORM public.resolve_lmp_poc_links(r.id);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_alias_backfill_after_insert
AFTER INSERT ON public.poc_aliases
FOR EACH ROW EXECUTE FUNCTION public.trg_alias_backfill();

-- ============ C. Live stats views ============
CREATE OR REPLACE VIEW public.poc_lmp_stats AS
SELECT
  p.id AS poc_id,
  p.name,
  p.role_type,
  count(*) FILTER (WHERE l.id IS NOT NULL) AS total_lmps,
  count(*) FILTER (WHERE k.role = 'prep') AS prep_count,
  count(*) FILTER (WHERE k.role = 'support') AS support_count,
  count(*) FILTER (WHERE k.role = 'outreach') AS outreach_count,
  count(*) FILTER (WHERE l.status ILIKE 'ongoing%') AS ongoing,
  count(*) FILTER (WHERE l.status ILIKE 'converted%') AS converted,
  count(*) FILTER (WHERE l.status ILIKE 'offer%') AS offer_received,
  count(*) FILTER (WHERE l.status ILIKE 'dormant%') AS dormant,
  count(*) FILTER (WHERE l.status ILIKE 'on hold%' OR l.status ILIKE 'on_hold%') AS on_hold,
  count(*) FILTER (WHERE l.status ILIKE 'closed%' OR l.status ILIKE 'not converted%') AS closed
FROM public.poc_profiles p
LEFT JOIN public.lmp_poc_links k ON k.poc_id = p.id
LEFT JOIN public.lmp_processes l ON l.id = k.lmp_id
GROUP BY p.id, p.name, p.role_type;

CREATE OR REPLACE VIEW public.student_lmp_stats AS
SELECT
  s.id AS student_id,
  s.name,
  s.roll_no,
  count(*) FILTER (WHERE c.id IS NOT NULL) AS total_lmps,
  count(*) FILTER (WHERE l.status ILIKE 'ongoing%') AS active_lmps,
  count(*) FILTER (WHERE l.status ILIKE 'converted%' OR l.status ILIKE 'offer%') AS converted_lmps
FROM public.students s
LEFT JOIN public.lmp_candidates c ON c.student_id = s.id
LEFT JOIN public.lmp_processes l ON l.id = c.lmp_id
GROUP BY s.id, s.name, s.roll_no;

GRANT SELECT ON public.poc_lmp_stats TO authenticated;
GRANT SELECT ON public.student_lmp_stats TO authenticated;

-- ============ D. Cleanup duplicates ============
DROP TABLE IF EXISTS public.poc_registry CASCADE;
DROP TABLE IF EXISTS public.lmp_students CASCADE;
DROP TABLE IF EXISTS public.sheets_sync_log CASCADE;
