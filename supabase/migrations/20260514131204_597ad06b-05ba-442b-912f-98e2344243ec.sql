-- Schedule the reconciler. Unschedule first to stay idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-poc-entity-registry');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reconcile-poc-entity-registry',
  '*/15 * * * *',
  $$ SELECT public.reconcile_poc_entity_registry(); $$
);