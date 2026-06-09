-- entity_registry was intentionally dropped in Phase 5 and replaced by live
-- UNION queries in the entity-search edge function. A later migration
-- accidentally recreated reconcile_poc_entity_registry() and its cron job,
-- causing "relation public.entity_registry does not exist" every 15 minutes.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'reconcile-poc-entity-registry';

DROP FUNCTION IF EXISTS public.reconcile_poc_entity_registry() CASCADE;

DO $$
BEGIN
  IF to_regclass('public.entity_registry') IS NOT NULL THEN
    RAISE EXCEPTION 'entity_registry unexpectedly exists; Phase 5 live-source search should be authoritative';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE command ILIKE '%entity_registry%'
  ) THEN
    RAISE EXCEPTION 'A cron job still references the removed entity_registry table';
  END IF;
END;
$$;
