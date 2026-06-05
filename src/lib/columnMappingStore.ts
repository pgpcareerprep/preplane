// Shared (DB-backed) column mapping persistence for CSV uploads.
// Stored in field_mapping_registry under tab_name = `csv:<source>`.
// One row per CSV header. sheet_column = csvColumn, app_field = dbField.

import { supabase } from "@/integrations/supabase/client";
import type { ColumnMapping } from "@/lib/mentorUpload";
import type { DataSourceType } from "@/lib/hooks/useDbData";

export type CsvSource = DataSourceType | "poc_db";

const tabFor = (source: CsvSource) => `csv:${source}`;

export async function loadSavedMapping(source: CsvSource): Promise<ColumnMapping[] | null> {
  const { data, error } = await supabase
    .from("field_mapping_registry")
    .select("sheet_column, app_field")
    .eq("tab_name", tabFor(source));
  if (error) {
    console.warn("[columnMappingStore] load failed:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data
    .filter((r) => r.sheet_column)
    .map((r) => ({ csvColumn: r.sheet_column as string, dbField: (r.app_field as string) || "" }));
}

export async function saveMapping(
  source: CsvSource,
  mapping: ColumnMapping[],
  adminEmail?: string,
): Promise<void> {
  const tab_name = tabFor(source);
  // Replace strategy: delete existing rows for this source, then insert current mapping.
  const { error: delErr } = await supabase
    .from("field_mapping_registry")
    .delete()
    .eq("tab_name", tab_name);
  if (delErr) {
    console.warn("[columnMappingStore] clear failed:", delErr.message);
    throw delErr;
  }
  const rows = mapping
    .filter((m) => m.csvColumn)
    .map((m) => ({
      tab_name,
      sheet_column: m.csvColumn,
      app_field: m.dbField || null,
      sync_direction: "read" as const,
      is_mapped: !!m.dbField,
      notes: adminEmail ? `Saved by ${adminEmail}` : null,
      last_verified_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("field_mapping_registry").insert(rows);
  if (error) {
    console.warn("[columnMappingStore] insert failed:", error.message);
    throw error;
  }
}

export async function clearMapping(source: CsvSource): Promise<void> {
  const { error } = await supabase
    .from("field_mapping_registry")
    .delete()
    .eq("tab_name", tabFor(source));
  if (error) throw error;
}
