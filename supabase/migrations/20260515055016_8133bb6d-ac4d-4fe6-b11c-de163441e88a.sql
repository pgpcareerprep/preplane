
DROP TRIGGER IF EXISTS trg_sync_poc_registry ON public.poc_profiles;
DROP TRIGGER IF EXISTS trg_sync_lmp_registry ON public.lmp_processes;

DROP FUNCTION IF EXISTS public.sync_poc_to_entity_registry() CASCADE;
DROP FUNCTION IF EXISTS public.sync_lmp_to_entity_registry() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_entity_registry() CASCADE;
DROP FUNCTION IF EXISTS public.reconcile_poc_entity_registry() CASCADE;

DROP TABLE IF EXISTS public.entity_registry CASCADE;

INSERT INTO public.system_settings (key, value, updated_by)
VALUES (
  'entity_registry.dropped',
  jsonb_build_object('dropped_at', now()::text, 'replacement', 'entity-search now queries live source tables via UNION'),
  'phase5_migration'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = 'phase5_migration';
