-- =============================================================================
-- Drop reconcile_poc_entity_registry() and its cron job.
--
-- The entity_registry table was permanently dropped in Phase 5 migration
-- 20260515055016 (DROP TABLE IF EXISTS public.entity_registry CASCADE).
-- Live entity lookups now use UNION queries in _shared/entitySearch.ts.
--
-- Migration 20260609200000 accidentally re-created this function (referencing
-- the dropped table), which causes the cron to fail every 15 minutes with:
--   ERROR: relation "public.entity_registry" does not exist
--
-- Fix: drop the function and unschedule the cron permanently.
-- =============================================================================

DO $$ BEGIN PERFORM cron.unschedule('reconcile-poc-entity-registry'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.reconcile_poc_entity_registry() CASCADE;
