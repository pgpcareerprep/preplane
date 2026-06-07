-- Wire jd_url → "JD" sheet column in the field_mapping_registry so the
-- Mapping Inspector shows it as wired instead of "registry only".
-- The code-side wiring is done in fieldMap.ts (both edge function + frontend).
INSERT INTO public.field_mapping_registry
  (tab_name, sheet_column, app_field, sync_direction, is_mapped, notes)
VALUES
  ('LMP Tracker', 'JD', 'jd_url', 'db_to_sheet', true, 'JD URL attached to the LMP process')
ON CONFLICT (tab_name, sheet_column) DO UPDATE
  SET app_field      = EXCLUDED.app_field,
      sync_direction = EXCLUDED.sync_direction,
      is_mapped      = EXCLUDED.is_mapped,
      notes          = EXCLUDED.notes;
