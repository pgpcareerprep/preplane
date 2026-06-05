
-- 1. Extend aliases for existing domains to cover real POC strings
UPDATE public.domains SET aliases = array(SELECT DISTINCT lower(x) FROM unnest(aliases || ARRAY['founder''s office/chief of staff','founders office/chief of staff','chief of staff','founder''s office / chief of staff']) x) WHERE slug = 'fo-cos';
UPDATE public.domains SET aliases = array(SELECT DISTINCT lower(x) FROM unnest(aliases || ARRAY['human resource']) x) WHERE slug = 'hr';
UPDATE public.domains SET aliases = array(SELECT DISTINCT lower(x) FROM unnest(aliases || ARRAY['supply and operations']) x) WHERE slug = 'supply-operations';

-- 2. Add General Management domain
INSERT INTO public.domains (name, slug, aliases)
VALUES ('General Management', 'general-management', ARRAY['general management','gm','generalist'])
ON CONFLICT DO NOTHING;

-- 3. Backfill poc_profiles.primary_domain and domain_tags to canonical domain names
CREATE OR REPLACE FUNCTION public.canonicalize_domain(_raw text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.name FROM public.domains d
  WHERE _raw IS NOT NULL AND (
    lower(trim(_raw)) = lower(d.name)
    OR lower(trim(_raw)) = ANY(d.aliases)
  )
  LIMIT 1
$$;

UPDATE public.poc_profiles
SET primary_domain = COALESCE(public.canonicalize_domain(primary_domain), primary_domain)
WHERE primary_domain IS NOT NULL;

UPDATE public.poc_profiles p
SET domain_tags = sub.tags
FROM (
  SELECT id,
    ARRAY(
      SELECT DISTINCT COALESCE(public.canonicalize_domain(t), t)
      FROM unnest(domain_tags) t
      WHERE COALESCE(public.canonicalize_domain(t), t) IS NOT NULL
    ) AS tags
  FROM public.poc_profiles
  WHERE domain_tags IS NOT NULL AND array_length(domain_tags, 1) > 0
) sub
WHERE p.id = sub.id;

-- 4. Delete stray typo'd inactive POC row
DELETE FROM public.poc_profiles
WHERE email = 'sonali.awasthi@masterunion.org' AND status = 'inactive';
