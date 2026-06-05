-- 1) Idempotent reconciler: keep entity_registry POC rows in lockstep with poc_profiles.
CREATE OR REPLACE FUNCTION public.reconcile_poc_entity_registry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
  v_upserted int := 0;
  v_total int := 0;
BEGIN
  -- Drop orphan POC rows (no matching poc_profiles row).
  DELETE FROM public.entity_registry er
  WHERE er.entity_type = 'poc'
    AND NOT EXISTS (
      SELECT 1 FROM public.poc_profiles p WHERE p.id::text = er.entity_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Refresh / insert from canonical source.
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
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  SELECT count(*) INTO v_total FROM public.entity_registry WHERE entity_type='poc';

  -- Audit trail in existing sync events table.
  INSERT INTO public.sheet_sync_events
    (tab_name, operation, direction, status, field_count, synced_by, fields_synced)
  VALUES
    ('entity_registry', 'reconcile', 'internal', 'success',
     v_deleted + v_upserted, 'cron',
     jsonb_build_object('deleted', v_deleted, 'upserted', v_upserted, 'total_after', v_total));

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'upserted', v_upserted,
    'total_after', v_total,
    'ran_at', now()
  );
END;
$$;

-- 2) Enable pg_cron (no-op if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;