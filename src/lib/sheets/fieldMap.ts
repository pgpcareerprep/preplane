/**
 * Browser-facing helpers built on the canonical Sheet contract used by Edge
 * Functions. Keeping the maps in one module makes map drift impossible.
 */
import {
  DB_TO_SHEET,
  SHEET_STATUS_TO_DB,
} from "../../../supabase/functions/_shared/fieldMap";

export {
  DB_STATUS_TO_SHEET,
  DB_TO_SHEET,
  normalizeStatusForSheet,
  SHEET_TO_DB,
  sheetPatchToDbPatch,
} from "../../../supabase/functions/_shared/fieldMap";

const SHEET_HEADER_TO_DB: Record<string, string> = Object.fromEntries(
  Object.entries(DB_TO_SHEET).map(([db, header]) => [header, db]),
);

/** Translate a trusted app-originated Sheet-header patch back to DB columns. */
export function appPatchToDbPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(patch)) {
    const col = SHEET_HEADER_TO_DB[header];
    if (!col) continue;
    out[col] = col === "status" && typeof value === "string"
      ? SHEET_STATUS_TO_DB[value] ?? value
      : value;
  }
  return out;
}
