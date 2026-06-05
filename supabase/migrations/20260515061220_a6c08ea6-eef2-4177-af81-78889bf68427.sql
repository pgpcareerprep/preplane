-- Drop leftover lookup/duplicate tables (Phase 5 final).
-- Both are empty and no longer needed once their consumers are refactored.
DROP TABLE IF EXISTS public.poc_allocation_mappings CASCADE;
DROP TABLE IF EXISTS public.copilot_pending_actions CASCADE;

INSERT INTO public.system_settings (key, value, updated_by, updated_at)
VALUES (
  'phase5.dropped_tables',
  jsonb_build_object(
    'dropped_at', now(),
    'tables', jsonb_build_array('poc_allocation_mappings', 'copilot_pending_actions'),
    'reason', 'Lock Copilot + @mention to 7 canonical data sources; derive allocation live from poc_profiles; inline copilot confirmation.'
  ),
  'system',
  now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = 'system';