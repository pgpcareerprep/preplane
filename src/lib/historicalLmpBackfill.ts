import Papa from "papaparse";
import { DB_TO_SHEET } from "@/lib/sheets/fieldMap";
import { SHEET_STATUS_TO_DB } from "../../supabase/functions/_shared/fieldMap";

export type HistoricalLmpPatch = Record<string, string | number | boolean | null>;

export type HistoricalLmpExisting = HistoricalLmpPatch & {
  id: string;
  lmp_code?: string | null;
};

export type HistoricalLmpPlanRow = {
  rowNumber: number;
  action: "insert" | "update" | "skip" | "ambiguous";
  identity: string;
  patch: HistoricalLmpPatch;
  existingId?: string;
  existingLmpCode?: string | null;
  changedFields: string[];
  reason?: string;
};

export type HistoricalLmpDryRun = {
  totalRows: number;
  inserts: number;
  updates: number;
  skipped: number;
  ambiguous: number;
  unmappedColumns: string[];
  errors: string[];
  rows: HistoricalLmpPlanRow[];
  commitRows: Array<{ row_number: number; patch: HistoricalLmpPatch }>;
};

const FIELD_TYPES: Record<string, "boolean" | "number" | "date" | "text"> = {
  prep_doc_shared: "boolean",
  mentor_aligned: "boolean",
  assignment_review: "boolean",
  one_to_one_mock: "boolean",
  mentor_rating: "number",
  date: "date",
  next_progress_date: "date",
  closing_date: "date",
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const canonicalHeaderMap = new Map<string, string>(
  Object.entries(DB_TO_SHEET).map(([dbColumn, sheetHeader]) => [
    normalizeHeader(sheetHeader),
    dbColumn,
  ]),
);

canonicalHeaderMap.set(normalizeHeader("Comment"), "comments");
canonicalHeaderMap.set(normalizeHeader("Comments"), "comments");

const statusMap = new Map<string, string>(
  Object.entries(SHEET_STATUS_TO_DB).map(([label, slug]) => [
    normalizeHeader(label),
    slug,
  ]),
);

const normalizeIdentityPart = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function normalizeHistoricalLmpDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const namedDate = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (namedDate) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(namedDate[2].slice(0, 3).toLowerCase());
    if (month >= 0) {
      return `${namedDate[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(namedDate[1])).padStart(2, "0")}`;
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseBoolean(value: unknown): boolean | null {
  const normalized = normalizeIdentityPart(value);
  if (!normalized) return null;
  if (["true", "yes", "1", "checked"].includes(normalized)) return true;
  if (["false", "no", "0", "unchecked"].includes(normalized)) return false;
  return null;
}

function parseFieldValue(dbColumn: string, value: unknown): string | number | boolean | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (dbColumn === "status") return statusMap.get(normalizeHeader(text)) ?? normalizeIdentityPart(text).replace(/\s+/g, "-");
  if (FIELD_TYPES[dbColumn] === "boolean") return parseBoolean(text);
  if (FIELD_TYPES[dbColumn] === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (FIELD_TYPES[dbColumn] === "date") return normalizeHistoricalLmpDate(text);
  return text;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function mapHistoricalLmpCsvRow(row: Record<string, unknown>): HistoricalLmpPatch {
  const patch: HistoricalLmpPatch = {};
  for (const [header, value] of Object.entries(row)) {
    const dbColumn = canonicalHeaderMap.get(normalizeHeader(header));
    if (!dbColumn) continue;
    const parsed = parseFieldValue(dbColumn, value);
    if (!isBlank(parsed)) patch[dbColumn] = parsed;
  }
  return patch;
}

function identityFor(patch: HistoricalLmpPatch): string {
  if (!isBlank(patch.lmp_code)) return `LMP ID ${String(patch.lmp_code).trim()}`;
  return [patch.company, patch.role, patch.date].map(normalizeIdentityPart).join(" | ");
}

function exactHistoricalMatch(existing: HistoricalLmpExisting, patch: HistoricalLmpPatch): boolean {
  return normalizeIdentityPart(existing.company) === normalizeIdentityPart(patch.company)
    && normalizeIdentityPart(existing.role) === normalizeIdentityPart(patch.role)
    && normalizeHistoricalLmpDate(existing.date) === normalizeHistoricalLmpDate(patch.date);
}

export function planHistoricalLmpBackfill(
  csvText: string,
  existingRows: HistoricalLmpExisting[],
): HistoricalLmpDryRun {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  const unmappedColumns = headers.filter((header) => !canonicalHeaderMap.has(normalizeHeader(header)));
  const errors = parsed.errors.map((error) => `CSV row ${error.row == null ? "?" : error.row + 2}: ${error.message}`);
  const rows: HistoricalLmpPlanRow[] = [];

  parsed.data.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const patch = mapHistoricalLmpCsvRow(rawRow);
    const identity = identityFor(patch);
    if (isBlank(patch.company) || isBlank(patch.role)) {
      rows.push({ rowNumber, action: "skip", identity, patch, changedFields: [], reason: "Company and Role are required" });
      return;
    }

    let matches: HistoricalLmpExisting[] = [];
    if (!isBlank(patch.lmp_code)) {
      matches = existingRows.filter((row) => normalizeIdentityPart(row.lmp_code) === normalizeIdentityPart(patch.lmp_code));
    } else if (!isBlank(patch.date)) {
      matches = existingRows.filter((row) => exactHistoricalMatch(row, patch));
    }

    if (matches.length > 1) {
      rows.push({ rowNumber, action: "ambiguous", identity, patch, changedFields: [], reason: `${matches.length} exact DB matches found` });
      return;
    }
    if (matches.length === 0) {
      rows.push({ rowNumber, action: "insert", identity, patch, changedFields: Object.keys(patch) });
      return;
    }

    const existing = matches[0];
    const changedFields = Object.entries(patch)
      .filter(([column, value]) => column !== "lmp_code" && !isBlank(value) && isBlank(existing[column]))
      .map(([column]) => column);
    rows.push({
      rowNumber,
      action: changedFields.length ? "update" : "skip",
      identity,
      patch,
      existingId: existing.id,
      existingLmpCode: existing.lmp_code,
      changedFields,
      reason: changedFields.length ? undefined : "Exact match has no blank fields to fill",
    });
  });

  return {
    totalRows: parsed.data.length,
    inserts: rows.filter((row) => row.action === "insert").length,
    updates: rows.filter((row) => row.action === "update").length,
    skipped: rows.filter((row) => row.action === "skip").length,
    ambiguous: rows.filter((row) => row.action === "ambiguous").length,
    unmappedColumns,
    errors,
    rows,
    commitRows: rows
      .filter((row) => row.action === "insert" || row.action === "update")
      .map((row) => ({ row_number: row.rowNumber, patch: row.patch })),
  };
}

export function historicalLmpImporterUsesDirectSheetWrites(): boolean {
  return false;
}
