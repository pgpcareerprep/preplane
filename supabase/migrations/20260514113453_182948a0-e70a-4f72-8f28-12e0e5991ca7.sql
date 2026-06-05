-- Auto-sync entity_registry when poc_profiles are inserted/updated/deleted
CREATE OR REPLACE FUNCTION public.sync_poc_to_entity_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.entity_registry
    WHERE entity_type = 'poc' AND entity_id = OLD.id::text;
    RETURN OLD;
  END IF;
  INSERT INTO public.entity_registry
    (entity_type, entity_id, display_name, email, domain, source_table, source_priority, metadata)
  VALUES (
    'poc',
    NEW.id::text,
    NEW.name,
    NULLIF(NEW.email, ''),
    NEW.primary_domain,
    'poc_profiles',
    80,
    jsonb_build_object(
      'role_type', NEW.role_type,
      'active_load', NEW.active_load,
      'domain_tags', NEW.domain_tags,
      'conversion_rate', NEW.conversion_rate
    )
  )
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    domain = EXCLUDED.domain,
    metadata = EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_poc_registry ON public.poc_profiles;
CREATE TRIGGER trg_sync_poc_registry
  AFTER INSERT OR UPDATE OR DELETE ON public.poc_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_poc_to_entity_registry();

CREATE OR REPLACE FUNCTION public.sync_lmp_to_entity_registry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.entity_registry WHERE entity_type = 'lmp' AND entity_id = OLD.id::text;
    RETURN OLD;
  END IF;
  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, domain, source_table, source_priority, metadata)
  VALUES (
    'lmp', NEW.id::text,
    (NEW.company || ' - ' || NEW.role),
    NEW.domain_raw, 'lmp_processes', 90,
    jsonb_build_object('company', NEW.company, 'role', NEW.role, 'status', NEW.status,
      'prep_poc', NEW.prep_poc, 'outreach_poc', NEW.outreach_poc)
  )
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, domain = EXCLUDED.domain,
    metadata = EXCLUDED.metadata, updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lmp_registry ON public.lmp_processes;
CREATE TRIGGER trg_sync_lmp_registry
  AFTER INSERT OR UPDATE OR DELETE ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.sync_lmp_to_entity_registry();