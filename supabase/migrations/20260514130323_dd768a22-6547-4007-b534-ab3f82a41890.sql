-- Delete stale POC rows in entity_registry that don't correspond to a real poc_profiles row.
-- The 67 entries included misspellings, duplicates, and free-text from lmp_processes columns
-- (e.g., "abhinav", "Dibyendu ji", "campaigns for Sun Pharma"). The 15 active POCs in
-- poc_profiles are the source of truth.
DELETE FROM public.entity_registry er
WHERE er.entity_type = 'poc'
  AND NOT EXISTS (
    SELECT 1 FROM public.poc_profiles p
    WHERE p.id::text = er.entity_id
  );

-- Reseed any missing rows from poc_profiles (idempotent, in case any are missing).
INSERT INTO public.entity_registry
  (entity_type, entity_id, display_name, email, domain, source_table, source_priority, metadata)
SELECT 'poc', p.id::text, p.name, NULLIF(p.email,''), p.primary_domain,
       'poc_profiles', 80,
       jsonb_build_object(
         'role_type', p.role_type,
         'active_load', p.active_load,
         'domain_tags', p.domain_tags,
         'conversion_rate', p.conversion_rate
       )
FROM public.poc_profiles p
WHERE p.name IS NOT NULL AND p.name <> ''
ON CONFLICT (entity_type, entity_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  domain = EXCLUDED.domain,
  metadata = EXCLUDED.metadata,
  updated_at = now();